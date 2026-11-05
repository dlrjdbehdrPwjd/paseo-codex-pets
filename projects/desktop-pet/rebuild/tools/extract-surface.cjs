/* Static AST closure extraction. Does not evaluate original app/module code. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../../..');
const {inspect,extractClosure}=require('./static-ast.cjs');
const snapshot=path.join(root,'research/desktop-pet/complete-26.1027.6604');
const sourcePath=path.join(snapshot,'extracted/webview/assets/avatar-overlay-native-page-3b2745370183.js');
const output=path.join(snapshot,'derived');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const source=inspect(sourcePath);
const saved=JSON.parse(fs.readFileSync(path.join(snapshot,'snapshot.json'),'utf8'));
const recorded=saved.records.find(record=>record.path==='webview/assets/avatar-overlay-native-page-3b2745370183.js');
if(!recorded||recorded.sha256!==hash(source.source))throw Error('Source differs from preserved snapshot manifest');
const roots=['gv','_v','Tv','Ev','w_','n_'];
// Roots include the original service composition, scoped provider, state owner,
// native layout subscription and complete renderer assembly. No component body
// is replaced, no unresolved imports are assigned fake values.
const result=extractClosure(source,roots,{});
const required=result.external.map(name=>{
 const binding=source.program.scope.getBinding(name),p=binding?.path;
 if(p?.isImportSpecifier())return {local:name,kind:'import',module:p.parent.source.value,export:p.node.imported.name};
 if(p?.isImportDefaultSpecifier())return {local:name,kind:'import',module:p.parent.source.value,export:'default'};
 if(p?.isImportNamespaceSpecifier())return {local:name,kind:'namespace-import',module:p.parent.source.value,export:'*'};
 const item=source.get(name,true);
 return {local:name,kind:item.ambiguousAssignments!==undefined?'unresolved-initializer':'unresolved-local',assignments:item.ambiguousAssignments};
});
function rootContract(name){
 const binding=source.program.scope.getBinding(name),owner=binding.path,param=owner.node.params[0]?.name,parameter=owner.scope.getBinding(param),props=new Set();
 function add(pattern){for(const property of pattern.properties)if(property.type==='ObjectProperty')props.add(property.key.name??property.key.value);}
 owner.traverse({VariableDeclarator(p){if(p.node.id.type==='ObjectPattern'&&p.node.init?.type==='Identifier'&&p.node.init.name===param&&p.scope.getBinding(param)===parameter)add(p.node.id);},AssignmentExpression(p){if(p.node.left.type==='ObjectPattern'&&p.node.right.type==='Identifier'&&p.node.right.name===param&&p.scope.getBinding(param)===parameter)add(p.node.left);}});
 return {name,props:[...props],dependencies:source.get(name,true).dependencies};
}
const manifest={title:'코덱스 펫 원본 surface 전체 소유자 추출',version:'26.1027.6604',source:path.relative(snapshot,sourcePath).replaceAll('\\','/'),sourceSha256:hash(source.source),mode:'static-only',bootstrapExecuted:false,roots,rootContracts:roots.map(rootContract),required,originalBindings:result.nodes.map(({code,...item})=>({...item,sha256:hash(code)})),limitations:['Factory requires the exact framework/primitives/service bindings in required. It is not standalone or runnable until they are resolved.','No missing binding is filled with null, noop, fake store, fallback markup, or successful fake backend response.','Factory construction must be deferred until real service/selector/runtime adapters exist; some preserved original initializers instantiate signals and memo wrappers.','The source application bootstrap and lazy initializer wrappers were not executed.']};
const code=`// Generated from the retained original snapshot. Do not hand-edit.\n// All original declaration bodies are unchanged. Bootstrap is excluded.\nexport const surfaceSourceSha256=${JSON.stringify(manifest.sourceSha256)};\nexport const surfaceRequiredBindings=${JSON.stringify(required)};\nexport function createOriginalSurface(bindings){\nfor(const {local} of surfaceRequiredBindings)if(!Object.hasOwn(bindings,local)||bindings[local]===undefined)throw new Error('Unresolved original surface binding: '+local);\nconst {${result.external.join(',')}}=bindings;\n${result.body}\nreturn {AvatarOverlayNativePage:gv,ServiceSurface:_v,ScopedSurface:Tv,StateOwner:Ev,LayoutSubscriber:w_,Frame:n_};\n}\n`;
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'surface-original.js'),code);
fs.writeFileSync(path.join(output,'surface-original-manifest.json'),JSON.stringify(manifest,null,2));
// A raw ESM capsule retains imported live bindings and module singleton identity.
// Module URL literals, the one explicit auto-bootstrap call and the reviewed tray drag patch change.
const transforms=[];
for(const statement of source.program.node.body){
 if(statement.type==='ImportDeclaration'||(statement.type==='ExportNamedDeclaration'&&statement.source)){
  const literal=statement.source;
  if(literal.value.startsWith('./'))transforms.push({start:literal.start,end:literal.end,before:source.source.slice(literal.start,literal.end),after:JSON.stringify('../extracted/webview/assets/'+literal.value.slice(2)),kind:'module-specifier-rebase'});
 }
}
source.program.traverse({CallExpression(p){
 if(p.node.callee.type==='Import'&&p.node.arguments[0]?.type==='StringLiteral'){
  const literal=p.node.arguments[0];
  if(literal.value.startsWith('./'))transforms.push({start:literal.start,end:literal.end,before:source.source.slice(literal.start,literal.end),after:JSON.stringify('../extracted/webview/assets/'+literal.value.slice(2)),kind:'dynamic-module-specifier-rebase'});
 }
}});
const bootstraps=source.program.node.body.filter(statement=>statement.type==='ExpressionStatement'&&statement.expression.type==='CallExpression'&&statement.expression.callee.type==='Identifier'&&statement.expression.callee.name==='dy');
if(bootstraps.length!==1||source.source.slice(bootstraps[0].start,bootstraps[0].end)!=='dy();')throw Error('Unexpected original surface auto-bootstrap; explicit review required');
transforms.push({start:bootstraps[0].start,end:bootstraps[0].end,before:'dy();',after:'/* Original dy() auto-bootstrap deferred: call initializeOriginalSurface explicitly. */',kind:'defer-explicit-bootstrap'});
// 원본 함수 본문 변경은 아래 한 곳뿐이다. 범위와 근거는 patch-runtime.cjs의 TRAY_DRAG_PATCH에 있다.
const {TRAY_DRAG_PATCH,locateTrayPatch}=require('./patch-runtime.cjs'),trayPatch=TRAY_DRAG_PATCH.esm;
const trayFunction=source.program.node.body.find(statement=>statement.type==='FunctionDeclaration'&&statement.id.name===trayPatch.function);
if(!trayFunction||hash(source.source.slice(trayFunction.start,trayFunction.end))!==trayPatch.functionSha256)throw Error('드래그 카드 패치 대상 원문이 다릅니다: '+trayPatch.function);
const trayAt=locateTrayPatch(source.source,trayPatch);
if(trayAt<trayFunction.start||trayAt>=trayFunction.end)throw Error('드래그 카드 패치 지점이 대상 함수 밖입니다.');
transforms.push({start:trayAt,end:trayAt+trayPatch.before.length,before:trayPatch.before,after:trayPatch.after,kind:TRAY_DRAG_PATCH.id});
let nativeSource=source.source;
for(const transform of [...transforms].sort((a,b)=>b.start-a.start))nativeSource=nativeSource.slice(0,transform.start)+transform.after+nativeSource.slice(transform.end);
nativeSource+='\n// Capsule exports preserve the original ESM bindings. Function bodies change only by the reviewed tray drag patch.\nexport {Ev as OriginalStateOwner,w_ as OriginalLayoutSubscriber,n_ as OriginalFrame,dy as initializeOriginalSurface,_v as OriginalServiceSurface,Tv as OriginalScopedSurface,pv as useOriginalResolvedAvatar,Hs as useOriginalAvatarSelection,Nc as useOriginalPetDimensions,J as useOriginalSetting,ie as originalPetSettingSpecs,kv as openOriginalPetSettings,mt as OriginalButton,Qm as OriginalStatusIcon,Gp as OriginalReactDOM};\n';
fs.writeFileSync(path.join(output,'surface-native.js'),nativeSource);

// Audit reachable static ESM imports without importing any target module. Every
// load-time expression/initializer is recorded for review, not declared safe.
const parser=require('@babel/parser');
const queue=[sourcePath],visited=new Set(),audit=[];
function hasImmediateCall(node){
 if(!node||typeof node!=='object')return false;
 if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type))return false;
 if(['CallExpression','NewExpression','AwaitExpression','TaggedTemplateExpression'].includes(node.type))return true;
 return Object.values(node).some(value=>Array.isArray(value)?value.some(hasImmediateCall):hasImmediateCall(value));
}
while(queue.length){
 const filename=queue.shift();if(visited.has(filename))continue;visited.add(filename);
 const text=fs.readFileSync(filename,'utf8'),ast=parser.parse(text,{sourceType:'module'}),effects=[],imports=[];
 for(const statement of ast.program.body){
  if(statement.type==='ImportDeclaration'||statement.type==='ExportNamedDeclaration'&&statement.source){
   const value=statement.source.value;imports.push(value);
   if(value.startsWith('.')){const dependency=path.resolve(path.dirname(filename),value);if(dependency.endsWith('.js')&&fs.existsSync(dependency))queue.push(dependency);}
  }
  if(statement.type==='ExpressionStatement')effects.push({start:statement.start,end:statement.end,kind:'top-level-expression',immediateCall:hasImmediateCall(statement.expression),source:text.slice(statement.start,statement.end)});
  if(statement.type==='VariableDeclaration')for(const declaration of statement.declarations)if(declaration.init&&hasImmediateCall(declaration.init))effects.push({start:declaration.init.start,end:declaration.init.end,kind:'top-level-initializer',immediateCall:true,source:text.slice(declaration.init.start,declaration.init.end)});
 }
 audit.push({file:path.relative(snapshot,filename).replaceAll('\\','/'),sha256:hash(text),imports,effects});
}
const nativeManifest={title:'코덱스 펫 원본 surface ESM 캡슐·자동 초기화 감사',version:manifest.version,source:manifest.source,sourceSha256:manifest.sourceSha256,outputSha256:hash(nativeSource),transforms,appendedExports:['OriginalStateOwner=Ev','OriginalLayoutSubscriber=w_','OriginalFrame=n_','initializeOriginalSurface=dy','OriginalServiceSurface=_v','OriginalScopedSurface=Tv','useOriginalResolvedAvatar=pv','useOriginalAvatarSelection=Hs','useOriginalPetDimensions=Nc','useOriginalSetting=J','originalPetSettingSpecs=ie','openOriginalPetSettings=kv'],rootContracts:manifest.rootContracts,mode:'static-only; no module imported or evaluated',autoBootstrap:'Only the surface module final dy(); is deferred; imported modules retain their own original load-time initializers.',dependencyAudit:{moduleCount:audit.length,effectCount:audit.reduce((n,m)=>n+m.effects.length,0),modules:audit},limitations:['Importing surface-native.js can execute dependency module top-level initializers. Do not dynamically import before auditing the recorded dependency effects.','The dependency audit follows static ESM imports/reexports, not every possible dynamic import path.','Some nested class static effects and external loader behavior require additional review; this list is not a safety proof.','No service stub or factory snapshot is substituted for original live ESM bindings.']};
fs.writeFileSync(path.join(output,'surface-native-manifest.json'),JSON.stringify(nativeManifest,null,2));
console.log(JSON.stringify({originalBindings:result.nodes.length,required:required.length,unresolved:required.filter(x=>x.kind.startsWith('unresolved')),sourceSha256:manifest.sourceSha256,output:path.relative(root,output)},null,2));
