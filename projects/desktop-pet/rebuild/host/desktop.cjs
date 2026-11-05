const fs=require('node:fs'),path=require('node:path'),{isDeepStrictEqual}=require('node:util');
const {installPointerFallback}=require('./pointer-fallback.cjs');
const {createWindowsElectronAdapter,attachWindowsInputShape}=require('./windows-input-shape.cjs');
const {createDragPerformance}=require('./drag-performance.cjs');
const {createDragPointer}=require('./drag-pointer.cjs');
function createDesktopHost({electron,originalModule,preload,page,stateFile,onViewMessage,onPickedFiles,ownsAuxiliaryEvent,onEvent=()=>{}}){
 const {app,BrowserWindow,ipcMain,nativeTheme,dialog,Menu,webUtils}=electron;
 const windows=new Set(),ready=new Set(),state=new Map();let manager,pendingActivationTarget;
 const dragPerformance=createDragPerformance({emit:onEvent});
 const dragPointer=createDragPointer({readNativeCursor:()=>electron.screen.getCursorScreenPoint(),onSample:sample=>dragPerformance.pointer(sample)});
 if(stateFile)try{for(const[key,value]of Object.entries(JSON.parse(fs.readFileSync(stateFile,'utf8'))))state.set(key,value);}catch(error){if(error.code!=='ENOENT')throw error;}
 const globalState={get:key=>state.get(key)??null,set(key,value){state.set(key,value);if(stateFile){fs.mkdirSync(path.dirname(stateFile),{recursive:true});fs.writeFileSync(stateFile,JSON.stringify(Object.fromEntries(state)));}}};
 const notify=(target,value)=>{const wc=target.webContents||target;if(!wc.isDestroyed()){if(value.type==='avatar-overlay-layout-changed')dragPerformance.layout();onEvent({direction:'host-to-view',message:value});wc.send('rebuild:view-message',value);}};
 const windowManager={
  async createWindow(options){
   const win=new BrowserWindow({title:options.title,width:options.width,height:options.height,focusable:options.focusable,show:false,frame:false,transparent:true,resizable:false,minimizable:false,maximizable:false,fullscreenable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,roundedCorners:false,thickFrame:false,accentColor:false,backgroundColor:'#00000000',webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
   attachWindowsInputShape(win,process.platform,{onShape:sample=>dragPerformance.shape(sample)});
   const contentsId=win.webContents.id;windows.add(win);win.once('closed',()=>{windows.delete(win);ready.delete(contentsId);onEvent({windowVisibility:false});});
   win.on('show',()=>onEvent({windowVisibility:true}));win.on('hide',()=>onEvent({windowVisibility:false}));
   win.webContents.on('did-finish-load',()=>win.webContents.setZoomLevel(0));
   win.on('move',()=>{dragPerformance.windowMove();notify(win,{type:'electron-window-position-changed'});});
   win.on('resize',()=>dragPerformance.windowResize());
   if(process.platform==='win32'||process.platform==='linux')win.removeMenu();
   win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   void win.loadFile(page).catch(error=>onEvent({error:error.stack}));return win;
  },
  isWebContentsReady:id=>ready.has(id),
  sendMessageToWebContents:notify,
  sendMessageToAllWindows:value=>{for(const win of windows)notify(win,value);},
  sendMessageToAllRegisteredWindows:value=>{for(const win of windows)notify(win,value);},
  setPendingAuxiliaryActivationTarget:win=>{pendingActivationTarget=win;},
 };
 const original=require(originalModule)({electron:createWindowsElectronAdapter(electron),loggerFactory:scope=>()=>Object.fromEntries(['debug','info','warning','error'].map(level=>[level,(message,details)=>onEvent({scope,level,message,details})])),stateKeys:{gr:'electron-avatar-overlay-open',X3:'electron-avatar-overlay-bounds',Oq:'electron-persisted-atom-state'},deepEqual:isDeepStrictEqual,clamp:(n,min,max)=>Math.min(max,Math.max(min,n)),featureFlags:{cuaPIP:false}});
 manager=new original.AvatarOverlayManager(windowManager,globalState,()=>false,false);
 const stopPointerFallback=installPointerFallback({manager,screen:electron.screen});
 const own=event=>[...windows].some(win=>!win.isDestroyed()&&win.webContents===event.sender&&event.senderFrame===win.webContents.mainFrame);
 const guard=event=>{if(!own(event))throw Error('Untrusted original pet renderer');};
 const point=message=>Number.isFinite(message.pointerScreenX)&&Number.isFinite(message.pointerScreenY)?{pointerScreenX:message.pointerScreenX,pointerScreenY:message.pointerScreenY}:undefined;
 ipcMain.handle('rebuild:view-request',async(event,message)=>{
  if(!own(event)&&ownsAuxiliaryEvent?.(event))return onViewMessage(message,event);
  guard(event);onEvent({direction:'view-to-host',message});const id=event.sender.id,p=point(message);
  switch(message.type){
   case 'log-message':onEvent({direction:'renderer-log',level:message.level,message:message.message,tags:message.tags});return;
   case 'rebuild-renderer-ready':ready.add(id);manager.handleRendererReady(id);return;
   case 'avatar-overlay-close':return manager.dismiss();
   case 'avatar-overlay-hide':return manager.hide();
   case 'avatar-overlay-open':return manager.toggle(event.sender);
   case 'avatar-overlay-open-state-request':return notify(event.sender,{type:'avatar-overlay-open-state-changed',isOpen:manager.isOpen()});
   case 'avatar-overlay-element-size-changed':return manager.setElementSize(id,message);
   case 'avatar-overlay-pointer-interaction-changed':return manager.setPointerInteraction(id,message.isInteractive);
   case 'avatar-overlay-keyboard-interaction-changed':return manager.setKeyboardInteraction(id,message.isInteractive,message.restorePreviousFocus);
   case 'avatar-overlay-drag-start':{
    const pointerContext={usesOrbPhysics:message.usesOrbPhysics===true,pointerType:message.inputPointerType??'unknown',preserveRenderer:process.env.PASEO_PET_VERIFY==='1'||manager.computerUseCursorPoint!=null};
    dragPerformance.start(pointerContext);return manager.startDrag(id,{...dragPointer.start(p,pointerContext),pointerWindowX:message.pointerWindowX,pointerWindowY:message.pointerWindowY},message.usesOrbPhysics);
   }
   case 'avatar-overlay-drag-move':return dragPerformance.move(()=>{const next=dragPointer.move(p),beforeX=manager.anchor?.x;try{if(!next.skipped)return manager.moveDrag(id,next.point);}finally{dragPerformance.position({beforeX,afterX:manager.anchor?.x});}});
   case 'avatar-overlay-drag-end':try{return manager.endDrag(id,dragPointer.end(p),message.altKey);}finally{dragPerformance.finish('released');}
   case 'avatar-overlay-drag-release':return manager.throwWithVelocity(id,message.velocityX,message.velocityY,message.shouldBounce);
   default:if(onViewMessage)return onViewMessage(message,event);throw Error('Unmapped view message: '+message.type);
  }
 });
 ipcMain.handle('rebuild:native-request',async(event,{method,args=[]})=>{
  guard(event);onEvent({direction:'native-rpc',method,args});const id=event.sender.id;
  switch(method){
   case 'setPointerRegions':return manager.setPointerRegions(id,...args);
   case 'setQuickChatStashed':return manager.setQuickChatStashed(id,...args);
   case 'setQuickChatComposerFocused':return manager.setQuickChatComposerFocused(id,...args);
   case 'completeQuickChatFocus':return manager.completeQuickChatFocus(id,...args);
   case 'pickFiles':{const result=await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender),{properties:['openFile','multiSelections']});await onPickedFiles?.(result.filePaths);return result.filePaths.map(file=>({fsPath:file,path:file,label:path.basename(file)}));}
   default:throw Error('Unmapped native RPC: '+method);
  }
 });
 const dispose=()=>{stopPointerFallback();manager.markAppQuitting();for(const win of windows)if(!win.isDestroyed())win.destroy();};
 // Main first waits for renderer React cleanup and its in-flight native RPCs.
 // Do not destroy its trusted frame during that prevented first quit event.
 app.on('before-quit',event=>{if(!event.defaultPrevented)dispose();});
 return {manager,windowManager,globalState,windows,original,dispose,ownsEvent:own,get pendingActivationTarget(){return pendingActivationTarget;}};
}
module.exports={createDesktopHost};
