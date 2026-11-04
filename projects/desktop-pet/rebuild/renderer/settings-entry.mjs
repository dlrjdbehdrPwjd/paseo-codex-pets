import {getHostApi} from './host-api.mjs';
import {createCustomAvatarHost,subscribeCustomAvatars} from './custom-pets.mjs';
import {createOriginalSettingsClient} from './settings-client.mjs';
const host=getHostApi(),transport=host.settings,source=host.initialState.sources;
host.installOriginalCompatibility(window);
window.addEventListener('error',event=>host.report({settings:true,ok:false,error:event.error?.stack??event.message}));
window.addEventListener('unhandledrejection',event=>host.report({settings:true,ok:false,error:event.reason?.stack??String(event.reason)}));
const [editor,collection,shared,initial,locale]=await Promise.all([import(source.editor),import(source.settings),import(source.shared),import(source.initial),import(source.locale)]);
const settings=createOriginalSettingsClient({request:transport.request,subscribe:transport.subscribe});
shared.Wct({settings,customAvatars:createCustomAvatarHost(host),openIn:{open:host.pets.openDirectory}});
const runtime=editor.createOriginalEditorRuntime();collection.initializeOriginalPetCollection();
const prefix='paseo-pet:persisted-atom:';
runtime.hydratePersistedAtoms(initial.Jcr(prefix),(key,value)=>{if(value===undefined)localStorage.removeItem(prefix+key);else localStorage.setItem(prefix+key,JSON.stringify(value));});
const R=runtime.React,queryClient=new runtime.OriginalQueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
const auth={...runtime.originalUnauthenticatedState(),isLoading:false,isCopilotApiAvailable:false,accountId:null,userId:null,computeResidency:null};
function Settings(){
 const [catalog,setCatalog]=R.useState({avatars:[],directory:null}),[failed,setFailed]=R.useState(false);
 const refresh=async()=>{try{setCatalog(await host.pets.list());setFailed(false);}catch{setFailed(true);}};
 R.useEffect(()=>{void refresh();return host.pets.subscribe(()=>{void refresh();});},[]);
 R.useEffect(()=>{void transport.request('settings.ready',[]);},[]);
 return R.createElement(collection.OriginalPetCollection,{avatarDirectory:catalog.directory,avatarOptions:collection.getOriginalAvatarOptions(catalog.avatars),isCustomAvatarLoadError:failed,onRefreshCustomAvatars:async()=>{await host.pets.refresh();await refresh();}});
}
const router=runtime.createOriginalMemoryRouter([{path:'/settings/pets',element:R.createElement(Settings)}],{initialEntries:['/settings/pets']});
const providers=[
 [runtime.OriginalIntlProvider,{locale:'ko-KR',messages:locale.default,defaultLocale:'en'}],
 [runtime.OriginalTanStackQueryClientProvider,{client:queryClient}],
 [runtime.OriginalQueryClientProvider,{queryClient}],
 [runtime.OriginalScopeProvider,{scope:runtime.OriginalAppScope}],
 [runtime.OriginalAuthContext.Provider,{value:auth}],
 [runtime.OriginalThreadRouteProviders,{route:{routeKind:'other',pathname:'/settings/pets',routeTemplate:'/settings/pets',search:''}}],
];
const root=runtime.ReactDOMClient.createRoot(document.getElementById('root'));
const offPets=subscribeCustomAvatars(host,queryClient);
root.render(providers.reduceRight((child,[component,props])=>R.createElement(component,props,child),R.createElement(runtime.OriginalRouterProvider,{router})));
let disposed=false;
function dispose(){if(disposed)return;disposed=true;offPets();runtime.flushPersistedAtoms();root.unmount();settings.dispose();router.dispose();queryClient.clear();}
host.onShutdown(async()=>{dispose();await host.shutdownReady();host.dispose();});
window.addEventListener('beforeunload',dispose,{once:true});
