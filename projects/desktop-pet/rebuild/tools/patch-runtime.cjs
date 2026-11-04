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
module.exports={applyRuntimePatches};
if(require.main===module){if(!process.argv[2])throw Error('Usage: node patch-runtime.cjs <copied-runtime-snapshot-root>');console.log(JSON.stringify(applyRuntimePatches(process.argv[2])));}
