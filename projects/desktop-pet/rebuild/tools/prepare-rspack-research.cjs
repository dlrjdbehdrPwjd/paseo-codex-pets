// 현재 원본의 실제 lazy 경로로 선택한 바이트만 격리 연구 폴더에 보존한다.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {openAsar}=require('./asar-reader.cjs'),{createRuntimeCapsule,findModuleLoadPlans}=require('./rspack-runtime.cjs'),{buildIndex,closure}=require('./rspack-index.cjs');
function prepare(filename,output){
 const archive=openAsar(filename);try{
  const html=archive.read('webview/index.html').toString(),entries=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(m=>'webview/'+m[1].replace(/^\//,''));
  let runtime,file;for(const entry of entries){const text=archive.read(entry).toString();if(!text.includes('__webpack_require__'))continue;try{const r=createRuntimeCapsule(text);if(runtime)throw Error('로더가 중복됩니다.');runtime=r;file=entry;}catch(e){throw e;}}
  if(!runtime)throw Error('원본 로더가 없습니다.');
  const targets=['XpSi','aPDo'],plans=[],chunks=new Set();
  // 본체를 실행하지 않고 진입점의 서비스/공통 청크를 등록한다.
  const entryModules=buildIndex([[file,archive.read(file).toString()]]),bootstrap=entryModules.get(runtime.info.bootstrap.entry);
  if(!bootstrap)throw Error('본체 진입점 팩터리가 없습니다.');for(const id of bootstrap.dynamicChunks)chunks.add(String(id));
  const rootText=archive.read(file).toString().slice(bootstrap.start,bootstrap.end),basePlans=findModuleLoadPlans('({'+rootText+'})'),mainPlans=[];
  for(const plan of basePlans){if(plan.module==='GaA7')continue;for(const id of plan.chunks){const member=runtime.info.chunks[id];if(!member||!archive.entries.has(member))continue;const text=archive.read(member).toString(),module=buildIndex([[member,text]]).get(plan.module);if(!module)continue;
   const paths=findModuleLoadPlans('({'+text.slice(module.start,module.end)+'})').filter(p=>p.module==='MeKU');
   if(paths.length!==1)throw Error('원본 앱 공통 모듈 경로가 유일하지 않습니다.');for(const main of paths){mainPlans.push(main);for(const chunk of main.chunks)chunks.add(chunk);}
  }}
  if(mainPlans.length!==1)throw Error('원본 앱 공통 청크를 찾지 못했습니다.');
  let locale;
  for(const member of Object.values(runtime.info.chunks)){
   if(!archive.entries.has(member))continue;const text=archive.read(member).toString();if(!targets.some(id=>text.includes('"'+id+'"')))continue;
   for(const plan of findModuleLoadPlans(text))if(targets.includes(plan.module)){if(plans.some(p=>p.module===plan.module))throw Error('원본 lazy 경로가 중복됩니다: '+plan.module);plans.push({...plan,file:member});for(const id of plan.chunks)chunks.add(id);}
  }
  for(const member of Object.values(runtime.info.chunks)){
   if(!archive.entries.has(member))continue;const text=archive.read(member).toString(),at=text.indexOf('"settings.pets.pickPet.title"');
   if(at<0||!/[\uac00-\ud7a3]/.test(text.slice(at,at+100)))continue;
   const matches=[...buildIndex([[member,text]]).values()].filter(m=>text.slice(m.start,m.end).includes('"settings.pets.pickPet.title"'));
   if(matches.length!==1||locale)throw Error('원본 한국어 목록이 유일하지 않습니다.');locale={file:member,module:matches[0].id};
  }
  if(!locale)throw Error('원본 한국어 목록을 찾지 못했습니다.');
  if(plans.length!==targets.length)throw Error('원본 lazy 경로가 누락됐습니다.');
  const noJs=runtime.info.noJsPattern&&new RegExp(runtime.info.noJsPattern.source,runtime.info.noJsPattern.flags);
  const files=new Set([...entries,locale.file]);for(const id of chunks){if(noJs?.test(id))continue;const member=runtime.info.chunks[id];if(!member)throw Error('원본 청크 파일을 해석하지 못했습니다: '+id);files.add(member);}
  const sources=[...files].map(member=>[member,archive.read(member).toString()]),index=buildIndex(sources,{retainConflicts:true}),contract=closure(index,targets);
  if(contract.missing.length)throw Error('원본 lazy 경로에 없는 의존성이 있습니다: '+JSON.stringify(contract.missing));
  const raw=path.join(output,'extracted');fs.mkdirSync(raw,{recursive:true});
  const records=[];
  // CSS·이미지·폰트는 계산된 참조도 있어 모두 보존한다. 앱의 다른 JS 진입점은 가져오지 않는다.
  for(const[member,entry]of archive.entries){const native=member.startsWith('.vite/build/');if((!native&&!member.startsWith('webview/'))||entry.link||entry.unpacked||(!native&&/\.js$/.test(member)&&!files.has(member)))continue;
   const bytes=archive.read(member),to=path.join(raw,member);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes);records.push({file:member,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  const derived=path.join(output,'derived');fs.mkdirSync(derived,{recursive:true});
  // 복사한 실행용 트리에만 생성 로더를 추가하고 보존한 원본 바이트는 바꾸지 않는다.
  const capsuleFile='webview/assets/pet-runtime.js';fs.writeFileSync(path.join(raw,capsuleFile),runtime.code);
  const groups=[...basePlans.map(p=>p.chunks),...mainPlans.map(p=>p.chunks),...plans.map(p=>p.chunks)];
  const loader=`// 원본 청크 선택·등록 순서를 유지한다. Codex 본체 진입점은 호출하지 않는다.\nimport {__webpack_require__ as requireOriginal} from '../extracted/${capsuleFile}';\nfor(const group of ${JSON.stringify(groups)})await Promise.all(group.map(id=>requireOriginal.e(id)));\nexport {requireOriginal};\n`;
  fs.writeFileSync(path.join(derived,'rspack-loader.js'),loader);
  const manifest={title:'코덱스 현재 펫 원본 로더 추출',version:JSON.parse(archive.read('package.json')).version,runtime:{file,sha256:runtime.sha256,info:runtime.info},plans,groups,chunks:[...chunks],modules:[...index.values()],contract,duplicateHandling:'원본 로더의 등록과 모듈 캐시를 그대로 사용한다. 정적 분석기가 임의로 중복 팩터리를 선택하지 않는다.',records,bootstrapExecuted:false};
  fs.writeFileSync(path.join(output,'rspack-manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(output,'locale.json'),JSON.stringify(locale,null,2));
  const fd=fs.openSync(filename,'r'),buffer=Buffer.alloc(4*1024*1024),digest=crypto.createHash('sha256');try{let length;while(length=fs.readSync(fd,buffer))digest.update(buffer.subarray(0,length));}finally{fs.closeSync(fd);}
  fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify({version:manifest.version,bundler:'rspack',asarSha256:digest.digest('hex')},null,2));return manifest;
 }finally{archive.close();}
}
if(require.main===module){try{const result=prepare(path.resolve(process.argv[2]),path.resolve(process.argv[3]));console.log(JSON.stringify({modules:result.modules.length,chunks:result.chunks.length,complete:result.contract.complete,bootstrapExecuted:false}));}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={prepare};
