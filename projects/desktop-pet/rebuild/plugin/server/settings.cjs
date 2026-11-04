'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
// Exact keys/defaults/types from shared.Mdt in the retained 26.1027.6604 bundle.
const PET_SETTINGS={
 'selected-avatar-id':{default:null,valid:value=>value===null||typeof value==='string'},
 'avatar-overlay-pet-visible':{default:true,valid:value=>typeof value==='boolean'},
 'avatar-overlay-mascot-width-px':{default:112,valid:value=>Number.isInteger(value)&&value>=80&&value<=224},
 'pet-visibility':{default:'always-visible',valid:value=>value==='always-visible'||value==='on-demand'},
};
function assertValue(key,value){const spec=PET_SETTINGS[key];if(!spec)throw Error(`연결되지 않은 원본 설정: ${key}`);if(value!==undefined&&!spec.valid(value))throw Error(`원본 설정 값의 형식이 올바르지 않습니다: ${key}`);}
/** Real host settings store. Generic original persisted atoms remain separate. */
function createOriginalSettingsStore({filename,defaults={},onChange,onListenerError}={}){
 if(typeof filename!=='string'||!path.isAbsolute(filename))throw Error('원본 설정 저장 파일의 절대 경로가 필요합니다.');
 const effectiveDefaults=Object.fromEntries(Object.entries(PET_SETTINGS).map(([key,spec])=>[key,spec.default]));
 for(const[key,value]of Object.entries(defaults)){assertValue(key,value);if(value!==undefined)effectiveDefaults[key]=value;}
 let configuredValues={},queue=Promise.resolve(),closed=false;const subscribers=new Map();
 try{const saved=JSON.parse(fs.readFileSync(filename,'utf8'));if(saved.version!==1||!saved.configuredValues||typeof saved.configuredValues!=='object'||Array.isArray(saved.configuredValues))throw Error('원본 설정 파일 형식을 확인할 수 없습니다.');for(const[key,value]of Object.entries(saved.configuredValues)){assertValue(key,value);configuredValues[key]=value;}}catch(error){if(error.code!=='ENOENT')throw error;}
 const readAll=()=>({values:{...effectiveDefaults,...configuredValues},configuredValues:{...configuredValues}});
 return{
  readAll,
  write(key,value){
   try{assertValue(key,value);if(closed)throw Error('원본 설정 서비스가 종료됐습니다.');}catch(error){return Promise.reject(error);}
   const next=queue.then(async()=>{
    const state={...configuredValues};if(value===undefined)delete state[key];else state[key]=value;
    const temporary=path.join(path.dirname(filename),`.${path.basename(filename)}.${randomUUID()}.tmp`);
    await fs.promises.mkdir(path.dirname(filename),{recursive:true});
    try{await fs.promises.writeFile(temporary,JSON.stringify({version:1,configuredValues:state}),{flag:'wx'});await fs.promises.rename(temporary,filename);}catch(error){await fs.promises.unlink(temporary).catch(()=>{});throw error;}
    configuredValues=state;
    const change={key,effective:state[key]??effectiveDefaults[key],configured:state[key]};
    // Null is a configured value for selected-avatar-id, not an absent value.
    if(Object.hasOwn(state,key))change.effective=state[key];
    for(const listener of subscribers.get(key)??[])try{listener({effective:change.effective,configured:change.configured});}catch(error){onListenerError?.(error);}
    try{onChange?.(change);}catch(error){onListenerError?.(error);}
   });queue=next.catch(()=>{});return next;
  },
  async subscribe(key,listener){
   if(closed||typeof key!=='string'||typeof listener!=='function')throw Error('원본 설정 구독이 올바르지 않습니다.');
   let bucket=subscribers.get(key);if(!bucket)subscribers.set(key,bucket=new Set());bucket.add(listener);
   const state=readAll();listener({effective:state.values[key],configured:state.configuredValues[key]});
   let active=true;return{[Symbol.dispose](){if(!active)return;active=false;bucket.delete(listener);if(!bucket.size)subscribers.delete(key);}};
  },
  async dispose(){closed=true;await queue;subscribers.clear();},
 };
}
function defaultsFromPreferences(preferences={}){
 return Object.fromEntries([
  ['selected-avatar-id',preferences.avatarId],
  ['avatar-overlay-pet-visible',preferences.visible],
  ['avatar-overlay-mascot-width-px',preferences.mascotWidthPx],
  ['pet-visibility',preferences.petVisibility],
 ].filter(([,value])=>value!==undefined));
}
module.exports={createOriginalSettingsStore,defaultsFromPreferences,PET_SETTINGS};
