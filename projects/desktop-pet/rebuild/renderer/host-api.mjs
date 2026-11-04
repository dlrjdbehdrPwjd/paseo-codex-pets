/**
 * 렌더러 호스트 인터페이스. 다른 호스트로 옮길 때 이 파일을 교체하고 업무 렌더러는 유지한다.
 * 초기 정보: initialState, backend.initialSnapshot
 * 창: ready(), avatarOverlay.{setPointerRegions,setQuickChatStashed,
 *   setQuickChatComposerFocused,completeQuickChatFocus,pickFiles}(...args)
 * 서비스: backend.request(method,args), backend.subscribe(callback)
 * 설정: settings.request(method,args), settings.subscribe(callback)
 * 설치 펫: pets.list(), pets.refresh(), pets.openDirectory(args), pets.subscribe(callback). 변경 이벤트는 목록 재조회를 알린다.
 * 음성: speech.request(method,args), speech.subscribe(callback)
 * 파일: files.readBinary(args), files.persistImage(args)
 * 기록: productEvent(...args), report(result)
 * 수명: onShutdown(callback), shutdownReady(), dispose()
 * 원본 호환: installOriginalCompatibility(window)
 * 이벤트: 상태 스냅샷, 설정 변경, 음성 이벤트, 종료, 원본 view-message.
 * 아래 구현 외의 렌더러 코드는 preload 전역이나 IPC 채널을 직접 참조하지 않는다.
 */
let instance;
export function getHostApi(){return instance??=(createHostApi(globalThis.paseoPetHost));}
export function createHostApi(raw){
 if(!raw?.bootstrap||typeof raw.invoke!=='function'||typeof raw.subscribe!=='function')throw Error('펫 호스트 인터페이스가 준비되지 않았습니다.');
 const bootstrap=raw.bootstrap,shared={...bootstrap.shared},subscriptions=new Set();let disposed=false,compatibilityTarget;
 const invoke=(channel,...args)=>{if(disposed)return Promise.reject(Error('펫 호스트 인터페이스가 종료됐습니다.'));return raw.invoke(channel,...args);};
 const subscribe=(channel,callback)=>{
  if(disposed)throw Error('펫 호스트 인터페이스가 종료됐습니다.');
  const release=raw.subscribe(channel,callback);let active=true;
  const off=()=>{if(!active)return;active=false;subscriptions.delete(off);release();};subscriptions.add(off);return off;
 };
 const request=(method,args=[])=>invoke('rebuild:backend-request',{method,args});
 const avatarOverlay=Object.fromEntries(['setPointerRegions','setQuickChatStashed','setQuickChatComposerFocused','completeQuickChatFocus','pickFiles'].map(method=>[method,(...args)=>invoke('rebuild:native-request',{method,args})]));
 const originalBridge=Object.freeze({
  windowType:'electron',getPreloadStartedAtMs:()=>bootstrap.preloadStartedAtMs,
  sendMessageFromView:message=>invoke('rebuild:view-request',message),
  getPathForFile:file=>raw.getPathForFile(file),
  showContextMenu:(items,position)=>invoke('rebuild:context-menu',items,position),
  getSharedObjectSnapshotValue:key=>shared[key],getSystemThemeVariant:()=>bootstrap.theme,
  getDesktopUserAgent:()=>bootstrap.userAgent,getAppSessionId:()=>bootstrap.sessionId,getBuildFlavor:()=>bootstrap.flavor,
 });
 subscribe('rebuild:view-message',message=>{
  if(message.type==='shared-object-updated')shared[message.key]=message.value;
  compatibilityTarget?.dispatchEvent(new MessageEvent('message',{data:message}));
 });
 return Object.freeze({
  initialState:bootstrap.initialState??null,
  ready:()=>invoke('rebuild:view-request',{type:'rebuild-renderer-ready'}),avatarOverlay,
  backend:Object.freeze({initialSnapshot:bootstrap.backend??null,request,subscribe:callback=>subscribe('rebuild:backend-state',callback)}),
  pets:Object.freeze({list:()=>request('pets.list',[]),refresh:()=>request('pets.refresh',[]),openDirectory:args=>request('pets.open-directory',[args]),subscribe:callback=>subscribe('rebuild:pets-event',callback)}),
  settings:Object.freeze({request,subscribe:callback=>subscribe('rebuild:settings-event',callback)}),
  speech:Object.freeze({request,subscribe:callback=>subscribe('rebuild:voice-event',callback)}),
  files:Object.freeze({readBinary:args=>request('workspace-files.read-binary',[args]),persistImage:args=>request('file-attachments.persist-image',[args])}),
  productEvent:(...args)=>request('product-event',args),
  report:result=>raw.report(result),
  onShutdown:callback=>{let off;off=subscribe('rebuild:shutdown',()=>{off();return callback();});return off;},
  shutdownReady:()=>request('shutdown-ready',[]),
  installOriginalCompatibility(target){
   if(compatibilityTarget){if(compatibilityTarget!==target)throw Error('원본 호환 전역이 이미 설치됐습니다.');return;}
   compatibilityTarget=target;
   Object.defineProperty(target,'codexWindowType',{value:'electron',enumerable:true});
   Object.defineProperty(target,'electronBridge',{value:originalBridge,enumerable:true});
  },
  dispose(){if(disposed)return;disposed=true;for(const off of [...subscriptions])off();compatibilityTarget=undefined;},
 });
}
