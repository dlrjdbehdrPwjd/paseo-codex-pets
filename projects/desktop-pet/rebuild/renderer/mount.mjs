/** Composes original providers and original Ev. No replacement pet UI. */
import {installPaseoDictationCapability} from '../voice/product-capability.mjs';
import {createChildAgentsLayer} from './child-agents.mjs';
export function mountOriginalPet({element,editorModule,surfaceModule,sharedModule,initialModule,messages,backend,native,settings,hostSettings,logger,speech,setKeyboardInteraction,report}){
 for(const method of ['getSnapshot','subscribe','refresh','close','openMain','runControl','runAction','submitQuestion','submitQuickChat'])if(typeof backend?.[method]!=='function')throw Error(`Missing real Paseo backend method: ${method}`);
 if(typeof settings?.read!=='function'||typeof settings?.publish!=='function')throw Error('Persistent settings adapter is required');
 if(typeof native?.ready!=='function'||!native.avatarOverlay)throw Error('Original native window adapter is required');
 sharedModule.Wct({avatarOverlay:native.avatarOverlay,settings:hostSettings,...(native.customAvatars?{customAvatars:native.customAvatars}:{}),...(native.workspaceFiles?{workspaceFiles:native.workspaceFiles}:{}),...(native.fileAttachments?{fileAttachments:native.fileAttachments}:{}),...(speech?{dictationStreaming:speech.dictationStreaming}:{})});
 const runtime=editorModule.createOriginalEditorRuntime();surfaceModule.initializeOriginalSurface();
 const dictationCapability=speech?installPaseoDictationCapability({initialModule,sharedModule,AppScope:runtime.OriginalAppScope,speech}):null;
 runtime.hydratePersistedAtoms(settings.read(),settings.publish);
 const R=runtime.React,queryClient=new runtime.OriginalQueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 const auth={...runtime.originalUnauthenticatedState(),isLoading:false,isCopilotApiAvailable:false,accountId:null,userId:null,computeResidency:null};
 // This host does not supply Codex cloud credentials. Paseo provider sessions
 // remain a separate service; never fabricate a ChatGPT account/token here.
 // 원본 버튼·상태 아이콘이 없는 번들이면 층을 만들지 않고 자식 카드를 기존처럼 둔다.
 const ChildAgentsLayer=surfaceModule.OriginalButton&&surfaceModule.OriginalStatusIcon&&surfaceModule.OriginalReactDOM?.createPortal?createChildAgentsLayer({React:R,createPortal:surfaceModule.OriginalReactDOM.createPortal,Button:surfaceModule.OriginalButton,StatusIcon:surfaceModule.OriginalStatusIcon,backend,setKeyboardInteraction,report}):null;
 function Pet(){
  const state=R.useSyncExternalStore(backend.subscribe,backend.getSnapshot,backend.getSnapshot);
  const appScope=runtime.useScope(runtime.OriginalAppScope);
  R.useEffect(()=>backend.setCreationListener?.(mapping=>runtime.registerOriginalCreatedThread(appScope,mapping)),[appScope]);
  const speechState=speech?R.useSyncExternalStore(speech.subscribe,speech.getSnapshot,speech.getSnapshot):null;
  const {selectedAvatar:avatar,selectedAvatarId}=surfaceModule.useOriginalResolvedAvatar();
  const isPetVisible=surfaceModule.useOriginalSetting(surfaceModule.originalPetSettingSpecs.petVisible);
  const {mascotWidthPx}=surfaceModule.useOriginalPetDimensions();
  R.useEffect(()=>{native.ready();},[]);
  if(!avatar)return null;
  return R.createElement(R.Fragment,null,R.createElement(surfaceModule.OriginalScopedSurface,{
   selectedAvatar:avatar,selectedAvatarId,
   sessions:state.sessions,latestTurnItems:id=>state.latestTurnItems?.[id],
   isPetVisible,isQuickChatLoading:!state.connected,
   quickChatEnabled:state.capabilities.quickChat,
   quickChatStashEnabled:state.preferences.quickChatStash,
   quickChatStyleEnabled:state.preferences.quickChatStyle,
   dictationSupportState:speechState?speechState.capabilities.dictation.supported===true:state.capabilities.dictation,
   dictationCleanupEnabled:false,dictationStreamingEnabled:!!speech,
   ...(speech?{voiceOverride:speech.voiceOverride(speechState)}:{}),
   mascotWidthPx,
   firstAwakeNotificationEnabled:state.preferences.firstAwakeNotification,
   productLogger:logger,
   onClosePet:backend.close,onMascotClick:backend.openMain,
   onRefreshLocalSessions:backend.refresh,onRefreshRemoteSessions:backend.refresh,
   onRunNotificationControl:backend.runControl,onRunNotificationAction:backend.runAction,
   onSubmitQuestionOption:backend.submitQuestion,onSubmitQuickChat:backend.submitQuickChat,
  }),ChildAgentsLayer?R.createElement(ChildAgentsLayer):null);
 }
 const router=runtime.createOriginalMemoryRouter([{path:'/avatar-overlay',element:R.createElement(Pet)}],{initialEntries:['/avatar-overlay']});
 const providers=[
  [runtime.OriginalIntlProvider,{locale:'ko-KR',messages,defaultLocale:'en'}],
  [runtime.OriginalTanStackQueryClientProvider,{client:queryClient}],
  [runtime.OriginalQueryClientProvider,{queryClient}],
  [runtime.OriginalScopeProvider,{scope:runtime.OriginalAppScope}],
  [runtime.OriginalAuthContext.Provider,{value:auth}],
  [runtime.OriginalThreadRouteProviders,{route:{routeKind:'other',pathname:'/avatar-overlay',routeTemplate:'/avatar-overlay',search:''}}],
 ];
 const root=runtime.ReactDOMClient.createRoot(element);
 root.render(providers.reduceRight((child,[component,props])=>R.createElement(component,props,child),R.createElement(runtime.OriginalRouterProvider,{router})));
 return {runtime,router,queryClient,dispose(){runtime.flushPersistedAtoms();root.unmount();dictationCapability?.dispose();router.dispose();queryClient.clear();}};
}
