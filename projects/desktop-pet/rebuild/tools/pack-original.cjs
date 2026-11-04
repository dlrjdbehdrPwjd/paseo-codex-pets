// 원본 ASAR의 데이터 구간을 복사하고 파생 모듈만 덧붙인다.
// 파일 수만큼 긴 경로를 다시 순회하지 않고 원본 구성원 오프셋을 유지한다.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{openAsar}=require('./asar-reader.cjs');
function packOriginal(sourceAsar,originalDir,overrides=[]){
 const original=path.resolve(originalDir),target=original+'.asar',temporary=target+'.'+crypto.randomUUID()+'.tmp',archive=openAsar(sourceAsar),input=fs.openSync(sourceAsar,'r');let output;
 try{
  const prefix=Buffer.alloc(16);fs.readSync(input,prefix,0,16,0);const base=8+prefix.readUInt32LE(4),dataSize=fs.fstatSync(input).size-base,directory=()=>({files:Object.create(null)}),header=directory(),extra=[];let offset=dataSize;
  function put(member,entry){let node=header;const parts=member.split('/');if(parts.some(name=>!name||name==='.'||name==='..'||/[\\\0]/.test(name)))throw Error('ASAR 구성원 경로가 올바르지 않습니다.');for(const name of parts.slice(0,-1))node=(Object.hasOwn(node.files,name)?node.files[name]:(node.files[name]=directory()));node.files[parts.at(-1)]=entry;}
  function append(member,bytes){const blockSize=4*1024*1024,blocks=[];for(let at=0;at<bytes.length;at+=blockSize)blocks.push(crypto.createHash('sha256').update(bytes.subarray(at,at+blockSize)).digest('hex'));if(!blocks.length)blocks.push(crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex'));
   put(member,{size:bytes.length,offset:String(offset),integrity:{algorithm:'SHA256',hash:crypto.createHash('sha256').update(bytes).digest('hex'),blockSize,blocks}});extra.push(bytes);offset+=bytes.length;
  }
  for(const[member,entry]of archive.entries){if(!member.startsWith('webview/'))continue;if(entry.link)throw Error('원본 UI 링크는 지원하지 않습니다.');if(entry.unpacked)append('extracted/'+member,archive.read(member));else put('extracted/'+member,entry);}
  const derived=path.join(original,'derived');for(const name of fs.readdirSync(derived)){if(!/\.(?:js|cjs|mjs)$/.test(name))continue;append('derived/'+name,fs.readFileSync(path.join(derived,name)));}
  for(const member of new Set(overrides)){const file=path.resolve(original,member);if(!file.startsWith(original+path.sep)||!member.startsWith('extracted/webview/'))throw Error('원본 UI 보정 경로가 올바르지 않습니다.');append(member,fs.readFileSync(file));}
  const json=Buffer.from(JSON.stringify(header)),padding=(4-json.length%4)%4,head=Buffer.alloc(16+json.length+padding);head.writeUInt32LE(4,0);head.writeUInt32LE(8+json.length+padding,4);head.writeUInt32LE(4+json.length+padding,8);head.writeUInt32LE(json.length,12);json.copy(head,16);
  output=fs.openSync(temporary,'wx');const write=bytes=>{let at=0;while(at<bytes.length){const length=fs.writeSync(output,bytes,at,bytes.length-at);if(!length)throw Error('원본 ASAR 쓰기가 끝나지 않았습니다.');at+=length;}};write(head);const buffer=Buffer.alloc(4*1024*1024);let at=base;while(at<base+dataSize){const length=fs.readSync(input,buffer,0,Math.min(buffer.length,base+dataSize-at),at);if(!length)throw Error('원본 ASAR 데이터가 중간에 끝났습니다.');write(buffer.subarray(0,length));at+=length;}for(const bytes of extra)write(bytes);fs.closeSync(output);output=undefined;
  if(fs.existsSync(target))fs.unlinkSync(target);fs.renameSync(temporary,target);return target;
 }finally{if(output!==undefined)fs.closeSync(output);archive.close();fs.closeSync(input);if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
module.exports={packOriginal};
