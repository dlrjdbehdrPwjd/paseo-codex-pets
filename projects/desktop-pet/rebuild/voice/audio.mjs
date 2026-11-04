export function floatToPcm16(samples){const bytes=new Uint8Array(samples.length*2),view=new DataView(bytes.buffer);for(let i=0;i<samples.length;i++){const value=Math.max(-1,Math.min(1,samples[i]));view.setInt16(i*2,value<0?value*32768:value*32767,true);}return bytes;}
export function base64(bytes){let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));return btoa(binary);}
function decodeBase64(value){const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}

/** Browser capture starts only after real getUserMedia and AudioContext succeed. */
export async function capturePcm({mediaDevices=globalThis.navigator?.mediaDevices,AudioContext=globalThis.AudioContext,deviceId,onChunk,onError}){
 if(!mediaDevices?.getUserMedia||!AudioContext)throw Error('이 환경에서 마이크 캡처를 사용할 수 없습니다.');
 let stream,context,source,processor,silence,closed=false,muted=false;
 const stop=async()=>{if(closed)return;closed=true;if(processor)processor.onaudioprocess=null;processor?.disconnect();source?.disconnect();silence?.disconnect();stream?.getTracks().forEach(track=>track.stop());if(context&&context.state!=='closed')await context.close();};
 try{
  stream=await mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,...(deviceId?{deviceId:{exact:deviceId}}:{})}});
  context=new AudioContext();source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(4096,1,1);silence=context.createGain();silence.gain.value=0;
  const format=`audio/pcm;rate=${context.sampleRate};bits=16`;
  processor.onaudioprocess=event=>{if(closed||muted)return;try{onChunk({audio:base64(floatToPcm16(event.inputBuffer.getChannelData(0))),format,isLast:false});}catch(error){onError?.(error);}};
  source.connect(processor);processor.connect(silence);silence.connect(context.destination);await context.resume();if(context.state!=='running')throw Error('마이크 오디오 처리가 시작되지 않았습니다.');
  stream.getAudioTracks().forEach(track=>track.addEventListener?.('ended',()=>{if(!closed)onError?.(Error('마이크 연결이 종료됐습니다.'));},{once:true}));
  return {format,stop,setMuted(value){muted=value;stream.getAudioTracks().forEach(track=>{track.enabled=!value;});}};
 }catch(error){await stop();throw error;}
}

export function createAudioPlayer({AudioContext=globalThis.AudioContext}={}){
 let context,current,muted=false,generation=0,queue=Promise.resolve();
 async function play(payload){const epoch=generation;const job=queue.then(async()=>{
  if(epoch!==generation||muted)return;
  if(!AudioContext)throw Error('오디오 재생을 사용할 수 없습니다.');context??=new AudioContext();await context.resume();const bytes=decodeBase64(payload.audio);let buffer;
  if(/^audio\/(?:pcm|raw)(?:;|$)/i.test(payload.format)){
   const rate=Number(payload.format.match(/(?:rate|sample_rate)=(\d+)/i)?.[1]),bits=Number(payload.format.match(/bits=(\d+)/i)?.[1]??16);
   if(!Number.isFinite(rate)||rate<8000||rate>192000||bits!==16||bytes.length%2)throw Error('지원하지 않는 PCM 출력 형식입니다.');
   buffer=context.createBuffer(1,bytes.length/2,rate);const samples=buffer.getChannelData(0),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<samples.length;i++)samples[i]=view.getInt16(i*2,true)/32768;
  }else buffer=await context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  if(epoch!==generation||muted)return;
  await new Promise((resolve,reject)=>{const node=context.createBufferSource();current=node;node.buffer=buffer;node.connect(context.destination);node.onended=()=>{if(current===node)current=undefined;node.disconnect();resolve();};try{node.start();}catch(error){current=undefined;node.disconnect();reject(error);}});
 });queue=job.catch(()=>{});return job;}
 return {play,setMuted(value){muted=value;if(value)current?.stop();},stop(){generation++;current?.stop();current=undefined;},async dispose(){generation++;current?.stop();current=undefined;if(context&&context.state!=='closed')await context.close();}};
}
