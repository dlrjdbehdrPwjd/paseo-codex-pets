// 원본 함수 본문은 보존하고 호스트 경계에 필요한 내보내기만 추가한다.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),parser=require('@babel/parser');
const root=path.resolve(__dirname,'../../../..'),snapshot=path.resolve(process.argv[2]??path.join(root,'research/desktop-pet/compat-26.1029.7803')),out=path.join(snapshot,'derived');
const manifest=JSON.parse(fs.readFileSync(path.join(snapshot,'rspack-manifest.json'),'utf8')),patches=[];
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
function appendFactory(id,build){
 const record=manifest.modules.find(m=>m.id===id);if(!record)throw Error('원본 모듈이 없습니다: '+id);
 const variants=record.variants??[record];
 for(const item of variants){const filename=path.join(snapshot,'extracted',item.file),text=fs.readFileSync(filename,'utf8'),original=text.slice(item.start,item.end);if(hash(original)!==item.sha256)throw Error('원본 모듈 지문이 다릅니다: '+id);
  const ast=parser.parse('({'+original+'})',{sourceType:'module'}),factory=ast.program.body[0].expression.properties[0],declarations=new Map(factory.body.body.filter(n=>n.type==='FunctionDeclaration').map(n=>[n.id.name,n]));
  const addition=build({factory,declarations,original,slice:n=>original.slice(n.start-2,n.end-2)});
  patches.push({file:item.file,module:id,sourceSha256:hash(text),at:item.end-1,addition});
 }
}
appendFactory('XpSi',({factory,declarations,original,slice})=>{
 for(const name of ['oB','oX','oq','aH'])if(!declarations.has(name))throw Error('원본 화면 바인딩이 달라졌습니다: '+name);
 // 하위 에이전트 아이콘은 카드의 원본 상태 아이콘을 그대로 쓴다. 압축 이름 대신 본문으로 찾는다.
 const statusIcons=[...declarations.values()].filter(n=>{const text=slice(n);return n.params.length===1&&text.includes('e.iconType')&&text.includes('"text-green"')&&text.includes('"text-danger"');});
 if(statusIcons.length!==1)throw Error('원본 상태 아이콘 함수가 유일하지 않습니다.');
 const hooks=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type==='FunctionExpression'){const text=slice(n);if(text.includes('selectedAvatarId')&&text.includes('startsWith("custom:")'))hooks.push(n);}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(declarations.get('oq'));
 if(hooks.length!==1)throw Error('원본 자산 해석 hook이 유일하지 않습니다.');
 return `\nconst __paseoResolvedAvatar=(${slice(hooks[0])});\n${factory.params[2].name}.d(${factory.params[1].name},{OriginalScopedSurface:()=>oB,OriginalStateOwner:()=>oX,useOriginalResolvedAvatar:()=>__paseoResolvedAvatar,normalizeOriginalSubtitle:()=>aH,OriginalStatusIcon:()=>${statusIcons[0].id.name}});\n`;
});
appendFactory('EOo5',({factory,declarations,slice})=>{const matches=[...declarations.values()].filter(n=>n.params.length===0&&n.body.body.length===1&&n.body.body[0].type==='ReturnStatement'&&slice(n).includes('openAIAuth:null,authMethod:null,requiresAuth:!0'));if(matches.length!==1)throw Error('원본 익명 인증 함수가 유일하지 않습니다.');return `\n${factory.params[2].name}.d(${factory.params[1].name},{originalUnauthenticatedState:()=>${matches[0].id.name}});\n`;});
appendFactory('aPDo',({factory,declarations,slice})=>{if(!declarations.has('ei')||!slice(declarations.get('ei')).includes('avatarOptions'))throw Error('원본 펫 컬렉션 바인딩이 달라졌습니다.');return `\n${factory.params[2].name}.d(${factory.params[1].name},{OriginalPetCollection:()=>ei});\n`;});
// 드래그 중 카드 위치 보정을 원본 즉시 이동 경로로 처리한다. 범위와 근거는 patch-runtime.cjs에 있다.
const {TRAY_DRAG_PATCH,locateTrayPatch}=require('./patch-runtime.cjs'),trayPatch=TRAY_DRAG_PATCH.rspack;
const trayModule=(manifest.modules.find(m=>m.id===trayPatch.module)?.variants??[manifest.modules.find(m=>m.id===trayPatch.module)]);
if(trayModule.length!==1||trayModule[0]?.file!==trayPatch.file||trayModule[0].sha256!==trayPatch.moduleSha256)throw Error('드래그 카드 패치 대상 모듈이 다릅니다.');
const traySource=fs.readFileSync(path.join(snapshot,'extracted',trayPatch.file),'utf8'),trayAt=locateTrayPatch(traySource,trayPatch);
if(trayAt<trayModule[0].start||trayAt>=trayModule[0].end)throw Error('드래그 카드 패치 지점이 대상 모듈 밖입니다.');
patches.push({id:TRAY_DRAG_PATCH.id,file:trayPatch.file,module:trayPatch.module,sourceSha256:hash(traySource),at:trayAt,deleteLength:trayPatch.before.length,addition:trayPatch.after,reason:TRAY_DRAG_PATCH.reason});
// 기존 호스트에도 있던 포커스 순서 보정을 현재 원본 편집기의 같은 경계에 적용한다.
const editor=manifest.modules.find(m=>m.id==='bII7');if(!editor)throw Error('원본 편집기 포커스 모듈이 없습니다.');
const editorSource=fs.readFileSync(path.join(snapshot,'extracted',editor.file),'utf8');
const before='let t=!0,n=new ResizeObserver(()=>{t&&(t=!1,n.disconnect(),o())});return n.observe(e.view.dom),()=>{t=!1,n.disconnect()}';
const after='let t=!0,__paseoFocusFrame=null,n=new ResizeObserver(()=>{t&&(t=!1,n.disconnect(),__paseoFocusFrame=requestAnimationFrame(o))});return n.observe(e.view.dom),()=>{t=!1,n.disconnect(),__paseoFocusFrame!==null&&cancelAnimationFrame(__paseoFocusFrame)}';
if(editorSource.split(before).length!==2)throw Error('원본 포커스 관찰자가 유일하지 않습니다.');
patches.push({file:editor.file,module:'bII7',sourceSha256:hash(editorSource),at:editorSource.indexOf(before),deleteLength:before.length,addition:after,reason:'ResizeObserver 전달 중 원본 편집기의 포커스가 레이아웃을 다시 바꾸는 현상을 피한다. 기존 버전과 같은 다음 프레임 예약과 정리 취소를 유지한다.'});
fs.writeFileSync(path.join(out,'rspack-patches.json'),JSON.stringify({title:'현재 코덱스 펫 원본 내보내기와 포커스 순서 연결',originalBodiesPreserved:false,bodyChanges:['원본 편집기 단발 포커스의 다음 프레임 예약','드래그 중 카드 위치 보정의 즉시 이동'],patches},null,2));
const write=(name,text)=>{parser.parse(text,{sourceType:'module'});fs.writeFileSync(path.join(out,name),text);};
write('shared-original.js',`import {requireOriginal as r} from './rspack-loader.js';\nexport const Wct=services=>r('GaA7').setAppServices(services),ITt=r('y5DF').vP,ETt=r('y5DF').i1;\n`);
write('initial-original.js',`import {requireOriginal as r} from './rspack-loader.js';\nexport const Jcr=r('kpIY').eK,Ier=r('ChYf').G,Vfr=r('OMIV').JW;\n`);
const locale=JSON.parse(fs.readFileSync(path.join(snapshot,'locale.json'),'utf8'));
write('locale-original.js',`import {requireOriginal as r} from './rspack-loader.js';\nimport * as locale from '../extracted/${locale.file}';\nr.C(locale);\nexport default r(${JSON.stringify(locale.module)});\n`);
const html=fs.readFileSync(path.join(snapshot,'extracted/webview/index.html'),'utf8'),styles=[...html.matchAll(/<link\b[^>]*>/g)].map(m=>m[0]).filter(tag=>/rel=["']stylesheet["']/.test(tag)).map(tag=>{const href=tag.match(/href=["']([^"']+)["']/)?.[1];if(!href?.startsWith('/assets/'))throw Error('원본 스타일 경로를 해석하지 못했습니다.');return {file:href.slice('/assets/'.length)};});
fs.writeFileSync(path.join(out,'surface-styles.json'),JSON.stringify({styles},null,2));fs.writeFileSync(path.join(out,'settings-original.provenance.json'),JSON.stringify({stylesheets:[]},null,2));
write('surface-native.js',`import {requireOriginal as r} from './rspack-loader.js';\nconst surface=r('XpSi');\nexport const OriginalScopedSurface=surface.OriginalScopedSurface,OriginalStateOwner=surface.OriginalStateOwner,useOriginalResolvedAvatar=surface.useOriginalResolvedAvatar,useOriginalSetting=r('RxZZ').iK,originalPetSettingSpecs=r('DBCl').kWF,useOriginalPetDimensions=r('HrOd').cf,OriginalButton=r('ygO2').$,OriginalStatusIcon=surface.OriginalStatusIcon,OriginalReactDOM=r('v7qY');\nexport function initializeOriginalSurface(){return r('XpSi');}\n`);
write('settings-original.js',`import {requireOriginal as r} from './rspack-loader.js';\nexport const OriginalPetCollection=r('aPDo').OriginalPetCollection;\nexport function initializeOriginalPetCollection(){return r('aPDo');}\nexport function getOriginalAvatarOptions(custom){return r('SqlE').i0(custom,undefined,undefined);}\n`);
write('ui-text-original.js',`import {requireOriginal as r} from './rspack-loader.js';\nexport const normalizeOriginalSubtitle=r('XpSi').normalizeOriginalSubtitle;\nexport function normalizeOriginalAgentMessage(text,{automation=false}={}){const visible=r('veRW').l(text),notification=(automation?r('JxD3').mM:r('JxD3').Fp)(visible);return notification?.decision==='DONT_NOTIFY'?null:normalizeOriginalSubtitle(notification?.notificationMessage??notification?.visibleText??visible);}\n`);
write('editor-original.js',`import {requireOriginal as r} from './rspack-loader.js';\nimport {createOriginalMemoryRouterFactory} from '../../renderer/rspack-router.mjs';\nexport function createOriginalEditorRuntime(){const scopes=r('y5DF'),persisted=r('kpIY');return {React:r('zd8w'),ReactDOMClient:r('CE87'),JSX:r('ABep'),Compiler:r('QosV'),OriginalScopeProvider:scopes.Ui,OriginalQueryClientProvider:scopes.FU,OriginalAppScope:r('OWtl').u,OriginalQueryClient:r('suje').E,OriginalIntlProvider:r('G8V1').A,OriginalTanStackQueryClientProvider:r('irkb').Ht,OriginalAuthContext:r('O0M0').c,originalUnauthenticatedState:r('EOo5').originalUnauthenticatedState,OriginalThreadRouteProviders:r('vmZO').R,OriginalThreadScope:r('V3rO').l7,OriginalRouteScope:r('Oj9r').GD,OriginalComposerScope:r('Sd8U').PR,useScope:scopes.gh,useBinding:scopes.uO,registerOriginalCreatedThread:r('V3rO').Bb,hydratePersistedAtoms:persisted.A2,readPersistedLocalStorage:persisted.eK,setPersistedAtom:persisted.jx,applyExternalPersistedAtom:persisted.JQ,flushPersistedAtoms:persisted.b8,markPersistedHydrated:persisted.Ki,createOriginalMemoryRouter:createOriginalMemoryRouterFactory(r('HZfM')),OriginalRouterProvider:r('HZfM').pg};}\n`);
console.log(JSON.stringify({patches:patches.length,facades:7,bodyChanges:['원본 편집기 단발 포커스의 다음 프레임 예약','드래그 중 카드 위치 보정의 즉시 이동']}));
