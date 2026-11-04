/** Read only the current user turn. Never substitute an earlier turn's reply. */
async function readLatestReply(api,agent){
 const entries=[],seen=new Set();let cursor,epoch;
 for(let page=0;page<3;page++){
  const data=await api.agents.ref(agent.id).timeline.refetch({direction:cursor?'before':'tail',limit:60,projection:'projected',...(cursor?{cursor}:{})});
  if(data.error||!Array.isArray(data.entries))return null;
  if(epoch!==undefined&&data.epoch!==epoch)return null;epoch=data.epoch;entries.push(...data.entries);
  const sorted=[...entries].sort((a,b)=>(a.seqStart??0)-(b.seqStart??0));
  const user=sorted.findLastIndex(entry=>entry.item?.type==='user_message');
  if(user>=0){
   const boundary=sorted[user],expected=Date.parse(agent.lastUserMessageAt),observed=Date.parse(boundary.timestamp);
   if(Number.isFinite(expected)&&Number.isFinite(observed)&&observed<expected-1500)return null;
   for(let i=sorted.length-1;i>user;i--){const entry=sorted[i];if(entry.item?.type!=='assistant_message')continue;if(boundary.turnId&&entry.turnId&&boundary.turnId!==entry.turnId)continue;const text=entry.item.text?.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim();if(text)return text;}
   return null;
  }
  if(!data.hasOlder||!data.startCursor)return null;cursor=data.startCursor;const key=JSON.stringify(cursor);if(seen.has(key))return null;seen.add(key);
 }
 return null;
}
module.exports={readLatestReply};
