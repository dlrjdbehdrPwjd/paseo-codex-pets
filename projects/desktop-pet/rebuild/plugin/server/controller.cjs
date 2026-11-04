const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {createPetService}=require('./service.cjs');
const {createPeer,SERIALIZATION}=require('./protocol.cjs');
async function createPetController({launch,config:providedConfig=undefined,onDiagnostic=()=>{},spawnChild=spawn,connect=undefined}){
 const config=providedConfig??JSON.parse(fs.readFileSync(launch.config,'utf8'));
 fs.mkdirSync(config.userData,{recursive:true});
 const log=value=>fs.appendFileSync(path.join(config.userData,'server-runtime.jsonl'),JSON.stringify({at:new Date().toISOString(),...value})+'\n');
 let child,peer,disposed=false,error,visible=false,rendererReady=false,cleanup=Promise.resolve(),reservationCallbacks,reserved=false;
 const terminated=new Set();
 const state=()=>({running:!!child,pid:child?.pid,connected:service.snapshot().connected,agents:service.snapshot().sessions.length,visible,...(error?{error}:{})});
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
  if(disposed||child)return;await cleanup;error=undefined;visible=false;rendererReady=false;
  const instanceId=randomUUID(),tempDirectory=path.resolve(config.userData,'ipc-attachments',instanceId);
  const env={...process.env,PASEO_PET_CONFIG:launch.config,PASEO_PET_INSTANCE:instanceId,PASEO_PET_TEMP:tempDirectory,PASEO_PET_PARENT_PID:String(process.pid)};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
  const next=spawnChild(launch.executable,[launch.entry],{cwd:launch.cwd,env,windowsHide:true,serialization:SERIALIZATION,stdio:['ignore','ignore','pipe','ipc']});child=next;
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
  next.once('error',e=>{error=e.message;log({spawnError:e.message});});
  next.once('exit',code=>{nextPeer.dispose();if(child===next){child=undefined;peer=undefined;visible=false;rendererReady=false;if(code&&!disposed)error=`펫 종료 (${code}): ${stderr.slice(-1000)}`;cleanup=releasePet(tempDirectory).catch(e=>{error=String(e);log({cleanupError:String(e)});});}});
 }
 async function stop(){const owned=child;if(!owned)return;await new Promise(resolve=>{const timer=setTimeout(()=>{owned.kill();},5000);owned.once('exit',()=>{clearTimeout(timer);resolve();});void peer?.notify('host.command',{action:'quit'}).catch(()=>owned.kill());});await cleanup;}
 await start();
 return{state,async control(action){if(action==='restart'){await stop();await start();}else{await start();await peer.notify('host.command',{action});}return state();},
  async dispose(){if(disposed)return;disposed=true;await stop();await service.dispose();},
  // 실제 패키지 검사에서만 부모가 Electron 검증 명령을 전달한다.
  diagnostic(message){if(process.env.PASEO_PET_VERIFY!=='1')throw Error('검증 전용 기능입니다.');child?.send(message);},
  get rendererReady(){return rendererReady;},
 };
}
module.exports={createPetController};
