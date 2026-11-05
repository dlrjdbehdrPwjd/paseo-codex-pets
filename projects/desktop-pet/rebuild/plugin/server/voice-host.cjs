const {randomUUID}=require('node:crypto');

/** Actual SDK transport. No Codex cloud calls, tokens, or microphone access here. */
function createPaseoSpeechHost({driver,emit}){
 if(!driver||typeof emit!=='function')throw Error('Paseo speech driver and event emitter are required');
 let disposed=false,voiceActive=false,reservation,offReservation,voiceGeneration=0;const connections=new Map();
 const capabilities=()=>{
  const state=driver.getLastServerInfoMessage?.()?.capabilities?.voice;
  const convert=value=>({supported:driver.isConnected===true&&value?.enabled===true,reason:!driver.isConnected?'파세오 연결이 끊겼습니다.':value?.reason??'서버가 음성 지원 상태를 제공하지 않았습니다.'});
  return {voice:convert(state?.voice),dictation:convert(state?.dictation)};
 };
 const ensure=kind=>{if(disposed)throw Error('음성 연결이 종료됐습니다.');const cap=capabilities()[kind];if(!cap.supported)throw Error(cap.reason);};
 const publish=(connection,event)=>{if(!disposed&&!connection.closed)emit({type:'dictation-event',connectionId:connection.id,event});};
 const message=(connection,event)=>publish(connection,{type:'message',data:JSON.stringify({...event,sequence_no:connection.sequence++})});
 const close=connection=>{if(connection.closed)return;publish(connection,{type:'close',code:1000,reason:''});connection.closed=true;connections.delete(connection.id);};
 const failure=(connection,error)=>{if(connection.closed)return;message(connection,{type:'session.error',fatal:true,error:{code:error.reasonCode??'paseo_dictation_error',message:error.message??String(error),retryable:error.retryable===true}});if(connection.started)driver.cancelDictationStream(connection.dictationId);close(connection);};
 const listeners=[
  driver.on('status',message=>{if(!disposed&&message.payload?.status==='server_info')emit({type:'capabilities-changed'});}),
  driver.on('audio_output',msg=>{if(voiceActive&&!disposed)emit({type:'audio-output',payload:msg.payload});}),
  driver.on('voice_input_state',msg=>{if(voiceActive&&!disposed)emit({type:'voice-input-state',payload:msg.payload});}),
  driver.on('transcription_result',msg=>{if(voiceActive&&!disposed)emit({type:'transcription',payload:{text:msg.payload.text}});}),
  driver.on('dictation_stream_partial',msg=>{const c=[...connections.values()].find(c=>c.dictationId===msg.payload.dictationId);if(c&&!c.closed)message(c,{type:'transcript.segment',utterance_id:c.dictationId,revision:++c.revision,text:msg.payload.text});}),
  driver.on('dictation_stream_error',msg=>{const c=[...connections.values()].find(c=>c.dictationId===msg.payload.dictationId);if(c)failure(c,{...msg.payload,message:msg.payload.error});}),
 ];
 const offStatus=driver.subscribeConnectionStatus?.(state=>{if(disposed)return;emit({type:'capabilities-changed'});if(state.status==='connected')return;if(voiceActive||reservation?.isReserved()){voiceGeneration++;voiceActive=false;void reservation?.cancel().catch(()=>{});emit({type:'voice-error',error:'파세오 연결이 끊겼습니다.'});}for(const c of [...connections.values()])failure(c,Error('파세오 연결이 끊겼습니다.'));});
 async function request(method,args={}){
  if(disposed)throw Error('음성 연결이 종료됐습니다.');
  switch(method){
   case 'speech.capabilities':return capabilities();
   case 'speech.voice.start':{ensure('voice');if(voiceActive||reservation?.isReserved())throw Error('이미 이 펫에서 음성 대화 중입니다.');if(!reservation)throw Error('원본 펫 음성 예약 연결이 준비되지 않았습니다.');const generation=++voiceGeneration;const result=await reservation.start({start:()=>driver.setVoiceMode(true,args.agentId),cancel:()=>driver.setVoiceMode(false)});if(result.accepted!==true)throw Error(result.error??'서버가 음성 시작을 거절했습니다.');if(generation!==voiceGeneration){await driver.setVoiceMode(false);throw Error('음성 시작이 취소됐습니다.');}voiceActive=true;return {accepted:true};}
   case 'speech.voice.stop':{voiceGeneration++;if(voiceActive){await driver.setVoiceMode(false);voiceActive=false;await reservation?.complete();}else if(reservation?.isReserved())await reservation.cancel();return;}
   case 'speech.voice.audio':{ensure('voice');if(!voiceActive)throw Error('음성 대화가 시작되지 않았습니다.');if(typeof args.audio!=='string'||args.audio.length>4*1024*1024)throw Error('잘못된 음성 청크입니다.');return driver.sendVoiceAudioChunk(args.audio,args.format,args.isLast===true);}
   case 'speech.voice.played':{if(voiceActive)return driver.audioPlayed(args.id);return;}
   case 'speech.dictation.connect':{ensure('dictation');const id=args.connectionId??randomUUID();if(typeof id!=='string'||id.length>128||connections.has(id))throw Error('잘못된 받아쓰기 연결입니다.');const c={id,dictationId:randomUUID(),sequence:0,revision:0,audioSeq:0,closed:false,started:false,pending:Promise.resolve()};connections.set(id,c);queueMicrotask(()=>publish(c,{type:'open'}));return {connectionId:id};}
   case 'speech.dictation.send':{const c=connections.get(args.connectionId);if(!c||c.closed)throw Error('받아쓰기 연결이 종료됐습니다.');if(typeof args.data!=='string'||args.data.length>6*1024*1024)throw Error('잘못된 받아쓰기 메시지입니다.');const input=JSON.parse(args.data);const task=async()=>{
    if(c.closed)throw Error('받아쓰기 연결이 종료됐습니다.');
    if(input.type==='session.start'){
     if(c.started)throw Error('받아쓰기가 이미 시작됐습니다.');const rate=input.config?.sample_rate_hz;if(!Number.isInteger(rate)||rate<8000||rate>192000||input.config?.input_audio_format!=='pcm16'||input.config?.num_channels!==1)throw Error('지원하지 않는 받아쓰기 오디오 형식입니다.');
     c.format=`audio/pcm;rate=${rate};bits=16`;c.delivery=input.config.transcript_delivery_mode==='segment'?'segment':'final_only';await driver.startDictationStream(c.dictationId,c.format);if(c.closed){driver.cancelDictationStream(c.dictationId);return;}c.started=true;message(c,{type:'session.started',frame_rtt_supported:false,session:{session_id:c.dictationId,status:'active',config:{provider_mode:'buffered',transcript_delivery_mode:c.delivery}}});return;
    }
    if(!c.started)throw Error('받아쓰기 시작 응답을 받지 못했습니다.');
    if(input.type==='audio.append'){if(typeof input.audio!=='string')throw Error('잘못된 받아쓰기 청크입니다.');driver.sendDictationStreamChunk(c.dictationId,c.audioSeq++,input.audio,c.format);return;}
    if(input.type==='session.close'){if(c.audioSeq===0)throw Error('녹음된 오디오가 없습니다.');const result=await driver.finishDictationStream(c.dictationId,c.audioSeq-1);if(c.closed)return;message(c,{type:'transcript.final',utterance_id:c.dictationId,revision:++c.revision,text:result.text});message(c,{type:'session.updated',session:{session_id:c.dictationId,status:'closed',config:{provider_mode:'buffered',transcript_delivery_mode:c.delivery}}});close(c);return;}
    throw Error('지원하지 않는 받아쓰기 메시지입니다: '+input.type);
   };const pending=c.pending.then(task);c.pending=pending.catch(error=>failure(c,error));return pending;}
   case 'speech.dictation.close':{const c=connections.get(args.connectionId);if(c){if(c.started)driver.cancelDictationStream(c.dictationId);close(c);}return;}
   default:throw Error('지원하지 않는 음성 명령입니다: '+method);
  }
 }
 return {request,capabilities,attachReservation(value){if(reservation)throw Error('음성 예약 연결이 이미 설정됐습니다.');for(const name of ['start','complete','cancel','isReserved','dispose'])if(typeof value?.[name]!=='function')throw Error('불완전한 원본 예약 연결입니다: '+name);reservation=value;offReservation=value.subscribeTerminated?.(({error})=>{voiceGeneration++;if(!error)voiceActive=false;emit({type:'voice-error',error:error?.message??'펫 음성 창이 종료됐습니다.'});});},async dispose(){if(disposed)return;for(const c of [...connections.values()]){if(c.started)driver.cancelDictationStream(c.dictationId);close(c);}const failures=[];try{if(voiceActive)try{await driver.setVoiceMode(false);}catch(error){failures.push(error);}try{await reservation?.dispose();}catch(error){failures.push(error);}}finally{voiceActive=false;disposed=true;listeners.forEach(off=>off());offStatus?.();offReservation?.();}if(failures.length)throw new AggregateError(failures,'Speech cleanup failed');}};
}
module.exports={createPaseoSpeechHost};
