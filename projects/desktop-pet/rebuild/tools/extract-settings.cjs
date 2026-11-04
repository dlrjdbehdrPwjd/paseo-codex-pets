/* Static raw-module capsule extraction; never imports the original runtime. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const workspace=path.resolve(__dirname,'../../../..'),snapshot=path.join(workspace,'research/desktop-pet/complete-26.1027.6604');
const assets=path.join(snapshot,'extracted/webview/assets'),output=path.join(snapshot,'derived');
const parser=require(require.resolve('@babel/parser',{paths:[path.join(workspace,'projects/desktop-pet/rebuild/node_modules')]}));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const saved=JSON.parse(fs.readFileSync(path.join(snapshot,'snapshot.json'),'utf8'));
function readVerified(file){const text=fs.readFileSync(path.join(assets,file),'utf8'),record=saved.records.find(x=>x.path==='webview/assets/'+file);if(!record||record.sha256!==sha(text))throw Error('Original settings snapshot changed: '+file);return text;}
const filename='pets-settings-route-af3a15c23ce9.js',source=readVerified(filename),ast=parser.parse(source,{sourceType:'module'}),changes=[];
for(const node of ast.program.body){
 if(node.type==='ImportDeclaration'&&node.source.value.startsWith('./'))changes.push({start:node.source.start,end:node.source.end,original:source.slice(node.source.start,node.source.end),replacement:JSON.stringify('../extracted/webview/assets/'+node.source.value.slice(2)),kind:'import-url-rebase'});
 if(node.type==='ExpressionStatement'){
  if(source.slice(node.start,node.end)!=='vr();')throw Error('Unreviewed settings top-level expression');
  changes.push({start:node.start,end:node.end,original:'vr();',replacement:'/* Original broad settings bootstrap deferred; use initializeOriginalPetCollection for collection only. */',kind:'defer-broad-bootstrap'});
 }
}
if(changes.filter(x=>x.kind==='defer-broad-bootstrap').length!==1)throw Error('Original settings bootstrap changed');
for(const name of ['On','kn','Pn','vr'])if(!ast.program.body.some(n=>n.type==='FunctionDeclaration'&&n.id.name===name))throw Error('Original collection binding missing: '+name);
let capsule=source;for(const change of [...changes].sort((a,b)=>b.start-a.start))capsule=capsule.slice(0,change.start)+change.replacement+capsule.slice(change.end);
capsule+='\nexport {On as OriginalPetCollection,kn as OriginalPetCollectionBody,Pn as initializeOriginalPetCollection,vr as initializeOriginalPetSettingsRoute,Vt as useOriginalAvatarOptions};\n';
parser.parse(capsule,{sourceType:'module'});
const lazyFilename='settings-lazy-routes-80344da75940.js',lazy=readVerified(lazyFilename);
const deps=JSON.parse(lazy.match(/m\.f=(\[[\s\S]*?\])/ )?.[1]??'null');
const indices=JSON.parse(lazy.match(/pets:i\([\s\S]*?__vite__mapDeps\((\[[\d,]+\])\)/)?.[1]??'null');
if(!Array.isArray(deps)||!Array.isArray(indices))throw Error('Original pets route preload metadata changed');
const stylesheets=indices.map(i=>{const file=deps[i]?.replace(/^\.\//,'');if(!file?.endsWith('.css'))throw Error('Unreviewed pets preload dependency');const text=readVerified(file);return{file,relativeURL:'../extracted/webview/assets/'+file,sha256:sha(text),bytes:Buffer.byteLength(text)};});
const metadata={title:'원본 펫 선택·크기 설정 컬렉션 캡슐',sourceModule:filename,sourceSha256:sha(source),snapshot:'26.1027.6604',sourceEdits:changes,allOriginalFunctionBodiesPreserved:true,appendedExports:['OriginalPetCollection=On','OriginalPetCollectionBody=kn','initializeOriginalPetCollection=Pn','initializeOriginalPetSettingsRoute=vr','useOriginalAvatarOptions=Vt'],stylesheets,preloadSource:{file:lazyFilename,sha256:sha(lazy),indices},initialization:{collection:'Pn()',broadRoute:'vr() deferred, not required by collection',importsRemainOriginal:true,executed:false},props:['avatarDirectory','avatarOptions','isCreatingCustomAvatar','isCustomAvatarLoadError','isLoadingCustomAvatars','onCreateCustomAvatar','onRefreshCustomAvatars','onUpgradeCustomAvatar'],limitations:['Collection still requires original React scope/query/Intl/router and real host settings/message services.','Original imported module top-level lazy registrations retain singleton identity; this extraction does not prove runtime initialization safe.','No account is fabricated. Omit unsupported create/refresh/upgrade callbacks; original UI hides their controls.','Builtins are obtained through original catalogue function, not copied metadata or a replacement UI.']};
const facade=`// Generated. Original collection and catalogue, no replacement UI.\nimport {Gkt as buildOriginalAvatarOptions,qkt as initializeOriginalAvatarCatalogue} from '../extracted/webview/assets/app-initial-fb51ee65d20a.js';\nexport {OriginalPetCollection,OriginalPetCollectionBody,initializeOriginalPetCollection,useOriginalAvatarOptions} from './settings-native.js';\nexport const originalSettingsStylesheets=${JSON.stringify(stylesheets)};\nexport function getOriginalAvatarOptions(custom){initializeOriginalAvatarCatalogue();return buildOriginalAvatarOptions(custom,undefined,undefined);}
export function getOriginalBuiltinAvatarOptions(){initializeOriginalAvatarCatalogue();return buildOriginalAvatarOptions(undefined,undefined,undefined);}\n`;
parser.parse(facade,{sourceType:'module'});
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'settings-native.js'),capsule);fs.writeFileSync(path.join(output,'settings-original.js'),facade);fs.writeFileSync(path.join(output,'settings-original.provenance.json'),JSON.stringify({...metadata,capsuleSha256:sha(capsule),facadeSha256:sha(facade)},null,2));
console.log(JSON.stringify({capsule:'settings-native.js',facade:'settings-original.js',stylesheets:stylesheets.map(x=>x.file),originalCodeExecuted:false},null,2));
