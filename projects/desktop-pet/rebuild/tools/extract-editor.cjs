/* Static original-module extraction: no original code is evaluated here. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const workspace=path.resolve(__dirname,'../../../..'),snapshot=path.join(workspace,'research/desktop-pet/complete-26.1027.6604');
const dependencyRoot=path.join(workspace,'projects/desktop-pet/rebuild/node_modules');
const parser=require(require.resolve('@babel/parser',{paths:[dependencyRoot]}));
const assets=path.join(snapshot,'extracted/webview/assets'),output=path.join(snapshot,'derived');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const controlsFile='controls-e4473e561342.js',initialFile='app-initial-fb51ee65d20a.js',sharedFile='app-shared-845378c6057d.js';
const capsuleRootFiles=[controlsFile,initialFile,sharedFile,'app-primary-93b5541c5ac8.js'];
const source=fs.readFileSync(path.join(assets,controlsFile),'utf8');
const ast=parser.parse(source,{sourceType:'module'});
const changes=[];
for(const n of ast.program.body)if(n.type==='ImportDeclaration'&&n.source.value.startsWith('./'))changes.push({start:n.source.start,end:n.source.end,original:source.slice(n.source.start,n.source.end),replacement:JSON.stringify('../extracted/webview/assets/'+n.source.value.slice(2))});
// Rebase only the import URLs; do not edit function bodies, bootstrap logic,
// controller props, geometry, event handlers, suggestions, paste or dictation.
let rebased=source;for(const p of [...changes].sort((a,b)=>b.start-a.start))rebased=rebased.slice(0,p.start)+p.replacement+rebased.slice(p.end);
const extra='\nexport {Ta as OriginalQuickChatEditor};\n';
fs.mkdirSync(output,{recursive:true});
const controlsOutput='controls-editor-native.js';
fs.writeFileSync(path.join(output,controlsOutput),rebased+extra);
const initialSource=fs.readFileSync(path.join(assets,initialFile),'utf8');
const initialAst=parser.parse(initialSource,{sourceType:'module'});
const anonymousNode=initialAst.program.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='dHn');
if(!anonymousNode)throw Error('Original anonymous-auth fallback not found');
const anonymousBody=initialSource.slice(anonymousNode.start,anonymousNode.end);
fs.writeFileSync(path.join(output,'auth-original-helpers.js'),anonymousBody+'\nexport {dHn as originalUnauthenticatedState};\n');
const entry=`// Generated original editor module facade. No replacement editor or PM runtime.\nimport {Cc as originalCreateController,Ls as initializeEditor,ac as OriginalRichTextInput,ZUn as OriginalComposerContext} from '../extracted/webview/assets/${initialFile}';\nimport {pWt as getReact,JFt as getJSX,fWt as getCompiler,GFt as getReactDOMClient,pTt as initializeScopeProvider,hTt as initializeQueryClientProvider,fTt as OriginalScopeProvider,mTt as OriginalQueryClientProvider,klt as OriginalAppScope,oTt as originalUseScope,lTt as originalUseBinding,ZTt as initializeQueryClient,XTt as OriginalQueryClient,bjt as initializeIntlProvider,yjt as OriginalIntlProvider} from '../extracted/webview/assets/${sharedFile}';\nimport {n as initializeControls,t as OriginalQuickChat,o as originalGeometry,OriginalQuickChatEditor} from './${controlsOutput}';\nexport function createOriginalEditorRuntime(){\n initializeEditor();\n initializeControls();\n initializeScopeProvider();\n initializeQueryClientProvider();\n initializeQueryClient();\n initializeIntlProvider();\n return {React:getReact(),ReactDOMClient:getReactDOMClient(),JSX:getJSX(),Compiler:getCompiler(),OriginalQuickChat,OriginalQuickChatEditor,OriginalRichTextInput,OriginalComposerContext,geometry:originalGeometry,createController:originalCreateController,OriginalScopeProvider,OriginalQueryClientProvider,OriginalAppScope,OriginalQueryClient,OriginalIntlProvider,useScope:originalUseScope,useBinding:originalUseBinding};\n}\n`;
const scopedEntry=`import {blt as initializeTanStackQueryProvider,ylt as OriginalTanStackQueryClientProvider} from '../extracted/webview/assets/${sharedFile}';\nimport {UD as OriginalThreadRouteProviders,WD as initializeThreadRouteProviders} from '../extracted/webview/assets/app-primary-93b5541c5ac8.js';\nimport {originalUnauthenticatedState} from './auth-original-helpers.js';\nimport {V5n as registerOriginalCreatedThread,J5n as originalClientThreadIdsByConversationId,d7n as originalConversationIdByClientThreadId,aIn as OriginalAuthContext,oIn as initializeAuthContext,B5n as OriginalThreadScope,p5n as OriginalRouteScope,w6n as OriginalComposerScope,Wcr as initializePersistedAtomRuntime,Gcr as hydratePersistedAtoms,Jcr as readPersistedLocalStorage,Qcr as setPersistedAtom,Fcr as applyExternalPersistedAtom,Rcr as flushPersistedAtoms,qcr as markPersistedHydrated} from '../extracted/webview/assets/${initialFile}';\n`+entry.replace(' initializeIntlProvider();',' initializeIntlProvider();\n initializeThreadRouteProviders();\n initializePersistedAtomRuntime();\n initializeAuthContext();\n initializeTanStackQueryProvider();').replace('useBinding:originalUseBinding};','useBinding:originalUseBinding,OriginalThreadRouteProviders,OriginalThreadScope,OriginalRouteScope,OriginalComposerScope,OriginalAuthContext,originalUnauthenticatedState,OriginalTanStackQueryClientProvider,hydratePersistedAtoms,readPersistedLocalStorage,setPersistedAtom,applyExternalPersistedAtom,flushPersistedAtoms,markPersistedHydrated};');
const routedEntry=`import {Bwt as initializeOriginalRouter,Iwt as createOriginalMemoryRouter,Nwt as OriginalRouterProvider} from '../extracted/webview/assets/${sharedFile}';\n`+scopedEntry.replace(' initializeTanStackQueryProvider();',' initializeTanStackQueryProvider();\n initializeOriginalRouter();').replace('markPersistedHydrated};','markPersistedHydrated,createOriginalMemoryRouter,OriginalRouterProvider,registerOriginalCreatedThread,originalClientThreadIdsByConversationId,originalConversationIdByClientThreadId};');
parser.parse(routedEntry,{sourceType:'module'});parser.parse(rebased+extra,{sourceType:'module'});
fs.writeFileSync(path.join(output,'editor-original.js'),routedEntry);
const visited=new Map(),missing=[],dynamicExpressions=[],pending=[...capsuleRootFiles];
function graph(file){
 if(visited.has(file))return;
 const absolute=path.join(assets,file);if(!fs.existsSync(absolute)){missing.push(file);return;}
 const text=fs.readFileSync(absolute,'utf8');
 visited.set(file,{file,bytes:Buffer.byteLength(text),sha256:digest(text),imports:[],dynamicImports:[]});
 if(!file.endsWith('.js'))return;
 const parsed=parser.parse(text,{sourceType:'module'}),item=visited.get(file);
 const scan=node=>{
  if(!node||typeof node!=='object')return;
  let value,type;
  if(node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration'||node.type==='ExportAllDeclaration'){value=node.source?.value;type='imports';}
  if(node.type==='CallExpression'&&node.callee.type==='Import'){const arg=node.arguments[0];value=arg?.type==='StringLiteral'?arg.value:arg?.type==='TemplateLiteral'&&arg.expressions.length===0?arg.quasis[0].value.cooked:null;type='dynamicImports';if(!value)dynamicExpressions.push({file,start:node.start,end:node.end,text:text.slice(node.start,node.end)});}
  if(value){item[type].push(value);if(value.startsWith('./')||value.startsWith('../'))pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file),value)));}
  for(const [k,v]of Object.entries(node))if(k!=='loc'&&k!=='tokens'&&k!=='comments'){if(Array.isArray(v))v.forEach(scan);else if(v&&typeof v==='object')scan(v);}
 };
 scan(parsed.program);
}
if(process.argv.includes('--reuse-dependency-index')){
 const previous=JSON.parse(fs.readFileSync(path.join(output,'editor-original.provenance.json'),'utf8'));
 for(const file of capsuleRootFiles)if(previous.dependencies.find(x=>x.file===file)?.sha256!==digest(fs.readFileSync(path.join(assets,file),'utf8')))throw Error('Snapshot root changed; rerun full dependency audit');
 for(const entry of previous.dependencies)visited.set(entry.file,entry);
 missing.push(...previous.missingFiles);dynamicExpressions.push(...previous.dynamicImportExpressions);
}else while(pending.length)graph(pending.pop());
const manifest={schema:'original-editor-extraction/v1',snapshot:'26.1027.6604',mode:'static extraction and syntax/dependency checks only',sourceModule:controlsFile,sourceSha256:digest(source),generatedModule:controlsOutput,generatedSha256:digest(rebased+extra),sourceEdits:changes,appendedExport:'Ta as OriginalQuickChatEditor',allOriginalFunctionBodiesPreserved:true,entry:'editor-original.js',entrySha256:digest(routedEntry),moduleRoots:capsuleRootFiles,dependencyAudit:{mode:process.argv.includes('--reuse-dependency-index')?'reused full transitive graph; each capsule root source hash verified':'full transitive graph parsed',roots: capsuleRootFiles},anonymousAuth:{module:initialFile,name:'dHn',start:anonymousNode.start,end:anonymousNode.end,sha256:digest(anonymousBody),bodyPreserved:true},dependencies:[...visited.values()],missingFiles:missing,dynamicImportExpressions:dynamicExpressions,executionVerified:false,standaloneWithoutOriginalContext:false,serviceBoundaries:[
 {kind:'runtime-identity',contract:'Use original React/compiler-runtime/JSX namespaces returned by facade; do not mix separate React copies or ProseMirror PluginKey/schema instances.'},
 {kind:'scope-provider',contract:'Original AppScope/signal/query provider, IntlProvider, composer controller context, deferred effect registry, dictation/layout context; Ta/lsc retain original hooks.'},
 {kind:'backend-selectors',contract:'selected target/thread cwd/capabilities, mention/skill/plugin search, model/image support, persisted preferences must be served by Paseo adapters.'},
 {kind:'native-bridge',contract:'avatarOverlay.pickFiles/focus/stash, keyboard/pointer interaction, drag/layout revisions/geometry messages, toast/open external link must be mapped before original initialization.'},
 {kind:'attachments',contract:'Original getAttachmentActions and real pasted-images/pasted-files lifecycle. Do not replace with hidden editor, FakeView, textarea or ad hoc contentEditable.'},
 {kind:'side-effects',contract:'initializeEditor/initializeControls call original lazy initialization graph; not executed by this extraction or validated in isolation. Review/init service graph before runtime.'}
]};
fs.writeFileSync(path.join(output,'editor-original.provenance.json'),JSON.stringify(manifest,null,2));
console.log(`Preserved original controls functions; ${visited.size} module files indexed, ${missing.length} missing, ${dynamicExpressions.length} dynamic import expressions. No original JS executed.`);
