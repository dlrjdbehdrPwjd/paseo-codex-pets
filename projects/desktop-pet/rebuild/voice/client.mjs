import {capturePcm,createAudioPlayer} from './audio.mjs';

/** Returns exactly the original Ev voiceOverride contract and dictation host seam. */
export function createPaseoSpeechClient({request,subscribe,mediaDevices=globalThis.navigator?.mediaDevices,permissions=globalThis.navigator?.permissions,focusTarget=globalThis.window,AudioContext=globalThis.AudioContext,capture=capturePcm,player=createAudioPlayer({AudioContext}),getAgentId=()=>undefined,getDeviceId=()=>undefined,onError=console.error}){
 if(typeof request!=='function'||typeof subscribe!=='function')throw Error('음성 IPC 연결이 필요합니다.');
 let disposed=false,epoch=0,captureSession,queue=Promise.resolve(),state={canStart:false,caption:null,conversationId:null,isMicrophoneMuted:false,isMuted:false,phase:'inactive',startError:null,voiceActivity:'idle',isSessionActive:false,capabilitiesLoaded:false,capabilities:{voice:{supported:false,reason:'음성 지원 확인 중입니다.'},dictation:{supported:false,reason:'받아쓰기 지원 확인 중입니다.'}}};
 const listeners=new Set(),connections=new Map();let capabilityGeneration=0,permissionStatus,capabilitiesClosed=false;
 const refreshAfterChange=()=>{if(!disposed&&!capabilitiesClosed)void refreshCapabilities().catch(error=>{if(!disposed&&!capabilitiesClosed)onError(error);});};
 focusTarget?.addEventListener?.('focus',refreshAfterChange);
 const update=patch=>{state={...state,...patch};listeners.forEach(fn=>fn());};
 const report=error=>{onError(error);update({startError:error.message??String(error)});};
 async function stop(){++epoch;const current=captureSession,wasActive=state.isSessionActive;captureSession=undefined;update({phase:state.phase==='inactive'?'inactive':'stopping'});player.stop();try{await current?.stop();await queue;await request('speech.voice.stop',{});if(!disposed)update({phase:'inactive',voiceActivity:'idle',caption:null,isSessionActive:false});}catch(error){if(!disposed)update({phase:wasActive?'stopping':'inactive',isSessionActive:wasActive,voiceActivity:'idle',startError:error.message??String(error)});throw error;}}
 async function fail(error){report(error);try{await stop();}catch(stopError){onError(stopError);}}
 async function start(){
  if(disposed)throw Error('음성 UI가 종료됐습니다.');if(state.phase!=='inactive')return;
  if(!state.canStart){const error=Error(state.capabilities.voice.reason);report(error);throw error;}
  const currentEpoch=++epoch;update({phase:'starting',startError:null});let session,accepted=false;
  try{
   // Capture first: permission rejection must not enable a daemon voice session.
   session=await capture({mediaDevices,AudioContext,deviceId:getDeviceId(),onChunk:chunk=>{if(currentEpoch!==epoch||state.phase!=='active')return;queue=queue.then(()=>request('speech.voice.audio',chunk)).catch(error=>{if(currentEpoch===epoch)void fail(error);});},onError:error=>{if(currentEpoch===epoch)void fail(error);}});
   if(currentEpoch!==epoch){await session.stop();return;}
   await request('speech.voice.start',{agentId:getAgentId()});accepted=true;
   if(currentEpoch!==epoch){await session.stop();await request('speech.voice.stop',{});return;}
   captureSession=session;session.setMuted(state.isMicrophoneMuted);update({phase:'active',isSessionActive:true,voiceActivity:'listening',conversationId:getAgentId()??null});
  }catch(error){await session?.stop();if(accepted)await request('speech.voice.stop',{}).catch(onError);if(currentEpoch===epoch)update({phase:'inactive',isSessionActive:false,voiceActivity:'idle',startError:error.message??String(error)});throw error;}
 }
 function toggleMicrophoneMute(){const value=!state.isMicrophoneMuted;captureSession?.setMuted(value);update({isMicrophoneMuted:value});}
 function toggleMute(){const value=!state.isMuted;player.setMuted(value);update({isMuted:value});}
 const off=subscribe(event=>{
  if(disposed)return;
  if(event.type==='capabilities-changed'){refreshAfterChange();return;}
  if(event.type==='dictation-event'){const c=connections.get(event.connectionId);if(c)c.deliver(event.event);return;}
  if(event.type==='voice-error'){void fail(Error(event.error));return;}
  if(state.phase!=='active')return;
  if(event.type==='transcription')update({caption:event.payload.text});
  if(event.type==='voice-input-state'&&event.payload.isSpeaking)update({voiceActivity:'listening'});
  if(event.type==='audio-output'){
   if(event.payload.isVoiceMode!==true)return;const currentEpoch=epoch;
   update({voiceActivity:state.isMuted?'listening':'speaking'});
   void player.play(event.payload).then(async()=>{if(currentEpoch===epoch&&state.phase==='active'){await request('speech.voice.played',{id:event.payload.id});update({voiceActivity:'listening'});}}).catch(error=>{if(currentEpoch===epoch)void fail(error);});
  }
 });
 async function refreshCapabilities(){
  if(disposed||capabilitiesClosed)throw Error('음성 지원 조회가 종료됐습니다.');
  const generation=++capabilityGeneration,server=await request('speech.capabilities',{});let microphone='prompt',permission;
  try{permission=await permissions?.query({name:'microphone'});microphone=permission?.state??'prompt';}catch{}
  const localReason=!mediaDevices?.getUserMedia||!AudioContext?'이 환경에서 마이크 캡처를 사용할 수 없습니다.':microphone==='denied'?'마이크 사용 권한이 거부됐습니다.':null;
  const caps={voice:localReason?{supported:false,reason:localReason}:server.voice,dictation:localReason?{supported:false,reason:localReason}:server.dictation,microphone};
  if(!disposed&&!capabilitiesClosed&&generation===capabilityGeneration){
   if(permission!==permissionStatus){permissionStatus?.removeEventListener?.('change',refreshAfterChange);permissionStatus=permission;permissionStatus?.addEventListener?.('change',refreshAfterChange);}
   update({capabilitiesLoaded:true,capabilities:caps,canStart:caps.voice.supported===true});
  }return caps;
 }
 const dictationStreaming={async connect(surface,callback){
  if(!state.capabilities.dictation.supported)throw Error(state.capabilities.dictation.reason);
  const id=crypto.randomUUID(),broken=new Set();let closed=false;
  const c={deliver(event){if(closed)return;callback(event);if(event.type==='close'){closed=true;connections.delete(id);}},send:data=>request('speech.dictation.send',{connectionId:id,data}),onRpcBroken:fn=>{broken.add(fn);},[Symbol.dispose](){if(closed)return;closed=true;connections.delete(id);void request('speech.dictation.close',{connectionId:id}).catch(onError);}};
  connections.set(id,c);
  try{await request('speech.dictation.connect',{connectionId:id,surface});return c;}catch(error){connections.delete(id);closed=true;throw error;}
 }};
 return {subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getSnapshot:()=>state,
  voiceOverride:(value=state)=>({...value,start,stop,toggleMicrophoneMute,toggleMute}),dictationStreaming,refreshCapabilities,
  async dispose(){if(disposed)return;capabilitiesClosed=true;++capabilityGeneration;permissionStatus?.removeEventListener?.('change',refreshAfterChange);focusTarget?.removeEventListener?.('focus',refreshAfterChange);try{await stop();}finally{disposed=true;off();for(const c of [...connections.values()])c[Symbol.dispose]();connections.clear();listeners.clear();await player.dispose();}}};
}
