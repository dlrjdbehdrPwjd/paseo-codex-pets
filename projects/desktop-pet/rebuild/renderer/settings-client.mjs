/** Exact Wct.settings contract, backed by the real main-process settings store. */
export function createOriginalSettingsClient({request,subscribe}){
 if(typeof request!=='function'||typeof subscribe!=='function')throw Error('실제 원본 설정 전송 서비스가 필요합니다.');
 const listeners=new Map(),latest=new Map();let disposed=false,revision=0,cached,loading;
 const off=subscribe(change=>{
  if(disposed||typeof change?.key!=='string')return;
  latest.set(change.key,{...change,revision:++revision});
  if(cached){cached={values:{...cached.values,[change.key]:change.effective},configuredValues:{...cached.configuredValues}};if(change.configured===undefined)delete cached.configuredValues[change.key];else cached.configuredValues[change.key]=change.configured;}
  for(const callback of listeners.get(change.key)??[])callback({effective:change.effective,configured:change.configured});
 });
 async function readAll(){
  if(disposed)throw Error('원본 설정 서비스가 종료됐습니다.');
  if(loading)return loading;
  const began=revision;
  loading=Promise.resolve(request('settings.read-all',[])).then(snapshot=>{
   if(!snapshot||typeof snapshot.values!=='object'||!snapshot.values||Array.isArray(snapshot.values)||typeof snapshot.configuredValues!=='object'||!snapshot.configuredValues||Array.isArray(snapshot.configuredValues))throw Error('원본 설정 응답이 올바르지 않습니다.');
   const result={values:{...snapshot.values},configuredValues:{...snapshot.configuredValues}};
   for(const[key,change]of latest)if(change.revision>began){result.values[key]=change.effective;if(change.configured===undefined)delete result.configuredValues[key];else result.configuredValues[key]=change.configured;}
   cached=result;return{values:{...result.values},configuredValues:{...result.configuredValues}};
  }).finally(()=>{loading=null;});return loading;
 }
 return{
  readAll,
  // undefined는 설정 삭제이고 null은 저장할 값이다. IPC에서 undefined가 사라지므로 메서드로 구분한다.
  async write(key,value){if(disposed)throw Error('원본 설정 서비스가 종료됐습니다.');return value===undefined?request('settings.delete',[key]):request('settings.write',[key,value]);},
  async subscribe(key,callback){
   if(disposed||typeof key!=='string'||typeof callback!=='function')throw Error('원본 설정 구독이 올바르지 않습니다.');
   let bucket=listeners.get(key);if(!bucket)listeners.set(key,bucket=new Set());bucket.add(callback);
   let active=true;
   try{const snapshot=cached??await readAll();if(!disposed&&active)callback({effective:snapshot.values[key],configured:snapshot.configuredValues[key]});}
   catch(error){bucket.delete(callback);throw error;}
   return{[Symbol.dispose](){if(!active)return;active=false;bucket.delete(callback);if(!bucket.size)listeners.delete(key);}};
  },
  dispose(){if(disposed)return;disposed=true;off?.();listeners.clear();},
 };
}
