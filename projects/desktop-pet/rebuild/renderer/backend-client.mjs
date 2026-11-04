export function createBackendClient(transport,{normalizeSubtitle}={}){
 const displaySnapshot=value=>{
  if(!normalizeSubtitle)return value;
  return{...value,sessions:value.sessions.map(session=>{
   if(typeof session.subtitle!=='string')return session;
   const subtitle=normalizeSubtitle(session.subtitle);
   if(subtitle!==null&&typeof subtitle!=='string')throw Error('Original display-text helper returned an invalid subtitle');
   return subtitle===session.subtitle?session:{...session,subtitle};
  })};
 };
 let snapshot=transport.initialSnapshot?displaySnapshot(transport.initialSnapshot):null,creationListener;const listeners=new Set();
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
  async submitQuickChat(prompt,clientThreadId,contexts,target,onSent,useChatGPT,attachmentContext,replyToMessageId){
   const response=await request('quick-chat',prompt,clientThreadId,contexts,target,null,useChatGPT,attachmentContext,replyToMessageId);
   const result=typeof response==='string'?response:response.result;
   if(response?.createdThread){if(!creationListener)throw Error('Original thread registration is unavailable');await creationListener(response.createdThread);}
   if(result==='sent'||result==='created')onSent?.();return result;
  },
  dispose(){off();listeners.clear();},
 };
}
