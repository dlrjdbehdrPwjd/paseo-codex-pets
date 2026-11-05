/* Apply reviewed source patches only to a copied runtime snapshot. Never import
 * or execute original code. Original research snapshot is immutable. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const filename='app-initial-fb51ee65d20a.js';
const originalSHA256='94001fc51aec3914b369f7ffbc497980c007a45b192034234d0e3eb933136206';
const before='let t=!0,n=new ResizeObserver(()=>{t&&(t=!1,n.disconnect(),i())});return n.observe(e.view.dom),()=>{t=!1,n.disconnect()}';
const after='let t=!0,a=null,n=new ResizeObserver(()=>{t&&(t=!1,n.disconnect(),a=requestAnimationFrame(i))});return n.observe(e.view.dom),()=>{t=!1,n.disconnect(),a!==null&&cancelAnimationFrame(a)}';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function applyRuntimePatches(runtimeSnapshotRoot){
 const root=path.resolve(runtimeSnapshotRoot),workspace=path.resolve(__dirname,'../../../..');
 const research=path.join(workspace,'research');
 if(root===research||root.startsWith(research+path.sep))throw Error('Refusing to patch original research snapshot');
 const file=path.join(root,'extracted/webview/assets',filename),source=fs.readFileSync(file,'utf8');
 const sourceHash=hash(source);
 if(sourceHash!==originalSHA256)throw Error('Original runtime SHA256 mismatch: '+filename+' '+sourceHash);
 if(source.split(before).length!==2)throw Error('Expected exactly one original lsc autofocus observer');
 const offset=source.indexOf(before),patched=source.replace(before,after);
 const manifest={title:'원본 편집기 포커스 순서 보정',snapshotVersion:'26.1027.6604',patches:[{id:'lsc-autofocus-after-resize-delivery',file:'extracted/webview/assets/'+filename,originalSHA256,patchedSHA256:hash(patched),offset,original:before,replacement:after,reason:'Original one-shot ResizeObserver synchronously focuses ProseMirror during resize delivery. Focus changes the composer and notification layout, causing skipped ancestor notifications. Schedule only autofocus on the next animation frame, preserving the existing one-shot disconnect and cancelling pending focus on effect cleanup.',preserved:['Original editor/controller and focus eligibility checks','All original measurement and native geometry observers','Errors remain visible and cause probe failure','Single shared app-initial module identity']} ]};
 fs.writeFileSync(file,patched,'utf8');
 fs.writeFileSync(path.join(root,'runtime-patches.provenance.json'),JSON.stringify(manifest,null,2)+'\n');
 return manifest;
}
// 오른쪽 경계 왕복 수정. 투명 창 원점은 호스트가 먼저 옮기고 카드 local x는 렌더러가 뒤따라 보정하는데,
// 원본은 그 보정을 드래그 중에도 스프링으로 보간한다. 드래그 동안만 원본의 즉시 이동 경로를 쓰게 한다.
// mascotDragState는 렌더러가 실제 이동을 확인한 뒤 running-left/right로 두고 놓으면 null로 되돌린다.
const TRAY_DRAG_PATCH={
 id:'tray-jump-while-dragging',
 reason:'드래그 중 카드 위치 보정에서 스프링 지연을 없애 오른쪽 경계의 왕복을 줄인다. 드래그 밖의 스프링과 Quick Chat 포커스 분기는 그대로다.',
 esm:{file:'avatar-overlay-native-page-3b2745370183.js',function:'n_',functionStart:'function n_(e){',functionSha256:'68cbb1df753bfc5505e31715cb792f13b378fbbb1c31ba2b66d5780fecaf4f7c',before:'let He=ge===void 0||ge,Ue=',after:'let He=(ge===void 0||ge)&&m==null,Ue=',required:['animatesQuickChatPresentation:ge','mascotDragState:m']},
 rspack:{file:'webview/assets/async/620883.f45639461f.js',module:'XpSi',function:'nY',functionStart:'function nY(e){',moduleSha256:'bdb59e9f232efe554e586a6a4c8899b9172a33ac41c6d0e3ac7413e165f758f5',before:'let tj=void 0===eM||eM,tF=',after:'let tj=(void 0===eM||eM)&&null==f,tF=',required:['animatesQuickChatPresentation:eM','mascotDragState:f']},
};
// 지점이 정확히 하나이고, 바꾸려는 변수가 그 함수의 해당 prop인지 확인한다.
function locateTrayPatch(source,spec){
 if(source.split(spec.before).length!==2)throw Error('드래그 카드 패치 지점이 유일하지 않습니다: '+spec.function);
 const at=source.indexOf(spec.before),start=source.lastIndexOf(spec.functionStart,at);
 if(start<0)throw Error('드래그 카드 패치 함수를 찾지 못했습니다: '+spec.function);
 const scope=source.slice(start,at);
 for(const binding of spec.required)if(!scope.includes(binding))throw Error('드래그 카드 패치 바인딩이 달라졌습니다: '+binding);
 return at;
}
function applyTrayPatch(source,spec){const at=locateTrayPatch(source,spec);return source.slice(0,at)+spec.after+source.slice(at+spec.before.length);}
// 감사용: n_만 정해진 패치를 허용하고 나머지는 원문과 같아야 한다.
function auditEsmFunction(name,original,ported){
 const spec=TRAY_DRAG_PATCH.esm;
 if(name!==spec.function){if(hash(original)!==hash(ported))throw Error('Unreviewed original UI body edit: '+name);return{sha256:hash(original),unchanged:true};}
 if(hash(original)!==spec.functionSha256)throw Error('드래그 카드 패치 대상 원문이 다릅니다: '+name);
 const expected=applyTrayPatch(original,spec);
 if(hash(expected)!==hash(ported))throw Error('Unreviewed original UI body edit: '+name);
 return{sha256:hash(original),unchanged:false,patch:{id:TRAY_DRAG_PATCH.id,before:spec.before,after:spec.after,patchedSha256:hash(ported)}};
}
// Rspack 파생 manifest에 이 패치가 정확히 한 번, 정해진 내용으로 들어 있는지 확인한다.
function verifyRspackTrayPatch(patches,readFile){
 const spec=TRAY_DRAG_PATCH.rspack,found=patches.filter(item=>item.id===TRAY_DRAG_PATCH.id);
 if(found.length!==1)throw Error('Rspack 드래그 카드 패치 항목은 하나여야 합니다.');
 const item=found[0],source=readFile(spec.file);
 if(item.file!==spec.file||item.module!==spec.module||item.addition!==spec.after||item.deleteLength!==spec.before.length||item.sourceSha256!==hash(source)||item.at!==locateTrayPatch(source,spec))throw Error('Rspack 드래그 카드 패치 내용이 다릅니다.');
 return{id:item.id,file:item.file,at:item.at};
}
module.exports={applyRuntimePatches,TRAY_DRAG_PATCH,locateTrayPatch,applyTrayPatch,auditEsmFunction,verifyRspackTrayPatch};
if(require.main===module){if(!process.argv[2])throw Error('Usage: node patch-runtime.cjs <copied-runtime-snapshot-root>');console.log(JSON.stringify(applyRuntimePatches(process.argv[2])));}
