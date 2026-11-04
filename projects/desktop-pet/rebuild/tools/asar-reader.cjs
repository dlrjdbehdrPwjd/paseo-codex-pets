// 원본 앱을 실행하지 않고 ASAR 구성원만 읽는다.
const fs=require('node:fs'),path=require('node:path');
function openAsar(filename){
 const fd=fs.openSync(filename,'r'),size=fs.fstatSync(fd).size;
 function read(offset,length){
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>size)throw Error('ASAR 범위를 벗어난 읽기입니다.');
  const bytes=Buffer.alloc(length);if(fs.readSync(fd,bytes,0,length,offset)!==length)throw Error('ASAR 읽기가 끝나지 않았습니다.');return bytes;
 }
 try{
  const prefix=read(0,16),headerLength=prefix.readUInt32LE(12),dataOffset=8+prefix.readUInt32LE(4);
  if(headerLength>64*1024*1024||16+headerLength>dataOffset)throw Error('ASAR 헤더가 올바르지 않습니다.');
  const header=JSON.parse(read(16,headerLength).toString('utf8')),entries=new Map();
  function walk(node,at=''){for(const[name,entry]of Object.entries(node.files??{})){
   if(!name||name==='.'||name==='..'||/[\\/\0]/.test(name))throw Error('ASAR 구성원 이름이 올바르지 않습니다.');
   const member=at?at+'/'+name:name;if(entry.files)walk(entry,member);else entries.set(member,entry);
  }}walk(header);
  return {entries,read(member){
   const entry=entries.get(member);if(!entry||entry.link)throw Error('ASAR 일반 파일이 없습니다: '+member);
   if(entry.unpacked){const base=path.resolve(filename+'.unpacked'),file=path.resolve(base,...member.split('/'));
    if(!file.startsWith(base+path.sep))throw Error('ASAR 외부 경로입니다.');
    const resolved=fs.realpathSync(file);if(!resolved.startsWith(fs.realpathSync(base)+path.sep))throw Error('ASAR 외부 링크입니다.');return fs.readFileSync(file);
   }
   const offset=Number(entry.offset);if(!Number.isSafeInteger(offset)||offset<0)throw Error('ASAR 오프셋이 올바르지 않습니다.');return read(dataOffset+offset,entry.size);
  },close(){fs.closeSync(fd);}};
 }catch(error){fs.closeSync(fd);throw error;}
}
module.exports={openAsar};
