const installations=new WeakMap();

export function originalDictationCapability(snapshot){
 const ready=snapshot?.capabilitiesLoaded===true;
 return {isLoading:!ready,isError:false,isCapable:ready&&snapshot.capabilities?.dictation?.supported===true};
}

/** Exact service boundary: only the original dictation.composer query is mapped.
 * Mb/Ier is a derived family, not a writable TanStack query cache. Its other
 * capability queries and all account/authentication state remain original.
 */
export function installPaseoDictationCapability({initialModule,sharedModule,AppScope,speech}){
 const family=initialModule.Ier;
 const flags=initialModule.Vfr;
 if(typeof family?.read!=='function'||typeof flags?.read!=='function'||typeof sharedModule.ITt!=='function'||typeof sharedModule.ETt!=='function')throw Error('원본 제품 권한 signal 계약이 준비되지 않았습니다.');
 if(typeof speech?.dictationStreaming?.connect!=='function')throw Error('실제 파세오 받아쓰기 스트리밍 서비스가 필요합니다.');
 if(installations.has(family))throw Error('파세오 받아쓰기 권한 연결이 이미 설정됐습니다.');
 let value=originalDictationCapability(speech.getSnapshot()),disposed=false;const setters=new Set();
 const equal=(a,b)=>a.isLoading===b.isLoading&&a.isError===b.isError&&a.isCapable===b.isCapable;
 // Every original AppScope gets its own real signal subscriber. The service
 // snapshot is shared, while scope lifetimes remain managed by original ITt.
 const signal=sharedModule.ITt(AppScope,()=>value,{isEqual:equal,onMount(set){setters.add(set);set(value);return()=>setters.delete(set);}});
 const mappedFamily=sharedModule.ETt(AppScope,(_parameters,{get})=>get(signal),{isEqual:equal});
 const streamingFamily=sharedModule.ETt(AppScope,(_parameters,{get})=>get(signal).isCapable&&typeof speech.dictationStreaming?.connect==='function');
 const originalRead=family.read;
 const originalFlagRead=flags.read;
 function mappedRead(scope,chain,parameters,...tracking){
  if(parameters?.name==='dictation.composer')return mappedFamily.read(scope,chain,parameters,...tracking);
  return originalRead.call(this,scope,chain,parameters,...tracking);
 }
 function mappedFlagRead(scope,chain,key,...tracking){
  if(key==='codex-app-dictation-streaming')return streamingFamily.read(scope,chain,key,...tracking);
  return originalFlagRead.call(this,scope,chain,key,...tracking);
 }
 family.read=mappedRead;flags.read=mappedFlagRead;installations.set(family,mappedRead);
 const unsubscribe=speech.subscribe(()=>{const next=originalDictationCapability(speech.getSnapshot());if(!equal(value,next)){value=next;setters.forEach(set=>set(value));}});
 return {signal,getSnapshot:()=>value,dispose(){if(disposed)return;disposed=true;unsubscribe();setters.clear();if(family.read===mappedRead)family.read=originalRead;if(flags.read===mappedFlagRead)flags.read=originalFlagRead;installations.delete(family);}};
}
