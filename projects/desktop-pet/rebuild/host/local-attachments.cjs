const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
// 임시 이미지의 생성·정상 종료 정리는 펫이 소유한다. 강제 종료 시 부모가 실행 세대 폴더를 정리한다.
function createLocalAttachments({directory,request}){
 const owned=new Set();let pending=Promise.resolve();
 // 개별 승인 실패는 호출자에게 돌려주고, 후속 요청의 대기열에는 실패를 남기지 않는다.
 const grantPaths=paths=>{const task=Promise.resolve().then(()=>request('attachments.grant',paths));pending=Promise.all([pending,task.catch(()=>{})]).then(()=>{});return task;};
 async function persistImageFileToTemp({bytes,mimeType}){
  const extensions={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/avif':'avif','image/bmp':'bmp','image/tiff':'tiff','image/svg+xml':'svg','image/heic':'heic'};
  const extension=extensions[mimeType];if(!extension)throw Error('지원하지 않는 이미지 형식입니다.');
  if(!(bytes instanceof Uint8Array)&&!(bytes instanceof ArrayBuffer)&&!(Array.isArray(bytes)&&bytes.every(byte=>Number.isInteger(byte)&&byte>=0&&byte<=255)))throw Error('이미지 첨부 데이터가 올바른 바이트 배열이 아닙니다.');
  const data=Buffer.from(bytes);if(!data.length||data.length>32*1024*1024)throw Error('이미지 첨부 크기가 올바르지 않습니다.');
  await fs.mkdir(directory,{recursive:true});const file=path.join(directory,`image-${randomUUID()}.${extension}`);await fs.writeFile(file,data,{flag:'wx'});owned.add(file);await grantPaths([file]);return file;
 }
 async function prepare(value){
  if(Array.isArray(value))return Promise.all(value.map(prepare));
  if(!value||typeof value!=='object'||Buffer.isBuffer(value))return value;
  const copy={...value};
  for(const key of ['uploadSrc','imageDataUrl','src'])if(typeof copy[key]==='string'&&copy[key].startsWith('data:image/')){
   const match=/^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(copy[key]);if(!match)throw Error('이미지 데이터 형식이 올바르지 않습니다.');
   const file=await persistImageFileToTemp({bytes:Buffer.from(match[2],'base64'),mimeType:match[1]});
   delete copy.uploadSrc;delete copy.imageDataUrl;delete copy.src;copy.localPath=file;if(key==='imageDataUrl'&&typeof copy.appName==='string')copy.imagePath=file;break;
  }
  for(const [key,item]of Object.entries(copy))if(item&&typeof item==='object')copy[key]=await prepare(item);
  return copy;
 }
 return{grantPaths,persistImageFileToTemp,async prepareArgs(args){await pending;return prepare(args);},async flush(){await pending;},async dispose(){await pending.catch(()=>{});for(const file of owned)await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});owned.clear();}};
}
module.exports={createLocalAttachments};
