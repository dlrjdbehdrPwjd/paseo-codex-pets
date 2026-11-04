/* Snapshot shipped bytes; parse imports as data. Never import target modules. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {init,parse}=require('es-module-lexer');
const workspace=path.resolve(__dirname,'../../../..');
const output=path.join(workspace,'research/desktop-pet/complete-26.1027.6604');
const source=process.argv[2]||'C:/Program Files/WindowsApps/OpenAI.Codex_26.1027.6604.0_x64__2p2nqsd0c76g0/app/resources/app.asar';
const runtimeOnly=process.argv.includes('--runtime-only');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=(file,value)=>fs.writeFileSync(path.join(output,file),JSON.stringify(value,null,2));
function safe(base,relative){const result=path.resolve(base,relative);if(!result.startsWith(path.resolve(base)+path.sep))throw Error('Path escapes snapshot: '+relative);return result;}
async function digest(file){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
(async()=>{
 await init;fs.mkdirSync(output,{recursive:true});
 const snapshot=runtimeOnly?source:path.join(output,'app.asar');if(!fs.existsSync(snapshot))fs.copyFileSync(source,snapshot);
 const sourceHash=await digest(source),snapshotHash=runtimeOnly?sourceHash:await digest(snapshot);if(sourceHash!==snapshotHash)throw Error('Source and saved ASAR mismatch');
 const fd=fs.openSync(snapshot,'r'),prefix=Buffer.alloc(16);fs.readSync(fd,prefix,0,16,0);
 const raw=Buffer.alloc(prefix.readUInt32LE(12));fs.readSync(fd,raw,0,raw.length,16);const header=JSON.parse(raw),dataOffset=8+prefix.readUInt32LE(4);
 const inventory=[];function walk(node,at=''){for(const[name,entry]of Object.entries(node.files||{})){const member=at?at+'/'+name:name;if(entry.files)walk(entry,member);else inventory.push({path:member,...entry});}}walk(header);
 const records=[],unpacked=[],extract=path.join(output,'extracted');fs.mkdirSync(extract,{recursive:true});
 for(const entry of inventory){
  if(entry.link)continue;
  const selected=entry.path==='package.json'||entry.path.startsWith('.vite/build/')||entry.path.startsWith('webview/');
  if(!selected&&(runtimeOnly||!entry.unpacked))continue;
  let bytes;
  if(entry.unpacked){const from=safe(source+'.unpacked',entry.path);if(!fs.existsSync(from)){unpacked.push({path:entry.path,missing:true});continue;}bytes=fs.readFileSync(from);if(!runtimeOnly){const to=safe(snapshot+'.unpacked',entry.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes);}unpacked.push({path:entry.path,size:bytes.length,sha256:sha(bytes)});}
  else{bytes=Buffer.alloc(entry.size);if(fs.readSync(fd,bytes,0,bytes.length,dataOffset+Number(entry.offset))!==bytes.length)throw Error('Short read: '+entry.path);}
  const hash=sha(bytes);const integrityMismatch=entry.integrity?.hash&&entry.integrity.hash!==hash;if(integrityMismatch&&!entry.unpacked)throw Error('Packed member integrity mismatch: '+entry.path);
  const to=safe(extract,entry.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes);
  records.push({path:entry.path,size:bytes.length,sha256:hash,unpacked:!!entry.unpacked,...(integrityMismatch?{integrityMismatch:true,headerHash:entry.integrity.hash}:{})});
 }
 fs.closeSync(fd);json('inventory.json',{schema:'codex-pet-package-inventory/v1',asarSha256:snapshotHash,entries:inventory});
 json('snapshot.json',{title:'코덱스 펫 전체 원본 보존',version:'26.1027.6604.0',source,asarSha256:snapshotHash,asarBytes:fs.statSync(snapshot).size,headerSha256:sha(raw),savedAt:new Date().toISOString(),mode:'static collection; shipped application not executed',extractedFiles:records.length,extractedBytes:records.reduce((n,r)=>n+r.size,0),records,unpacked});
 if(runtimeOnly){const summary={asarSha256:snapshotHash,inventory:inventory.length,extracted:records.length,mode:'local-runtime-preparation'};json('summary.json',summary);console.log(JSON.stringify(summary));return;}
 const members=new Set(inventory.map(e=>e.path)),modules=new Map(),unresolved=[];
 for(const record of records.filter(r=>/\.(?:m?js|cjs)$/.test(r.path)&&!r.path.startsWith('node_modules/'))){
  const text=fs.readFileSync(path.join(extract,record.path),'utf8');let imports=[],error;
  try{const[result]=parse(text,record.path);imports=result.map(item=>({specifier:item.n,expression:text.slice(item.s,item.e),kind:item.d===-1?'static':item.d===-2?'import-meta':'dynamic',start:item.s,end:item.e})).filter(r=>r.kind!=='import-meta');}catch(e){error=e.message;}
  // CommonJS entrypoints are handled separately from ESM lexical imports.
  for(const match of text.matchAll(/\brequire\(\s*(["'`])([^"'`]+)\1\s*\)/g))imports.push({specifier:match[2],kind:'literal-require',start:match.index,end:match.index+match[0].length});
  const dependencies=[];
  for(const item of imports){let resolved=null;if(item.specifier?.startsWith('.')){const normalized=path.posix.normalize(path.posix.join(path.posix.dirname(record.path),item.specifier));resolved=[normalized,normalized+'.js',normalized+'/index.js'].find(p=>members.has(p))||null;}
   const edge={...item,resolved};dependencies.push(edge);if(!resolved)unresolved.push({from:record.path,...edge});}
  modules.set(record.path,{path:record.path,sha256:record.sha256,dependencies,...(error?{parseError:error}:{})});
 }
 const seeds=[...modules.keys()].filter(p=>/webview\/assets\/(?:avatar-|pet-|pets-|controls-|companion-|work-companion-|use-avatar-|use-floating-window-|native-api-|native-room-)/.test(p));
 const closure=new Set();function visit(p){if(closure.has(p))return;closure.add(p);for(const edge of modules.get(p)?.dependencies||[])if(edge.resolved)visit(edge.resolved);}seeds.forEach(visit);
 json('dependency-graph.json',{title:'펫 진입점과 전체 모듈 의존성',mode:'static ESM lexical imports and literal CommonJS requires; not execution',seeds,closure:[...closure].sort(),modules:[...modules.values()],unresolved,limitations:['Dynamic expressions and computed runtime assets remain unresolved explicitly.','Literal require scanning may include inactive branches; it is not execution evidence.','File closure includes shared application code and does not imply every shared feature is pet-related.','Native binaries and OS services require separate contract analysis.']});
 const summary={asarSha256:snapshotHash,inventory:inventory.length,extracted:records.length,modules:modules.size,petSeeds:seeds.length,closure:closure.size,unresolved:unresolved.length,sourceMaps:records.filter(r=>r.path.endsWith('.map')).length,unpackedMissing:unpacked.filter(r=>r.missing).length};json('summary.json',summary);console.log(JSON.stringify(summary));
})().catch(error=>{console.error(error);process.exitCode=1;});
