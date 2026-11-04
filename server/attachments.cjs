'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{randomUUID}=require('node:crypto');
const IMAGE_EXTENSIONS={'image/png':'png','image/jpeg':'jpg','image/gif':'gif','image/webp':'webp','image/avif':'avif','image/bmp':'bmp','image/tiff':'tiff','image/svg+xml':'svg','image/heic':'heic'};
const MIME_BY_EXTENSION={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',tif:'image/tiff',tiff:'image/tiff',svg:'image/svg+xml',heic:'image/heic',pdf:'application/pdf',json:'application/json',txt:'text/plain',md:'text/markdown',csv:'text/csv',html:'text/html',zip:'application/zip'};
const FILE_CAP=32*1024*1024,TOTAL_CAP=64*1024*1024;
const mimeFor=name=>MIME_BY_EXTENSION[path.extname(name).slice(1).toLowerCase()]??'application/octet-stream';
function bytes(value){
 if(value instanceof Uint8Array)return Buffer.from(value);
 if(value instanceof ArrayBuffer)return Buffer.from(value);
 if(Array.isArray(value)&&value.every(byte=>Number.isInteger(byte)&&byte>=0&&byte<=255))return Buffer.from(value);
 throw Error('첨부 데이터가 올바른 바이트 배열이 아닙니다.');
}
function bounded(data,limit){if(data.byteLength>limit)throw Error(`첨부 크기가 허용 한도(${Math.floor(limit/1048576)} MiB)를 넘었습니다.`);return data;}
/** Main-process services for the original picker/paste pipeline. */
function createAttachmentHost({directory=path.join(os.tmpdir(),'paseo-pet-rebuild-attachments'),maxFileBytes=FILE_CAP}={}){
 const grants=new Map(),owned=new Set(),root=path.resolve(directory);let disposed=false;
 const lexical=value=>{if(typeof value!=='string'||!path.isAbsolute(value))throw Error('첨부파일의 절대 경로가 필요합니다.');return path.normalize(value);};
 function grantPaths(paths){
  if(disposed)throw Error('첨부 서비스가 종료됐습니다.');
  if(!Array.isArray(paths))throw Error('첨부 경로 목록이 필요합니다.');
  return Promise.all(paths.map(value=>{const file=lexical(typeof value==='string'?value:value.fsPath);const pending=fs.realpath(file);grants.set(file,pending);return pending;}));
 }
 async function readBytes(value){
  if(disposed)throw Error('첨부 서비스가 종료됐습니다.');
  const file=lexical(value),grant=grants.get(file);if(!grant)throw Error('선택하거나 붙여넣은 첨부파일만 읽을 수 있습니다.');
  const expected=await grant,canonical=await fs.realpath(file);if(canonical!==expected)throw Error('첨부 경로가 선택 이후 변경됐습니다.');
  const info=await fs.stat(canonical);if(!info.isFile())throw Error('이 파세오 연결에서는 폴더 첨부를 전송할 수 없습니다.');
  if(info.size>maxFileBytes)throw Error('첨부파일 크기가 허용 한도를 넘었습니다.');
  return bounded(await fs.readFile(canonical),maxFileBytes);
 }
 return {
  grantPaths,readBytes,
  async readBinary({path:file,hostId}={}){if(hostId!=='local')throw Error('로컬 첨부 읽기에는 local 호스트가 필요합니다.');return{contentsBase64:(await readBytes(file)).toString('base64')};},
  async persistImageFileToTemp({bytes:value,mimeType}={}){
   if(disposed)throw Error('첨부 서비스가 종료됐습니다.');
   const extension=IMAGE_EXTENSIONS[mimeType];if(!extension)throw Error('지원하지 않는 붙여넣기 이미지 형식입니다.');
   const data=bounded(bytes(value),maxFileBytes);if(!data.length)throw Error('빈 이미지는 첨부할 수 없습니다.');
   await fs.mkdir(root,{recursive:true});const filename=path.join(root,`image-${randomUUID()}.${extension}`);
   await fs.writeFile(filename,data,{flag:'wx'});owned.add(filename);await grantPaths([filename]);return filename;
  },
  async dispose(){disposed=true;grants.clear();for(const file of owned){if(!path.resolve(file).startsWith(root+path.sep))throw Error('관리하는 첨부 경로가 아닙니다.');await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});}owned.clear();},
 };
}
function dataImage(value,maxBytes=FILE_CAP){
 if(typeof value!=='string')throw Error('이미지 데이터가 없습니다.');
 const match=/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(value);
 if(!match||match[2].length%4!==0)throw Error('이미지는 올바른 base64 data URL이어야 합니다.');
 if(match[2].length>Math.ceil(maxBytes/3)*4)throw Error('이미지 첨부 크기가 허용 한도를 넘었습니다.');
 const data=bounded(Buffer.from(match[2],'base64'),maxBytes);
 if(!data.length||data.toString('base64')!==match[2])throw Error('이미지 base64 데이터가 손상됐습니다.');
 return{bytes:data,mimeType:match[1].toLowerCase()};
}
function xmlAttribute(value){return String(value??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
function xmlText(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');}
// Original N3t/L3t/z3t appshot serialization contract; the serializer belongs to
// the service boundary, while the original capture/chip/removal UI stays intact.
function appshotText(context){
 const attrs=[`app="${xmlAttribute(context.appName)}"`,`bundle-identifier="${xmlAttribute(context.bundleIdentifier)}"`];
 if(context.windowTitle?.trim())attrs.push(`window-title="${xmlAttribute(context.windowTitle.trim())}"`);
 const image=context.imageName??context.imagePath;if(image!=null)attrs.push(`image="${xmlAttribute(image)}"`);
 return[`<appshot ${attrs.join(' ')}>`,xmlText(context.axTree),'</appshot>'].join('\n');
}
function array(value,label){if(value==null)return[];if(!Array.isArray(value))throw Error(`${label} 첨부 목록이 올바르지 않습니다.`);return value;}
function descriptorPath(value){const p=value.fsPath??value.localPath??value.path;if(typeof p!=='string'||!path.isAbsolute(p))throw Error('첨부파일의 로컬 절대 경로가 없습니다.');return p;}

/** Converts every original Ev attachment into actual SDK media or fails. */
function createSubmissionAdapter({readLocalFile,uploadFile,maxFileBytes=FILE_CAP,maxTotalBytes=TOTAL_CAP}={}){
 return {async prepareSubmission({prompt,appshotContexts,attachmentContext}={}){
  if(typeof prompt!=='string')throw Error('전송할 메시지가 올바르지 않습니다.');
  const context=attachmentContext??{},images=[],attachments=[],seenFiles=new Set(),seenImages=new Set(),seenAppshots=new Set();let total=0;
  const charge=data=>{bounded(data,maxFileBytes);total+=data.length;if(total>maxTotalBytes)throw Error('첨부파일 합계가 전송 한도를 넘었습니다.');return data;};
  for(const [field,value]of Object.entries(context))if(/attachments?|contexts?/i.test(field)&&!['addedFiles','fileAttachments','imageAttachments','appshotContexts','ideContext'].includes(field)&&value!=null&&(!Array.isArray(value)||value.length))throw Error(`아직 연결되지 않은 원본 첨부 컨텍스트: ${field}`);
  const read=async filename=>{if(typeof readLocalFile!=='function')throw Error('실제 로컬 첨부 읽기 서비스가 연결되지 않았습니다.');return bytes(await readLocalFile(filename));};
  const image=async value=>{
   if(!value||typeof value!=='object')throw Error('이미지 첨부 정보가 올바르지 않습니다.');
   if(value.uploadStatus==='uploading'||value.uploadStatus==='error')throw Error('아직 준비되지 않았거나 실패한 이미지가 있습니다.');
   const key=value.id!=null?`image-id:${value.id}`:value.localPath??value.imagePath??value.uploadSrc??value.src??value.imageDataUrl;
   if(seenImages.has(key))return;seenImages.add(key);
   let result;const data=value.uploadSrc??value.imageDataUrl??value.src;
   if(typeof data==='string'&&data.startsWith('data:'))result=dataImage(data,maxFileBytes);
   else if(value.localPath||value.imagePath){const filename=value.localPath??value.imagePath,inferred=mimeFor(value.filename??filename);result={bytes:await read(filename),mimeType:inferred.startsWith('image/')?inferred:mimeFor(filename)};}
   else throw Error('이 이미지의 원본 데이터나 로컬 경로를 읽을 수 없습니다.');
   if(!result.mimeType.startsWith('image/'))throw Error('이미지 첨부의 파일 형식을 확인할 수 없습니다.');
   charge(result.bytes);images.push({data:result.bytes.toString('base64'),mimeType:result.mimeType});
  };
  const upload=[];
  for(const file of [...array(context.addedFiles,'파일'),...array(context.fileAttachments,'파일')]){
   if(!file||typeof file!=='object')throw Error('파일 첨부 정보가 올바르지 않습니다.');
   const filename=descriptorPath(file),key=JSON.stringify([file.label,file.path,file.fsPath,file.startLine??null,file.endLine??null]);if(seenFiles.has(key))continue;seenFiles.add(key);
   if(file.isImageAttachment){await image({localPath:filename,filename:file.label});continue;}
   const data=charge(await read(filename)),fileName=file.label||path.basename(filename),mimeType=mimeFor(fileName);
   if(file.startLine!=null||file.endLine!=null){
    const start=file.startLine??1,end=file.endLine??Number.MAX_SAFE_INTEGER;
    if(!Number.isSafeInteger(start)||start<1||!Number.isSafeInteger(end)||end<start||data.includes(0))throw Error('첨부파일의 텍스트 줄 범위가 올바르지 않습니다.');
    const content=new TextDecoder('utf-8',{fatal:true}).decode(data),lines=content.split(/\r?\n/);
    if(start>lines.length)throw Error('첨부파일의 줄 범위가 파일 내용을 벗어났습니다.');
    attachments.push({type:'text',mimeType:'text/plain',title:`${fileName}:${start}-${Math.min(end,lines.length)}`,text:`File: ${filename}\nLines: ${start}-${Math.min(end,lines.length)}\n${lines.slice(start-1,end).join('\n')}`});
   }else upload.push({fileName,mimeType,bytes:data});
  }
  for(const value of array(context.imageAttachments,'이미지'))await image(value);
  for(const appshot of [...array(context.appshotContexts,'화면'),...array(appshotContexts,'화면')]){
   if(!appshot||typeof appshot!=='object')throw Error('화면 첨부 정보가 올바르지 않습니다.');
   const key=JSON.stringify(appshot);if(seenAppshots.has(key))continue;seenAppshots.add(key);
   if(appshot.imageName&&!appshot.imageDataUrl&&!appshot.imagePath)throw Error('화면 이미지 참조를 실제 이미지 데이터로 변환할 수 없습니다.');
   if(typeof appshot.appName!=='string'||typeof appshot.bundleIdentifier!=='string'||typeof appshot.axTree!=='string')throw Error('원본 화면 컨텍스트의 앱·접근성 정보가 올바르지 않습니다.');
   if(appshot.imageDataUrl||appshot.imagePath)await image(appshot);
   const serialized=appshotText(appshot);charge(Buffer.from(serialized));attachments.push({type:'text',mimeType:'text/plain',title:appshot.windowTitle??appshot.appName??'화면 컨텍스트',text:serialized});
  }
  if(context.ideContext!=null){
   if(typeof context.ideContext!=='string')throw Error('이 IDE 컨텍스트 형식을 파세오에 전송할 수 없습니다.');
   charge(Buffer.from(context.ideContext));
   attachments.push({type:'text',mimeType:'text/plain',title:'IDE 컨텍스트',text:context.ideContext});
  }
  // Do not upload any file until all local inputs were read and validated.
  if(upload.length&&typeof uploadFile!=='function')throw Error('실제 파세오 첨부 업로드 서비스가 연결되지 않았습니다.');
  for(const file of upload){const result=await uploadFile(file);if(result?.error||!result?.file)throw Error(result?.error??'파세오 첨부 업로드가 완료되지 않았습니다.');const item=result.file;if(item.type!=='uploaded_file'||typeof item.id!=='string'||typeof item.path!=='string'||typeof item.fileName!=='string'||typeof item.mimeType!=='string'||!Number.isSafeInteger(item.size)||item.size<0)throw Error('파세오 첨부 업로드 응답이 올바르지 않습니다.');attachments.push(item);}
  if(!prompt.trim()&&!images.length&&!attachments.length)throw Error('메시지나 첨부파일을 입력하세요.');
  return{text:prompt,media:{...(images.length?{images}:{}),...(attachments.length?{attachments}:{})}};
 }};
}
module.exports={createAttachmentHost,createSubmissionAdapter,appshotText,dataImage,FILE_CAP,TOTAL_CAP};
