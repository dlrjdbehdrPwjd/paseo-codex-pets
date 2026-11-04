const {randomUUID}=require('node:crypto');
// 부모·자식 IPC의 버전, 메시지 이름, 메서드 및 페이로드 검증을 이 파일에서만 정의한다.
const VERSION=1;
// 파세오 Electron44와 펫 Electron40의 V8 advanced 포맷은 호환되지 않는다.
// Node JSON IPC의 표준 Buffer 표현을 사용하며 base64 전송·분할 프로토콜은 만들지 않는다.
const SERIALIZATION='json';
const METHODS=new Set(['pets.list','pets.refresh','service.init','refresh','open-main','control','action','question','quick-chat','settings.read-all','settings.write','attachments.grant','workspace-files.read-binary','product-event','speech.capabilities','speech.voice.start','speech.voice.stop','speech.voice.audio','speech.voice.played','speech.dictation.connect','speech.dictation.send','speech.dictation.close','reservation.start','reservation.complete','reservation.cancel','reservation.dispose','reservation.activate','reservation.deactivate','reservation.terminated','attachments.release']);
const EVENTS=new Set(['pets.changed','service.snapshot','settings.changed','speech.event','host.command','pet.status','pet.ready']);
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&!Buffer.isBuffer(v);
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<160;
function validateArgs(method,args){
 const counts={'pets.list':0,'pets.refresh':0,'service.init':0,refresh:0,'open-main':0,'settings.read-all':0,'settings.write':2,control:2,action:2,question:2,'quick-chat':8,'workspace-files.read-binary':1,'attachments.release':0,'reservation.start':0,'reservation.complete':0,'reservation.cancel':0,'reservation.dispose':0,'reservation.activate':0,'reservation.deactivate':1,'reservation.terminated':1};
 if(method.startsWith('speech.')){
  if(!object(args))throw Error('음성 요청에는 객체 인수가 필요합니다.');
  if(method==='speech.voice.start'&&args.agentId!==undefined&&!identifier(args.agentId))throw Error('잘못된 음성 대화 ID입니다.');
  if(method==='speech.dictation.connect'&&!identifier(args.connectionId))throw Error('잘못된 받아쓰기 연결 ID입니다.');
  if(method==='speech.dictation.close'&&!identifier(args.connectionId))throw Error('잘못된 받아쓰기 종료 ID입니다.');
  if(method==='speech.voice.audio'&&typeof args.format!=='string')throw Error('음성 형식이 필요합니다.');
 }else{
  if(!Array.isArray(args)||(counts[method]!==undefined&&args.length!==counts[method]))throw Error('IPC 메서드의 인수 개수가 올바르지 않습니다.');
  if(method==='settings.write'&&typeof args[0]!=='string')throw Error('설정 키가 필요합니다.');
  if(method==='quick-chat'&&(typeof args[0]!=='string'||typeof args[1]!=='string'||args[4]!==null))throw Error('빠른 채팅 인수가 올바르지 않습니다.');
  if(['control','action','question'].includes(method)&&!object(args[0]))throw Error('알림 객체가 필요합니다.');
  if(method==='workspace-files.read-binary'&&(!object(args[0])||typeof args[0].path!=='string'))throw Error('첨부 파일 경로가 필요합니다.');
 }
}
function validate(message,instanceId){
 if(!object(message)||message.v!==VERSION||message.instanceId!==instanceId)throw Error('IPC 버전 또는 실행 세대가 일치하지 않습니다.');
 if(!['rpc.request','rpc.result','event'].includes(message.type)||!object(message.payload))throw Error('잘못된 IPC 메시지입니다.');
 const p=message.payload;
 if(message.type==='rpc.request'){
  if(!identifier(message.id)||!METHODS.has(p.method)||!(Array.isArray(p.args)||object(p.args)))throw Error('허용되지 않은 IPC 요청입니다.');
  validateArgs(p.method,p.args);
  if(p.method==='attachments.grant'&&(!Array.isArray(p.args)||!p.args.every(x=>typeof x==='string')))throw Error('첨부 경로 목록이 올바르지 않습니다.');
  if(p.method==='speech.voice.audio'&&(!Buffer.isBuffer(p.args.audio)||p.args.audio.length>3*1024*1024))throw Error('음성 IPC에는 제한된 Buffer가 필요합니다.');
  if(p.method==='speech.dictation.send'&&(!identifier(p.args.connectionId)||!object(p.args.input)||(p.args.input.type==='audio.append'&&(!Buffer.isBuffer(p.args.input.audio)||p.args.input.audio.length>4500*1024))))throw Error('받아쓰기 IPC 데이터가 올바르지 않습니다.');
 }else if(message.type==='rpc.result'){
  if(!identifier(message.id)||typeof p.ok!=='boolean'||(!p.ok&&(!object(p.error)||typeof p.error.message!=='string')))throw Error('잘못된 IPC 응답입니다.');
 }else{
  if(!EVENTS.has(p.name)||!object(p.value))throw Error('잘못된 IPC 이벤트입니다.');
  if(p.name==='service.snapshot'&&(!Array.isArray(p.value.sessions)||typeof p.value.connected!=='boolean'))throw Error('잘못된 상태 스냅샷입니다.');
  if(p.name==='host.command'&&!['show','hide','toggle','settings','quit'].includes(p.value.action))throw Error('잘못된 창 명령입니다.');
  if(p.name==='pet.status'&&(!Number.isInteger(p.value.pid)||typeof p.value.rendererReady!=='boolean'||typeof p.value.visible!=='boolean'))throw Error('잘못된 펫 실행 상태입니다.');
  if(p.name==='settings.changed'&&typeof p.value.key!=='string')throw Error('잘못된 설정 변경 이벤트입니다.');
  if(p.name==='pets.changed'&&(typeof p.value.revision!=='string'||!/^[a-f0-9]{64}$/.test(p.value.revision)))throw Error('잘못된 펫 목록 변경 이벤트입니다.');
  if(p.name==='speech.event'&&!['audio-output','voice-input-state','transcription','dictation-event','voice-error'].includes(p.value.type))throw Error('잘못된 음성 이벤트입니다.');
  if(p.name==='speech.event'&&p.value.type==='audio-output'&&(!object(p.value.payload)||!Buffer.isBuffer(p.value.payload.audio)))throw Error('출력 음성 IPC에는 Buffer가 필요합니다.');
 }
 return message;
}
function createPeer({channel,instanceId,handle,onEvent=()=>{},onError=()=>{}}){
 const pending=new Map();let closed=false;
 const send=message=>new Promise((resolve,reject)=>{if(closed||channel.connected===false)return reject(Error('펫 IPC 연결이 종료됐습니다.'));try{channel.send(validate({v:VERSION,instanceId,...message},instanceId),error=>error?reject(error):resolve());}catch(error){reject(error);}});
 const receive=async message=>{
  // 검증 도구 전용 메시지는 별도 경로가 소유한다.
  if(message?.v===undefined)return;
  try{restoreWireBuffers(message);validate(message,instanceId);const p=message.payload;
   if(message.type==='rpc.result'){const task=pending.get(message.id);if(!task)return;pending.delete(message.id);p.ok?task.resolve(p.result):task.reject(Object.assign(Error(p.error.message),{code:p.error.code}));}
   else if(message.type==='event')await onEvent(p.name,p.value);
   else{let payload;try{payload={ok:true,result:await handle(p.method,p.args)};}catch(error){payload={ok:false,error:{code:typeof error.code==='string'?error.code:'PET_REQUEST_FAILED',message:String(error.message??error)}};}await send({type:'rpc.result',id:message.id,payload});}
  }catch(error){onError(error);}
 };
 const close=()=>{if(closed)return;closed=true;channel.off('message',receive);channel.off('disconnect',close);channel.off('exit',close);for(const task of pending.values())task.reject(Error('펫 IPC 연결이 종료됐습니다.'));pending.clear();};
 channel.on('message',receive);channel.once('disconnect',close);channel.once('exit',close);
 return{request(method,args=[]){const id=randomUUID();return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});void send({type:'rpc.request',id,payload:{method,args}}).catch(error=>{pending.delete(id);reject(error);});});},notify:(name,value={})=>send({type:'event',payload:{name,value}}),dispose:close};
}
function restoreWireBuffers(message){
 const p=message?.payload;if(!p)return;
 const restore=value=>{
  if(Buffer.isBuffer(value))return value;
  if(!object(value)||value.type!=='Buffer'||!Array.isArray(value.data)||value.data.length>4500*1024||!value.data.every(byte=>Number.isInteger(byte)&&byte>=0&&byte<=255))throw Error('IPC Buffer 표현이 올바르지 않습니다.');
  return Buffer.from(value.data);
 };
 if(message.type==='rpc.request'&&p.method==='speech.voice.audio'&&p.args)p.args.audio=restore(p.args.audio);
 if(message.type==='rpc.request'&&p.method==='speech.dictation.send'&&p.args?.input?.type==='audio.append')p.args.input.audio=restore(p.args.input.audio);
 if(message.type==='event'&&p.name==='speech.event'&&p.value?.type==='audio-output'&&p.value.payload)p.value.payload.audio=restore(p.value.payload.audio);
}
// 렌더러·데몬의 기존 base64 계약은 유지하되 프로세스 사이에서는 Buffer를 전달한다.
function encodeSpeech(method,args){
 if(method==='speech.voice.audio')return{...args,audio:Buffer.from(args.audio,'base64')};
 if(method==='speech.dictation.send'){if(typeof args.data!=='string'||args.data.length>6*1024*1024)throw Error('받아쓰기 메시지가 너무 큽니다.');const input=JSON.parse(args.data);if(input.type==='audio.append')input.audio=Buffer.from(input.audio,'base64');return{connectionId:args.connectionId,input};}
 return args;
}
function decodeSpeech(method,args){
 if(method==='speech.voice.audio')return{...args,audio:args.audio.toString('base64')};
 if(method==='speech.dictation.send'){const input={...args.input};if(input.type==='audio.append')input.audio=input.audio.toString('base64');return{connectionId:args.connectionId,data:JSON.stringify(input)};}
 return args;
}
module.exports={VERSION,SERIALIZATION,METHODS,EVENTS,validate,createPeer,encodeSpeech,decodeSpeech,restoreWireBuffers};
