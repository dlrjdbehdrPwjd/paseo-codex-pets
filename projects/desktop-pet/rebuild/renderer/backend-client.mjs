export function createBackendClient(transport,{normalizeSubtitle,childAgents}={}){
 const displaySnapshot=value=>{
  if(!normalizeSubtitle)return value;
  return{...value,sessions:value.sessions.map(session=>{
   if(typeof session.subtitle!=='string')return session;
   const subtitle=normalizeSubtitle(session.subtitle);
   if(subtitle!==null&&typeof subtitle!=='string')throw Error('Original display-text helper returned an invalid subtitle');
   return subtitle===session.subtitle?session:{...session,subtitle};
  })};
 };
 let snapshot=transport.initialSnapshot?displaySnapshot(transport.initialSnapshot):null,creationListener;const listeners=new Set(),clientThreadIds=new Map(),submittedThreadIds=new Set();
 if(!snapshot)throw Error('Paseo snapshot is missing');
 // Cache in this realm. Calling through contextBridge from getSnapshot would
 // clone the object on every React read and trigger an infinite render loop.
 const off=transport.subscribe(value=>{snapshot=displaySnapshot(value);for(const fn of listeners)fn();});
 const request=(method,...args)=>transport.request(method,args);
 return {
  getSnapshot:()=>snapshot,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
  setCreationListener:fn=>{creationListener=fn;return()=>{if(creationListener===fn)creationListener=undefined;};},
  refresh:()=>request('refresh'),close:()=>request('close'),openMain:()=>request('open-main'),
  runControl:(...args)=>request('control',...args),runAction:(...args)=>request('action',...args),
  submitQuestion:(...args)=>request('question',...args),
  enableChildGroups:enabled=>childAgents?childAgents.enable(enabled):Promise.resolve(false),
  // Electron invoke는 Error.code를 보존하지 않아 서버가 봉투로 보낸 코드를 여기서 복원한다.
  async openAgent(parentKey,agentId){
   if(!childAgents)throw Error('하위 에이전트 이동을 사용할 수 없습니다.');
   const response=await childAgents.open(parentKey,agentId);
   if(!response?.ok)throw Object.assign(Error(response?.error?.message??'하위 에이전트 대화를 열지 못했습니다.'),{code:response?.error?.code});
   return response;
  },
  // 펫에서 만든 대화는 원본이 카드 ID를 clientThreadId로 바꾼다. 세션 key로 카드를 찾을 때 쓴다.
  clientThreadIds:()=>clientThreadIds,
  // 응답 전 낙관적 카드도 이 ID를 쓰므로 부착 실패로 오인하지 않게 전송 시점부터 기억한다.
  submittedThreadIds:()=>submittedThreadIds,
  async submitQuickChat(prompt,clientThreadId,contexts,target,onSent,useChatGPT,attachmentContext,replyToMessageId){
   submittedThreadIds.add(clientThreadId);
   const response=await request('quick-chat',prompt,clientThreadId,contexts,target,null,useChatGPT,attachmentContext,replyToMessageId);
   const result=typeof response==='string'?response:response.result;
   if(response?.createdThread){clientThreadIds.set(response.createdThread.conversationId,response.createdThread.clientThreadId);if(!creationListener)throw Error('Original thread registration is unavailable');await creationListener(response.createdThread);}
   if(result==='sent'||result==='created')onSent?.();return result;
  },
  dispose(){off();listeners.clear();},
 };
}
