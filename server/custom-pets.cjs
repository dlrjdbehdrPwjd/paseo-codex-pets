const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{inflateRawSync}=require('node:zlib'),{createHash,randomUUID}=require('node:crypto');
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,limit=16*1024*1024;
function commandPetId(text){const match=/^\s*npx\s+codex-pets\s+add\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s*$/.exec(text);return match?.[1]??null;}
function validatePack(manifest,image,id){
 if(!slug.test(id)||manifest.id!==id||typeof manifest.displayName!=='string'||!manifest.displayName.trim()||manifest.displayName.length>200||manifest.spritesheetPath!=='spritesheet.webp'||![undefined,1,2].includes(manifest.spriteVersionNumber))throw Error('펫 manifest 형식이 올바르지 않습니다.');
 if(image.length<16||image.length>limit||image.toString('ascii',0,4)!=='RIFF'||image.toString('ascii',8,12)!=='WEBP')throw Error('펫 이미지가 제한된 WebP 형식이 아닙니다.');
 return manifest;
}
function unpack(bytes,id){
 const files=new Map();let offset=0;
 while(offset+30<=bytes.length&&bytes.readUInt32LE(offset)===0x04034b50){
  const flags=bytes.readUInt16LE(offset+6),method=bytes.readUInt16LE(offset+8),size=bytes.readUInt32LE(offset+18),rawSize=bytes.readUInt32LE(offset+22),nameLength=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),start=offset+30+nameLength+extra,end=start+size;
  if(flags&9||rawSize>limit||end>bytes.length)throw Error('지원하지 않거나 손상된 펫 압축 파일입니다.');
  const name=bytes.toString('utf8',offset+30,offset+30+nameLength);if(!['pet.json','spritesheet.webp'].includes(name)||files.has(name))throw Error('펫 압축 파일에 허용되지 않은 항목이 있습니다.');
  const data=method===0?bytes.subarray(start,end):method===8?inflateRawSync(bytes.subarray(start,end),{maxOutputLength:limit}):null;
  if(!data||data.length!==rawSize)throw Error('펫 압축 데이터가 올바르지 않습니다.');files.set(name,data);offset=end;
 }
 const manifest=JSON.parse(files.get('pet.json')?.toString('utf8')??'null'),image=files.get('spritesheet.webp');if(!manifest||!image)throw Error('펫 패키지에 필수 파일이 없습니다.');validatePack(manifest,image,id);return{manifest,image};
}
async function download(url,max=limit){
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('펫 다운로드 실패: '+response.status);
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>max)throw Error('펫 다운로드 크기 제한을 초과했습니다.');chunks.push(chunk);}return Buffer.concat(chunks);
}
async function createCustomPets({directory=path.resolve(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),'pets'),onChange=()=>{},onSelect=async()=>{},log=()=>{},pollMs=1000}={}){
 let avatars=[],signature='',busy=false,closed=false,initialized=false;const pending=new Set(),cache=new Map();
 async function refresh(){
  if(busy||closed)return;busy=true;
  try{
   const entries=await fs.readdir(directory,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return[];throw error;}),next=[];
   for(const entry of entries){if(!entry.isDirectory()||!slug.test(entry.name))continue;try{
    const folder=path.join(directory,entry.name),manifestPath=path.join(folder,'pet.json'),imagePath=path.join(folder,'spritesheet.webp');
    const stats=await Promise.all([fs.lstat(manifestPath),fs.lstat(imagePath)]);if(stats.some(s=>!s.isFile()||s.isSymbolicLink())||stats[0].size>65536||stats[1].size>limit)continue;
    const stamp=stats.map(s=>s.size+':'+s.mtimeMs+':'+s.ctimeMs).join('|'),saved=cache.get(entry.name);if(saved?.stamp===stamp){next.push(saved.avatar);continue;}
    const [json,image]=await Promise.all([fs.readFile(manifestPath,'utf8'),fs.readFile(imagePath)]),manifest=validatePack(JSON.parse(json),image,entry.name);
    const avatar={id:'custom:'+manifest.id,displayName:manifest.displayName,description:typeof manifest.description==='string'?manifest.description:'',spriteVersionNumber:manifest.spriteVersionNumber??1,spritesheetDataUrl:'data:image/webp;base64,'+image.toString('base64'),spritesheetFingerprint:createHash('sha256').update(image).digest('hex'),directoryPath:folder,updatedAt:Math.max(...stats.map(s=>s.mtimeMs))};cache.set(entry.name,{stamp,avatar});next.push(avatar);
   }catch(error){log({customPetError:entry.name,message:String(error)});}}
   next.sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
   for(const key of cache.keys())if(!next.some(p=>p.id==='custom:'+key))cache.delete(key);
   const hash=createHash('sha256').update(JSON.stringify(next.map(({spritesheetDataUrl,...metadata})=>metadata))).digest('hex');if(hash===signature)return;
   const added=next.filter(p=>!avatars.some(old=>old.id===p.id));avatars=next;signature=hash;
   onChange({revision:signature});if(initialized&&added[0])await onSelect(added[0].id);initialized=true;
  }finally{busy=false;}
 }
 await refresh();const timer=setInterval(()=>{const work=refresh().catch(error=>log({customPetsError:String(error)}));pending.add(work);void work.finally(()=>pending.delete(work));},pollMs);timer.unref();
 return{
  list:()=>({directory,avatars}),refresh,
  async install(id){
   if(!slug.test(id))throw Error('펫 ID는 guga 같은 소문자 이름이어야 합니다.');
   const metadata=JSON.parse((await download('https://codex-pets.net/api/pets/'+id+'/share-data',1024*1024)).toString('utf8'));if(metadata.pet?.id!==id)throw Error('펫 조회 결과의 ID가 다릅니다.');
   const url=new URL(metadata.pet.downloadUrl??'/api/pets/'+id+'/download','https://codex-pets.net');if(url.protocol!=='https:')throw Error('펫 다운로드에 HTTPS가 필요합니다.');
   const {manifest,image}=unpack(await download(url),id);await fs.mkdir(directory,{recursive:true});
   const target=path.join(directory,id);await fs.mkdir(target,{recursive:true});if((await fs.lstat(target)).isSymbolicLink())throw Error('펫 설치 폴더가 심볼릭 링크입니다.');
   for(const[name,bytes]of [['spritesheet.webp',image],['pet.json',Buffer.from(JSON.stringify(manifest))]]){const temp=path.join(target,'.'+randomUUID()+'.tmp');try{await fs.writeFile(temp,bytes,{flag:'wx'});await fs.rename(temp,path.join(target,name));}finally{await fs.unlink(temp).catch(()=>{});}}
   while(busy)await new Promise(resolve=>setTimeout(resolve,20));await refresh();await onSelect('custom:'+id);return{id:'custom:'+id,displayName:manifest.displayName};
  },
  async dispose(){closed=true;clearInterval(timer);await Promise.allSettled([...pending]);},
 };
}
module.exports={createCustomPets,commandPetId,validatePack,unpack};
