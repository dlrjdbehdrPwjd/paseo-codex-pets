const electron=require('electron'),{app,ipcMain,BrowserWindow,nativeTheme,Menu}=electron;
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const {createDesktopHost}=require('./desktop.cjs');
const {createLocalAttachments}=require('./local-attachments.cjs');
const {createHostCommands}=require('./commands.cjs');
const {createPeer,encodeSpeech,validateChildGroups}=require('../plugin/server/protocol.cjs');
const {createOriginalVoiceReservation}=require('../voice/reservation.cjs');
const {createSettingsWindow}=require('./settings-window.cjs');
const appRoot=path.resolve(__dirname,'..'),configFile=process.env.PASEO_PET_CONFIG??path.join(appRoot,'runtime-config.json');
const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
app.setName('파세오 바탕화면 펫');app.setPath('userData',config.userData);
if(!app.requestSingleInstanceLock()){app.exit(0);}else{void start();}
async function start(){
 const logFile=path.join(config.userData,'runtime.jsonl');fs.mkdirSync(config.userData,{recursive:true});
 const log=value=>fs.appendFileSync(logFile,JSON.stringify({at:new Date().toISOString(),...value})+'\n');
 let host,settingsWindow,reservation,rendererReady=false,sessions=[],shutdown=false;
 const commands=createHostCommands({quit:()=>app.quit()});
 let backendSnapshot={connected:false,sessions:[],childGroups:{},preferences:{},capabilities:{quickChat:true,dictation:false},latestTurnItems:{}},settingsSnapshot;
 if(!process.send||!process.env.PASEO_PET_INSTANCE)throw Error('펫은 서버 플러그인이 실행해야 합니다.');
 const peer=createPeer({channel:process,instanceId:process.env.PASEO_PET_INSTANCE,onError:error=>log({ipcError:String(error)}),handle:async(method)=>{
  if(!reservation)throw Error('원본 음성 예약 창이 준비되지 않았습니다.');
  if(method==='reservation.start')return reservation.start({start:()=>peer.request('reservation.activate',[]),cancel:reason=>peer.request('reservation.deactivate',[reason])});
  if(method==='reservation.complete')return reservation.complete();
  if(method==='reservation.cancel')return reservation.cancel();
  if(method==='reservation.dispose')return reservation.dispose();
  throw Error('허용되지 않은 호스트 요청: '+method);
 },onEvent:async(name,value)=>{
  if(name==='service.snapshot'){backendSnapshot=value;sessions=value.sessions;publish();}
  else if(name==='settings.changed'){
   if(settingsSnapshot){settingsSnapshot.values[value.key]=value.effective;if(value.configured===undefined)delete settingsSnapshot.configuredValues[value.key];else settingsSnapshot.configuredValues[value.key]=value.configured;}
   if(value.key==='pet-visibility')host?.manager.setVisibilityMode(value.effective);
   for(const win of allWindows())win.webContents.send('rebuild:settings-event',value);publish();
  }else if(name==='pets.changed'){for(const win of allWindows())win.webContents.send('rebuild:pets-event',value);
  }else if(name==='speech.event'){
   if(process.env.PASEO_PET_VERIFY==='1')verificationSpeechEvents.push(value);
   if(value.type==='audio-output'&&Buffer.isBuffer(value.payload?.audio))value={...value,payload:{...value.payload,audio:value.payload.audio.toString('base64')}};
   for(const win of host?.windows??[])win.webContents.send('rebuild:voice-event',value);
  }else if(name==='host.command'){
   await commands.handle(value.action);
  }else throw Error('허용되지 않은 호스트 이벤트: '+name);
 }});
 const speech={request:(method,args)=>peer.request(method,encodeSpeech(method,args)),dispose:()=>peer.request('speech.voice.stop',{})};
 const originalSettings={readAll:()=>settingsSnapshot,write:(key,value)=>value===undefined?peer.request('settings.delete',[key]):peer.request('settings.write',[key,value]),dispose:async()=>{}};
 const attachments=createLocalAttachments({directory:process.env.PASEO_PET_TEMP,request:(method,args)=>peer.request(method,args)});
 const pendingShutdown=new Map();
 const cleanupRenderers=()=>Promise.all(allWindows().map(win=>new Promise(resolve=>{const id=win.webContents.id;const finish=()=>{clearTimeout(timer);pendingShutdown.delete(id);resolve();};const timer=setTimeout(()=>{log({shutdownRendererTimeout:id});finish();},3000);pendingShutdown.set(id,finish);win.webContents.send('rebuild:shutdown');})));
 const allWindows=()=>[...(host?.windows??[]),...(settingsWindow?.window?[settingsWindow.window]:[])].filter(win=>!win.isDestroyed());
 let verificationSessions,verificationChildGroups;const verificationSpeechEvents=[],verificationChildOpenRequests=[];
 const snapshot=()=>({...backendSnapshot,sessions:verificationSessions??backendSnapshot.sessions,childGroups:verificationChildGroups??backendSnapshot.childGroups??{}});
 const publish=()=>{const value=snapshot();for(const win of allWindows())win.webContents.send('rebuild:backend-state',value);settingsWindow?.window?.webContents.send('rebuild:view-message',{type:'avatar-overlay-open-state-changed',isOpen:host?.manager.isOpen()??false});const status={pid:process.pid,rendererReady,connected:backendSnapshot.connected,visible:[...(host?.windows??[])].some(win=>!win.isDestroyed()&&win.isVisible()),updatedAt:new Date().toISOString()};fs.writeFileSync(path.join(config.userData,'runtime-status.json'),JSON.stringify(status));void peer.notify('pet.status',{...status,agents:sessions.length}).catch(()=>{});};
 const sources={};for(const [key,relative]of Object.entries(config.sources))sources[key]=pathToFileURL(path.resolve(appRoot,relative)).href;
 const guard=event=>{if(!host?.ownsEvent(event)&&!settingsWindow?.ownsEvent(event))throw Error('Untrusted pet renderer');};
 const sessionId=crypto.randomUUID();
 if(process.env.PASEO_PET_VERIFY==='1'){
  if(process.env.PASEO_PET_VERIFY_INPUT!=='1')app.on('web-contents-created',(_event,wc)=>wc.on('before-mouse-event',event=>event.preventDefault()));
  process.on('message',async message=>{
   if(message?.type!=='pet:verify'||!host)return;
   try{const win=[...host.windows][0];if(!win)throw Error('Pet window is not ready');let result;
    if(message.action==='pointer-inspect'){const m=host.manager;result={bounds:win.getContentBounds(),anchor:m.anchor,layout:m.layout,dragState:m.dragState,pointerInteractive:m.pointerInteractive,passthrough:m.mousePassthroughMode,shape:m.inputShape,ready:m.rendererReady,supportsInputShape:m.supportsInputShape,cursor:electron.screen.getCursorScreenPoint(),dom:await win.webContents.executeJavaScript(`(()=>{const e=document.querySelector('[data-codex-pet-id]'),r=e?.getBoundingClientRect();return {rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,html:e?.outerHTML.slice(0,1000)}})()`)};}
    else if(message.action==='ui-set-sessions'){if(!Array.isArray(message.sessions))throw Error('Expected verification sessions');verificationSessions=message.sessions;verificationChildGroups=validateChildGroups(message.childGroups??{});publish();result=true;}
    else if(message.action==='ui-child-open-requests')result=verificationChildOpenRequests;
    else if(message.action==='ui-eval')result=await win.webContents.executeJavaScript(message.script);
    else if(message.action==='cards-inspect'){result=await win.webContents.executeJavaScript(`(()=>{const inspect=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{tag:e.tagName,classes:e.className,text:e.textContent,attributes:[...e.attributes].map(a=>[a.name,a.value]),rect:{x:r.x,y:r.y,width:r.width,height:r.height},fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,padding:s.padding,margin:s.margin,gap:s.gap,display:s.display,transform:s.transform,color:s.color,borderRadius:s.borderRadius,lineClamp:s.webkitLineClamp}};return [...document.querySelectorAll('[class*="_activityPill_"]')].map(e=>({outer:inspect(e),nodes:[...e.querySelectorAll('div,span,svg,button')].map(inspect)}))})()`);}
    else if(message.action==='ui-inspect'){result=await win.webContents.executeJavaScript(`(()=>{const style=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return{tag:e.tagName,classes:e.className,markup:e.outerHTML.slice(0,3500),rect:{x:r.x,y:r.y,width:r.width,height:r.height},fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,gap:s.gap,padding:s.padding,borderRadius:s.borderRadius,color:s.color,background:s.background,boxShadow:s.boxShadow}};return{htmlAttributes:[...document.documentElement.attributes].map(a=>[a.name,a.value]),body:style(document.body),root:style(document.getElementById('root')),cards:[...document.querySelectorAll('[data-avatar-overlay-native-surface-id]')].map(e=>({id:e.getAttribute('data-avatar-overlay-native-surface-id'),...style(e),children:[...e.querySelectorAll('button,span,p')].slice(0,20).map(e=>({text:e.textContent?.slice(0,100),...style(e)}))})),buttons:[...document.querySelectorAll('button')].map(e=>({label:e.getAttribute('aria-label'),...style(e),ancestors:[e.parentElement,e.parentElement?.parentElement,e.parentElement?.parentElement?.parentElement].filter(Boolean).map(style)}))}})()`);}
    else if(message.action==='pointer-record'){result=await win.webContents.executeJavaScript(`(()=>{window.pointerRecords=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,e=>{window.pointerRecords.push({type:e.type,x:e.clientX,y:e.clientY,screenX:e.screenX,screenY:e.screenY,buttons:e.buttons,pointerId:e.pointerId,target:e.target?.tagName});if(window.pointerRecords.length>80)window.pointerRecords.shift();},true);return true})()`);}
    else if(message.action==='pointer-records'){result=await win.webContents.executeJavaScript('window.pointerRecords');}
    else if(message.action==='pointer-input'){win.webContents.sendInputEvent(message.event);result=true;}
    else if(message.action==='settings-open'){await win.webContents.executeJavaScript(`window.electronBridge.sendMessageFromView({type:'show-settings',section:'pets'})`);result=true;}
    else if(message.action==='settings-inspect')result=await settingsWindow.window.webContents.executeJavaScript(`({body:document.body.innerText,fontFamily:getComputedStyle(document.body).fontFamily,buttons:[...document.querySelectorAll('button')].map(b=>({text:b.innerText,disabled:b.disabled})),size:document.querySelector('#pet-size')?.value})`);
    else if(message.action==='settings-select')result=await settingsWindow.window.webContents.executeJavaScript(`(()=>{const name=${JSON.stringify(message.name)};let e=[...document.querySelectorAll('*')].find(e=>e.childElementCount===0&&e.textContent===name);while(e&&!e.querySelector('button'))e=e.parentElement;const b=e?.querySelector('button');if(!b||b.disabled)throw Error('Original selectable avatar row unavailable: '+name);b.click();return true})()`);
    else if(message.action==='settings-size')result=await settingsWindow.window.webContents.executeJavaScript(`(()=>{const e=document.querySelector('#pet-size');if(!e)throw Error('Original size slider unavailable');e.value=${JSON.stringify(String(message.value))};e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    else if(message.action==='settings-screenshot'){await fs.promises.writeFile(message.path,(await settingsWindow.window.webContents.capturePage()).toPNG());result=true;}
    else if(message.action==='settings-read')result=originalSettings.readAll();
    else if(message.action==='speech-events')result=verificationSpeechEvents;
    else if(message.action==='renderer-speech-record')result=await win.webContents.executeJavaScript(`import('./renderer/host-api.mjs').then(({getHostApi})=>{window.verificationSpeechEvents=[];getHostApi().speech.subscribe(value=>window.verificationSpeechEvents.push(value));return true;})`);
    else if(message.action==='renderer-speech-events')result=await win.webContents.executeJavaScript('window.verificationSpeechEvents');
    else if(message.action==='speech-request')result=message.renderer===true?await win.webContents.executeJavaScript(`import('./renderer/host-api.mjs').then(({getHostApi})=>getHostApi().speech.request(${JSON.stringify(message.method)},${JSON.stringify(message.args)}))`):await speech.request(message.method,message.args);
    else if(message.action==='pet-inspect')result=await win.webContents.executeJavaScript(`({sprites:[...document.querySelectorAll('[data-codex-pet-id]')].map(e=>({id:e.getAttribute('data-codex-pet-id'),width:e.getBoundingClientRect().width})),html:document.querySelector('[data-codex-pet-id]')?.outerHTML?.slice(0,1800)})`);
    else if(message.action==='inspect')result=await win.webContents.executeJavaScript(`({sprite:!!document.querySelector('[data-codex-pet-id]'),editor:document.querySelector('.ProseMirror')?.innerText,buttons:[...document.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')),body:document.body.innerText.slice(0,3000)})`);
    else if(message.action==='new-chat')result=await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector('button[data-quick-chat-control]:not([disabled])');if(!b)throw Error('New chat control not ready');b.click();return true})()`);
    else if(message.action==='type'){await win.webContents.insertText(message.text);result=true;}
    else if(message.action==='replace-text'){await win.webContents.executeJavaScript(`(()=>{const e=document.querySelector('.ProseMirror');e.focus();document.execCommand('selectAll');})()`);await win.webContents.insertText(message.text);result=true;}
    else if(message.action==='submit')result=await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector('button[aria-label="메시지 보내기"]');if(!b||b.disabled)throw Error('Original submit button not ready: '+JSON.stringify([...document.querySelectorAll('button')].map(b=>({label:b.getAttribute('aria-label'),type:b.type,disabled:b.disabled}))));b.click();return true})()`);
    else if(message.action==='screenshot'){await fs.promises.writeFile(message.path,(await win.webContents.capturePage()).toPNG());result=true;}
    else if(message.action==='paste-image')result=await win.webContents.executeJavaScript(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(message.base64)}),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],"probe.png",{type:"image/png"}));const e=new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true});document.querySelector(".ProseMirror").dispatchEvent(e);return true})()`);
    else throw Error('Unknown verification action');
    process.send?.({type:'pet:verification',id:message.id,result});
   }catch(error){process.send?.({type:'pet:verification',id:message.id,error:error.stack??String(error)});}
  });
 }
 ipcMain.on('rebuild:attachment-grant',async(event,file)=>{try{guard(event);await attachments.grantPaths([file]);event.returnValue=true;}catch(error){log({attachmentGrantError:String(error)});event.returnValue=false;}});
 ipcMain.on('rebuild:bootstrap',event=>{guard(event);event.returnValue={shared:{},theme:nativeTheme.shouldUseDarkColors?'dark':'light',sessionId,userAgent:'Paseo Desktop Pet',flavor:'production',backend:snapshot(),initialState:{sources}};});
 ipcMain.on('rebuild:probe-result',(event,result)=>{guard(event);log({renderer:result});});
 ipcMain.handle('rebuild:context-menu',(event,items,position)=>{guard(event);return new Promise(resolve=>{let selected=null;const map=items=>items.map(item=>({...item,click:()=>{selected=item.id},...(item.submenu?{submenu:map(item.submenu)}:{})}));Menu.buildFromTemplate(map(items)).popup({window:BrowserWindow.fromWebContents(event.sender),...position,callback:()=>resolve(selected)});});});
 ipcMain.handle('rebuild:backend-request',async(event,{method,args=[]})=>{
  guard(event);if(method.startsWith('speech.'))return speech.request(method,args);if(!Array.isArray(args))throw Error('Invalid pet request');
  switch(method){
   case 'open-agent':{
    try{
     if(process.env.PASEO_PET_VERIFY==='1'&&verificationSessions){
      const [parentKey,agentId]=args;
      if(!verificationChildGroups?.[parentKey]?.children.some(child=>child.agentId===agentId))throw Object.assign(Error('해당 하위 대화를 찾을 수 없습니다.'),{code:'CHILD_AGENT_UNAVAILABLE'});
      verificationChildOpenRequests.push({parentKey,agentId});return{ok:true};
     }
     return await peer.request(method,args);
    }catch(error){return{ok:false,error:{code:error.code??'PET_REQUEST_FAILED',message:error.message??String(error)}};}
   }
   case 'child-groups.enable':return peer.request(method,args);
   case 'shutdown-ready':pendingShutdown.get(event.sender.id)?.();return;
   // 서버에서 받은 설정 스냅샷으로 기존 첫 렌더의 조회 지연을 유지한다. 저장은 서버가 소유한다.
   case 'settings.read-all':return settingsSnapshot;
   case 'settings.ready':if(!settingsWindow?.ownsEvent(event))throw Error('신뢰할 수 없는 설정 렌더러입니다.');settingsWindow.markReady();publish();return;
   case 'pets.open-directory':{
    const catalog=await peer.request('pets.list',[]),input=args[0];
    if(!input||input.target!=='fileManager'||typeof input.path!=='string'||path.resolve(input.path)!==path.resolve(catalog.directory))throw Error('펫 설치 폴더만 열 수 있습니다.');
    await fs.promises.mkdir(catalog.directory,{recursive:true});const error=await electron.shell.openPath(catalog.directory);return{success:!error};
   }
   case 'close':return host.manager.dismiss();
   case 'file-attachments.persist-image':return attachments.persistImageFileToTemp(args[0]);
   case 'quick-chat':return peer.request(method,await attachments.prepareArgs(args));
   // 경로 허용·초기화·예약 등 부모 전용 메서드를 렌더러가 직접 호출할 수 없게 한다.
   case 'pets.list':case 'pets.refresh':case 'settings.write':case 'settings.delete':case 'refresh':case 'open-main':case 'control':case 'action':case 'question':case 'product-event':case 'workspace-files.read-binary':
    await attachments.flush();return peer.request(method,args);
   default:throw Error('허용되지 않은 렌더러 서비스 요청: '+method);
  }
 });
 app.on('second-instance',()=>{if(host)void host.manager.open(undefined,{forcePetView:true});});
 process.on('disconnect',()=>app.quit());
 app.on('before-quit',event=>{if(shutdown)return;event.preventDefault();shutdown=true;void(async()=>{try{await cleanupRenderers();settingsWindow?.dispose();await originalSettings.dispose();await speech?.dispose();await attachments.dispose();await reservation?.dispose();}catch(error){log({shutdownError:String(error)});}finally{rendererReady=false;publish();app.quit();}})();});
 try{
  await app.whenReady();
  log({hostPhase:'Electron 준비 완료'});
  settingsWindow=createSettingsWindow({electron,preload:path.join(__dirname,'preload.cjs'),page:path.resolve(appRoot,config.settingsPage??'settings.html'),onEvent:event=>{log(event);publish();}});
  electron.session.defaultSession.setPermissionRequestHandler((_wc,permission,reply)=>reply(permission==='media'&&config.allowMicrophone===true));
  electron.session.defaultSession.webRequest.onBeforeRequest((details,reply)=>reply({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('data:')&&!details.url.startsWith('blob:')}));
  log({hostPhase:'서버 초기 상태 요청'});
  const initial=await peer.request('service.init',[]);backendSnapshot=initial.snapshot;sessions=backendSnapshot.sessions;settingsSnapshot=initial.settings;
  log({hostPhase:'서버 초기 상태 수신 완료'});
  host=createDesktopHost({electron,originalModule:path.resolve(appRoot,config.desktopModule),preload:path.join(__dirname,'preload.cjs'),page:path.resolve(appRoot,config.page),stateFile:path.join(config.userData,'native-state.json'),onPickedFiles:attachments.grantPaths,ownsAuxiliaryEvent:event=>settingsWindow.ownsEvent(event),onEvent:event=>{if(event.error||event.dragPerformance)log(event);if(event.message?.type==='rebuild-renderer-ready'){rendererReady=true;publish();}if(event.windowVisibility!==undefined)queueMicrotask(()=>{if(event.windowVisibility)void peer.notify('pet.ready',{}).catch(()=>{});publish();});},onViewMessage:(message,event)=>{
   switch(message.type){
    case 'open-current-main-window':return peer.request('open-main',[]);
    case 'show-settings':if(message.section!=='pets')throw Error('Unmapped settings section');return settingsWindow.open();
    case 'log-message':log({settingsLog:message});return;
    case 'avatar-overlay-open':return host.manager.toggle();
    case 'avatar-overlay-open-state-request':event.sender.send('rebuild:view-message',{type:'avatar-overlay-open-state-changed',isOpen:host.manager.isOpen()});return;
    default:throw Error('Unmapped view message: '+message.type);
   }
  }});
  host.manager.setOnDemandEnabled(true);
  host.manager.setVisibilityMode(originalSettings.readAll().values['pet-visibility']);
  reservation=createOriginalVoiceReservation({controller:host.original.getRealtimeController(host.manager),getOrigin:()=>host.manager.window?.webContents});
  reservation.subscribeTerminated(value=>{void peer.request('reservation.terminated',[{...value,error:value.error?{message:String(value.error.message??value.error)}:undefined}]).catch(()=>{});});
  await commands.ready({manager:host.manager,openSettings:()=>settingsWindow.open()});publish();
 }catch(error){log({fatal:error.stack??String(error)});console.error(error);app.exit(1);}
}
