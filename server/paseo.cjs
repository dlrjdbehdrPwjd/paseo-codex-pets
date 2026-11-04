const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {validatePermissionResponse}=require('./questions.cjs');

function localEndpoint(record){
 if(typeof record?.listen!=='string'||! /^(localhost|127\.0\.0\.1):\d+$/.test(record.listen))throw Error('파세오의 로컬 연결 주소를 확인할 수 없습니다.');
 const port=Number(record.listen.split(':')[1]);if(port<1||port>65535)throw Error('잘못된 파세오 포트입니다.');
 return `ws://${record.listen}/ws`;
}

/** Owns actual SDK subscriptions. It exposes raw snapshots, never invented Codex state. */
async function connectPaseo({home=process.env.PASEO_HOME||path.join(os.homedir(),'.paseo'),onSnapshot,onError=console.error,onTrace=()=>{},sdk}={}){
 onTrace('연결 정보 읽기');
 // 플러그인은 데몬의 listen 기록보다 먼저 시작될 수 있으므로 완성된 주소를 기다린다.
 let record,lastError;
 for(let attempt=0;attempt<80;attempt++){
  try{record=JSON.parse(await fs.readFile(path.join(home,'paseo.pid'),'utf8'));localEndpoint(record);lastError=undefined;break;}
  catch(error){lastError=error;if(!['ENOENT',undefined].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,250));}
 }
 if(lastError)throw lastError;
 sdk??={...await import('@getpaseo/client/node'),...await import('@getpaseo/client')};
 onTrace('SDK 로드 완료');
 const driver=sdk.createHostClient(localEndpoint(record),{
  clientId:'paseo-pet-rebuild',clientType:'browser',
  localCredential:async()=>(await fs.readFile(path.join(home,'local-credential'),'utf8')).trim(),
  reconnect:{enabled:true,baseDelayMs:1000,maxDelayMs:15000},
 });
 const api=sdk.createPaseoApi(driver);let generation=0,closed=false,current,refreshing,retryTimer;
 const emit=()=>onSnapshot?.({connected:!!current&&driver.isConnected,serverId:current?.serverId,agents:current?[...current.agents.values()]:[]});
 async function release(group){if(!group)return;group.live=false;for(const off of group.listeners)off();await Promise.allSettled(group.subscriptions.map(s=>s.release()));}
 async function refresh(){
  if(closed||!driver.isConnected)return;
  if(refreshing)return refreshing;
  const epoch=generation;
  refreshing=(async()=>{
   const next={live:true,serverId:driver.getLastServerInfoMessage()?.serverId,agents:new Map(),listeners:[],subscriptions:[]};
   try{
    if(!next.serverId)throw Error('파세오 서버 식별자가 없습니다.');
    let cursor;const seen=new Set();
    do{
     const page=await api.agents.list({subscribe:{},filter:{includeArchived:false,includeInternal:false},page:{limit:200,...(cursor?{cursor}:{})}});
     next.subscriptions.push(page.subscription);
     if(closed||generation!==epoch||!driver.isConnected)throw Error('파세오 연결이 변경됐습니다.');
     const pageIds=new Set();
     const replace=entries=>{for(const id of pageIds)next.agents.delete(id);pageIds.clear();for(const {agent}of entries){pageIds.add(agent.id);next.agents.set(agent.id,agent);}if(current===next)emit();};
     replace(page.entries);
     next.listeners.push(page.subscription.subscribe({
      snapshot:value=>{if(next.live)replace(value.entries);},
      update:message=>{if(!next.live||message.type!=='agent_update')return;const change=message.payload;if(change.kind==='remove'){next.agents.delete(change.agentId);pageIds.delete(change.agentId);}else{next.agents.set(change.agent.id,change.agent);pageIds.add(change.agent.id);}if(current===next)emit();},
      error:error=>{if(!next.live)return;onError(error);if(current===next){current=undefined;generation++;emit();}void release(next);},
     }));
     if(!page.pageInfo.hasMore&&!page.pageInfo.nextCursor)break;
     cursor=page.pageInfo.nextCursor;if(!cursor||seen.has(cursor))throw Error('파세오 목록의 페이지 커서가 반복됐습니다.');seen.add(cursor);
    }while(true);
    if(closed||generation!==epoch||!driver.isConnected)throw Error('파세오 연결이 변경됐습니다.');
    const old=current;current=next;emit();await release(old);
   }catch(error){await release(next);if(!closed&&epoch===generation)onError(error);}
  })().finally(()=>{refreshing=undefined;});return refreshing;
 }
 const offStatus=driver.subscribeConnectionStatus(status=>{
  if(closed)return;if(status.status==='connected'){void refresh();return;}
  generation++;const previous=current;current=undefined;emit();void release(previous);
 });
 async function fresh(id){
  if(closed||!current||!driver.isConnected||!current.agents.has(id))throw Error('연결된 파세오 대화가 아닙니다.');
  const epoch=generation,result=await api.agents.ref(id).refresh();
  if(epoch!==generation||closed||!driver.isConnected)throw Error('파세오 연결이 변경됐습니다.');
  if(!result?.agent||result.agent.archivedAt||result.agent.status==='closed')throw Error('사용할 수 없는 파세오 대화입니다.');
  return result.agent;
 }
 try{onTrace('WebSocket 연결 시작');await driver.connect();onTrace('WebSocket 연결 완료');await refresh();onTrace('초기 목록 수신 완료');}catch(error){onError(error);}
 retryTimer=setInterval(()=>{void refresh();},15000);retryTimer.unref?.();
 return {
  driver,api,refresh,
  async send(id,text,media={}){const agent=await fresh(id);if(agent.pendingPermissions?.length)throw Error('승인 요청을 먼저 처리하세요.');if(typeof text!=='string'||(!text.trim()&&!media.images?.length&&!media.attachments?.length))throw Error('메시지가 비어 있습니다.');await api.agents.ref(id).send(text,{activeTurnBehavior:'steer',...media});},
  async create({config,cwd,workspaceId,text,media={},idempotencyKey}){
   if(closed||!current||!driver.isConnected)throw Error('파세오에 연결되지 않았습니다.');
   if(!config?.provider||typeof cwd!=='string'||!path.isAbsolute(cwd))throw Error('새 대화의 프로젝트와 모델을 먼저 설정하세요.');
   if(typeof text!=='string'||(!text.trim()&&!media.images?.length&&!media.attachments?.length))throw Error('메시지가 비어 있습니다.');
   const options={config,cwd,title:'펫 새 대화',prompt:text,...media,...(idempotencyKey?{idempotencyKey}:{})};
   const handle=workspaceId?await api.workspaces.ref(workspaceId).agents.create(options):await api.agents.create(options);
   await refresh();return handle.id;
  },
  async stop(id){const agent=await fresh(id);if(agent.status==='running'||agent.activeTurn)await driver.cancelAgent(id);},
  async permission(id,{requestId,response}){
   const agent=await fresh(id),request=agent.pendingPermissions?.find(x=>x.id===requestId);
   if(!request)throw Error('승인 요청이 더 이상 존재하지 않습니다.');
   await api.agents.ref(id).respondToPermission({requestId,response:validatePermissionResponse(request,response)});
  },
  async dispose(){if(closed)return;closed=true;generation++;clearInterval(retryTimer);offStatus();const previous=current;current=undefined;await release(previous);await refreshing;await api.dispose();await driver.close();},
 };
}
module.exports={connectPaseo,localEndpoint};
