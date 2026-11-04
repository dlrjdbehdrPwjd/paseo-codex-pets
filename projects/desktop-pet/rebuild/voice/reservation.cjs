/** Local lifetime equivalent of the original RPC callable, without a fake RPC link. */
function callable(callback){
 let references=1,disposed=false;const broken=new Set();
 const fn=(...args)=>{if(disposed)throw Error('음성 콜백이 해제됐습니다.');return callback(...args);};
 fn.dup=()=>{if(disposed)throw Error('음성 콜백이 해제됐습니다.');references++;return fn;};
 fn.onRpcBroken=handler=>{broken.add(handler);return()=>broken.delete(handler);};
 fn[Symbol.dispose]=()=>{if(disposed)return;if(--references===0){disposed=true;broken.clear();}};
 return fn;
}

/** Uses the real extracted u2, the same register/request/complete operations as ef1. */
function createOriginalVoiceReservation({controller,getOrigin}){
 for(const method of ['registerStarter','requestStart','cancelStart','completeSession','unregisterStarter'])if(typeof controller?.[method]!=='function')throw Error('원본 음성 예약 컨트롤러가 필요합니다: '+method);
 let registrationId,activeStart,activeCancel,pending,disposed=false,removeOriginListener;const terminationListeners=new Set();
 const origin=()=>{const value=getOrigin();if(!value||value.isDestroyed?.()||!Number.isInteger(value.id))throw Error('펫 음성 창이 준비되지 않았습니다.');return value;};
 function register(value){
  if(registrationId===value.id)return;
  removeOriginListener?.();removeOriginListener=undefined;
  if(registrationId!=null)controller.unregisterStarter(registrationId);
  const start=callable(async()=>{const attempt=pending,run=activeStart,cancel=activeCancel;try{const result=await run();if(attempt?.cancelled){await cancel?.('user_cancelled');throw Error('음성 시작이 취소됐습니다.');}if(result?.accepted!==true)throw Error(result?.error??'파세오가 음성 시작을 거절했습니다.');attempt?.resolve(result);return result;}catch(error){attempt?.reject(error);throw error;}});
  const cancel=callable(async reason=>{const attempt=pending;if(attempt)attempt.cancelled=true;try{await activeCancel?.(reason);}finally{attempt?.reject(Error('음성 시작이 취소됐습니다.'));}});
  try{controller.registerStarter(value.id,start,cancel,true,()=>false);registrationId=value.id;
   if(value.once){const destroyed=()=>{const attempt=pending;if(attempt)attempt.cancelled=true;controller.resetSession();controller.unregisterStarter(value.id);registrationId=undefined;attempt?.reject(Error('음성 창이 종료됐습니다.'));Promise.resolve(activeCancel?.('window_closed')).then(()=>{terminationListeners.forEach(fn=>fn({}));},error=>{terminationListeners.forEach(fn=>fn({error}));});};value.once('destroyed',destroyed);removeOriginListener=()=>value.removeListener('destroyed',destroyed);}
  }finally{start[Symbol.dispose]();cancel[Symbol.dispose]();}
 }
 return {
  async start({start,cancel}){
   if(disposed)throw Error('음성 예약 연결이 종료됐습니다.');if(pending||controller.isSessionReserved())throw Error('원본 펫이 이미 음성 세션을 예약했습니다.');
   const value=origin();activeStart=start;activeCancel=cancel;let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});const current={resolve,reject};pending=current;
   try{register(value);await controller.requestStart(value,{source:'avatar_overlay_button_new_thread'},undefined);return await promise;}catch(error){if(controller.isSessionReserved())await controller.cancelStart(value).catch(()=>{});throw error;}finally{if(pending===current)pending=undefined;}
  },
  complete(){if(registrationId!=null)controller.completeSession(registrationId);},
  async cancel(){if(pending)pending.cancelled=true;if(registrationId!=null){const value=getOrigin();if(value?.id===registrationId)await controller.cancelStart(value);else{controller.resetSession();await activeCancel?.('window_closed');pending?.reject(Error('음성 창이 종료됐습니다.'));}}},
  isReserved:()=>controller.isSessionReserved(),
  subscribeTerminated(handler){terminationListeners.add(handler);return()=>terminationListeners.delete(handler);},
  async dispose(){if(disposed)return;disposed=true;removeOriginListener?.();try{if(registrationId!=null&&(pending||controller.isSessionReserved()))await this.cancel();}finally{if(registrationId!=null)controller.unregisterStarter(registrationId);registrationId=undefined;pending?.reject(Error('음성 예약 연결이 종료됐습니다.'));pending=undefined;terminationListeners.clear();}},
 };
}
module.exports={createOriginalVoiceReservation};
