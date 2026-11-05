const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {createPetService}=require('./service.cjs');
const {createPeer,SERIALIZATION}=require('./protocol.cjs');
async function createPetController({launch,config:providedConfig=undefined,onDiagnostic=()=>{},spawnChild=spawn,connect=undefined,quitTimeoutMs=5000,killTimeoutMs=5000}){
 const config=providedConfig??JSON.parse(fs.readFileSync(launch.config,'utf8'));
 fs.mkdirSync(config.userData,{recursive:true});
 const log=value=>fs.appendFileSync(path.join(config.userData,'server-runtime.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');
 let child,peer,current,disposed=false,error,visible=false,rendererReady=false,cleanup=Promise.resolve(),operations=Promise.resolve(),restarting,disposal,reservationCallbacks,reserved=false;
 // 시작·중지·재시작은 같은 대기열을 사용한다. 실패한 작업이 다음 복구 요청까지 막지 않는다.
 const enqueue=operation=>{const task=operations.then(operation);operations=task.catch(()=>{});return task;};
 const terminated=new Set();
 const state=()=>{const snapshot=service.snapshot(),groups=Object.values(snapshot.childGroups);return{running:!!child,pid:child?.pid,connected:snapshot.connected,agents:snapshot.sessions.length,visible,childGroupsReady:service.childGroupsReady,groupedParents:service.childGroupsReady?groups.length:0,groupedChildren:service.childGroupsReady?groups.reduce((sum,group)=>sum+group.counts.total,0):0,...(error?{error}:{})};};
 const remoteReservation={
  async start(callbacks){if(!peer)throw Error('펫 음성 창이 없습니다.');if(reserved)throw Error('음성 세션이 이미 예약됐습니다.');reserved=true;reservationCallbacks=callbacks;try{return await peer.request('reservation.start',[]);}catch(e){reserved=false;reservationCallbacks=undefined;throw e;}},
  async complete(){reserved=false;reservationCallbacks=undefined;if(peer)await peer.request('reservation.complete',[]);},
  async cancel(){try{if(peer)await peer.request('reservation.cancel',[]);else await reservationCallbacks?.cancel();}finally{reserved=false;reservationCallbacks=undefined;}},
  isReserved:()=>reserved,subscribeTerminated:fn=>{terminated.add(fn);return()=>terminated.delete(fn);},
  async dispose(){await this.cancel();},
 };
 const service=await createPetService({config,connect,log,emit:(name,value)=>{if(peer)void peer.notify(name,value).catch(e=>log({ipcError:String(e)}));}}).catch(error=>{log({startupError:error.stack??String(error)});throw error;});
 service.attachReservation(remoteReservation);
 async function releasePet(tempDirectory){
  try{await service.request('speech.voice.stop',{});}catch(e){log({voiceCleanupError:String(e)});}
  // 삭제 대상은 부모가 만든 실행 세대별 절대 경로이며 사용자 파일은 포함하지 않는다.
  const root=path.resolve(config.userData,'ipc-attachments'),target=path.resolve(tempDirectory);
  if(path.dirname(target)!==root)throw Error('임시 첨부 정리 경로가 허용 범위를 벗어났습니다.');
  try{await service.request('attachments.release',[]);}finally{await fs.promises.rm(target,{recursive:true,force:true});}
 }
 async function start(){
  if(disposed||child)return;await cleanup;if(disposed||child)return;error=undefined;visible=false;rendererReady=false;
  const instanceId=randomUUID(),tempDirectory=path.resolve(config.userData,'ipc-attachments',instanceId);
  const env={...process.env,PASEO_PET_CONFIG:launch.config,PASEO_PET_INSTANCE:instanceId,PASEO_PET_TEMP:tempDirectory,PASEO_PET_PARENT_PID:String(process.pid)};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  let next;
  try{next=spawnChild(launch.executable,[launch.entry],{cwd:launch.cwd,env,windowsHide:true,serialization:SERIALIZATION,stdio:['ignore','ignore','pipe','ipc']});}
  catch(e){error=e.message;log({spawnError:e.message});await releasePet(tempDirectory);throw e;}
  child=next;
  let finishWait;const record={child:next,ended:false,spawned:false,finished:new Promise(resolve=>{finishWait=resolve;})};current=record;
  let stderr='';next.stderr?.on('data',data=>{stderr=(stderr+data.toString()).slice(-4000);});
  const nextPeer=createPeer({channel:next,instanceId,onError:e=>log({ipcError:String(e)}),handle:async(method,args)=>{
   if(method==='service.init')log({ipcPhase:'펫 초기 상태 요청 수신'});
   if(child!==next)throw Error('이전 실행 세대의 요청입니다.');
   if(method==='reservation.activate'){if(!reservationCallbacks)throw Error('진행 중인 음성 예약이 없습니다.');return reservationCallbacks.start();}
   if(method==='reservation.deactivate')return reservationCallbacks?.cancel(args[0]);
   if(method==='reservation.terminated'){reserved=false;for(const fn of terminated)fn(args[0]??{});return;}
   if(method.startsWith('reservation.'))throw Error('허용되지 않은 예약 요청입니다.');
   return service.request(method,args);
  },onEvent:(name,value)=>{if(child!==next)return;if(name==='pet.status'){visible=value.visible;rendererReady=value.rendererReady;}else if(name!=='pet.ready')throw Error('허용되지 않은 펫 이벤트입니다.');onDiagnostic({name,value,pid:next.pid});}});peer=nextPeer;
  next.on('message',message=>{if(message?.type==='pet:verification')onDiagnostic(message);});
  const finish=code=>{
   if(record.ended)return;record.ended=true;nextPeer.dispose();
   if(current===record){child=undefined;peer=undefined;current=undefined;visible=false;rendererReady=false;reserved=false;reservationCallbacks=undefined;if(code&&!disposed)error=`펫 종료 (${code}): ${stderr.slice(-1000)}`;}
   // 이전 실행 세대 정리를 마친 뒤에만 다음 세대가 파일·음성 권한을 얻는다.
   cleanup=cleanup.then(()=>releasePet(tempDirectory)).catch(e=>{error=String(e);log({cleanupError:String(e)});});
   finishWait();
  };
  next.once('spawn',()=>{record.spawned=true;});
  next.once('error',e=>{error=e.message;log({spawnError:e.message});if(!record.spawned)finish();});
  next.once('exit',finish);next.once('close',finish);
 }
 async function stop(){
  const owned=current;if(!owned){await cleanup;return;}
  // 강제 종료에도 응답이 없으면 소유권을 유지한 채 실패한다. 새 프로세스를 겹쳐 띄우지 않는다.
  await new Promise((resolve,reject)=>{
   let timer,settled=false;
   const done=failure=>{if(settled)return;settled=true;clearTimeout(timer);failure?reject(failure):resolve();};
   const kill=()=>{
    if(settled||owned.ended)return;
    clearTimeout(timer);timer=setTimeout(()=>{error='펫 프로세스 종료를 확인하지 못했습니다.';done(Error(error));},killTimeoutMs);
    try{owned.child.kill();}catch(e){log({killError:String(e)});}
   };
   owned.finished.then(()=>done());timer=setTimeout(kill,quitTimeoutMs);
   void peer?.notify('host.command',{action:'quit'}).catch(kill);
  });await cleanup;
 }
 try{await start();}catch(e){await service.dispose();throw e;}
 return{state,control(action){
   if(disposed)return Promise.reject(Error('펫 제어기가 종료됐습니다.'));
   if(action==='restart'){
    // 동시에 도착한 재시작들은 하나의 종료·시작 결과를 공유한다.
    if(!restarting){const task=enqueue(async()=>{await stop();await start();return state();});restarting=task;void task.finally(()=>{if(restarting===task)restarting=undefined;}).catch(()=>{});}return restarting;
   }
   return enqueue(async()=>{await start();if(disposed)throw Error('펫 제어기가 종료됐습니다.');if(!peer)throw Error('펫 프로세스가 실행 중이 아닙니다.');await peer.notify('host.command',{action});return state();});
  },
  dispose(){if(!disposal){disposed=true;disposal=enqueue(async()=>{await stop();await service.dispose();});void disposal.catch(()=>{disposal=undefined;});}return disposal;},
  // 실제 패키지 검사에서만 부모가 Electron 검증 명령을 전달한다.
  diagnostic(message){if(process.env.PASEO_PET_VERIFY!=='1')throw Error('검증 전용 기능입니다.');child?.send(message);},
  get rendererReady(){return rendererReady;},
 };
}
module.exports={createPetController};
