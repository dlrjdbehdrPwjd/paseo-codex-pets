const path=require('node:path');
const {connectPaseo}=require('./paseo.cjs');
const {toOriginalSessions,sessionIdentity}=require('./session-model.cjs');
const {createActions}=require('./actions.cjs');
const {createAttachmentHost,createSubmissionAdapter}=require('./attachments.cjs');
const {readLatestReply}=require('./previews.cjs');
const {openPaseo}=require('./navigation.cjs');
const {createOriginalSettingsStore,defaultsFromPreferences}=require('./settings.cjs');
const {createPaseoSpeechHost}=require('./voice-host.cjs');
const {decodeSpeech}=require('./protocol.cjs');
const {createCustomPets,commandPetId}=require('./custom-pets.cjs');
const {groupAgents,childRoute}=require('./agent-groups.cjs');
// 데몬 연결·구독·전송은 서버 플러그인의 이 서비스 인스턴스 하나가 소유한다.
async function createPetService({config,emit=()=>{},log=()=>{},connect=connectPaseo,openConversation=openPaseo}){
 let raw={connected:false,agents:[]},sessions=[],originalSessions=[],childGroups={},completions=new Map(),hiddenAgentIds=new Set(),groupingEnabled=false,service,speech,reservationBridge,closed=false;
 const previews=new Map(),createdThreads=new Map();
 const preferences={avatarId:'codex',visible:true,quickChatStash:true,quickChatStyle:true,mascotWidthPx:112,firstAwakeNotification:false,...config.preferences};
 let attachments=createAttachmentHost({directory:path.join(config.userData,'server-attachments')});
 const settings=createOriginalSettingsStore({filename:path.join(config.userData,'original-settings.json'),defaults:defaultsFromPreferences(preferences),onChange:change=>{emit('settings.changed',change);publish();},onListenerError:error=>log({settingsError:String(error)})});
 const snapshot=()=>({connected:raw.connected,sessions,childGroups,preferences,capabilities:{quickChat:true,dictation:false},latestTurnItems:{}});
 const publish=()=>{if(!closed)emit('service.snapshot',snapshot());};
 const pets=await createCustomPets({directory:config.customPetsDirectory,onChange:value=>emit('pets.changed',value),onSelect:id=>settings.write('selected-avatar-id',id),log});
 const update=()=>{
  if(!raw.connected){sessions=[];originalSessions=[];childGroups={};hiddenAgentIds=new Set();publish();return;}
  // 원본 턴 보존에는 합성 표시 세션을 절대 다시 넣지 않는다.
  originalSessions=toOriginalSessions(raw.agents,{serverId:raw.serverId,previousSessions:originalSessions}).map(session=>{const preview=previews.get(session.paseo.agentId);return{...session,subtitle:session.status==='review'&&preview?.lastUserMessageAt===session.paseo.lastUserMessageAt?preview.text??session.subtitle:session.subtitle};});
  const grouped=groupAgents({agents:raw.agents,sessions:originalSessions,serverId:raw.serverId,previousCompletions:completions});
  completions=grouped.completions;childGroups=grouped.childGroups;hiddenAgentIds=grouped.hiddenAgentIds;sessions=groupingEnabled?grouped.sessions:originalSessions;publish();
 };
 const refreshPreviews=agents=>{if(!service||closed)return;for(const agent of agents){if(groupingEnabled&&hiddenAgentIds.has(agent.id))continue;if(agent.attentionReason!=='finished'||!agent.requiresAttention)continue;const stamp=agent.attentionTimestamp??agent.updatedAt;if(previews.get(agent.id)?.stamp===stamp)continue;const entry={stamp,text:null,lastUserMessageAt:agent.lastUserMessageAt};previews.set(agent.id,entry);void readLatestReply(service.api,agent).then(text=>{if(closed||previews.get(agent.id)!==entry)return;entry.text=text;update();}).catch(error=>log({previewError:String(error)}));}};
 try{
  service=await connect({onSnapshot:value=>{raw=value;update();refreshPreviews(value.agents);},onError:error=>log({backendError:String(error)}),onTrace:phase=>log({connectionPhase:phase})});
  refreshPreviews(raw.agents);
  speech=createPaseoSpeechHost({driver:service.driver,emit:value=>emit('speech.event',encodeVoiceEvent(value))});
 }catch(error){await pets.dispose();await settings.dispose();await attachments.dispose();await service?.dispose();throw error;}
 const actions=createActions({service,attachments:createSubmissionAdapter({readLocalFile:file=>attachments.readBytes(file),uploadFile:input=>service.driver.uploadFile(input)}),onCreated:({clientThreadId,agentId})=>createdThreads.set(clientThreadId,{clientThreadId,conversationId:sessionIdentity(raw.serverId,agentId),hostId:'local'}),getSessions:()=>originalSessions,openConversation,getNewThreadTarget:()=>{
  const source=raw.agents.filter(a=>!a.archivedAt&&!a.internal&&a.status!=='closed'&&typeof a.cwd==='string'&&(config.defaultCwd==null||path.resolve(a.cwd)===path.resolve(config.defaultCwd))).sort((a,b)=>Date.parse(b.lastUserMessageAt??b.updatedAt)-Date.parse(a.lastUserMessageAt??a.updatedAt))[0];
  if(!source?.model)return null;
  return{config:{provider:`${source.provider}/${source.model}`,...(source.currentModeId?{modeId:source.currentModeId}:{}),...(source.thinkingOptionId?{thinkingOptionId:source.thinkingOptionId}:{})},cwd:source.cwd,workspaceId:source.workspaceId};
 }});
 return{snapshot,get childGroupsReady(){return groupingEnabled;},attachReservation:value=>{reservationBridge=value;speech.attachReservation(value);},
  async request(method,args=[]){
   if(closed)throw Error('펫 서버 서비스가 종료됐습니다.');
   if(method.startsWith('speech.'))return speech.request(method,decodeSpeech(method,args));
   if(!Array.isArray(args))throw Error('펫 요청 인수가 올바르지 않습니다.');
   switch(method){
    case 'service.init':return{snapshot:snapshot(),settings:await settings.readAll()};
    case 'child-groups.enable':{
     if(args.length!==1||typeof args[0]!=='boolean')throw Error('묶음 표시 준비 여부가 올바르지 않습니다.');
     groupingEnabled=args[0];update();refreshPreviews(raw.agents);return groupingEnabled;
    }
    case 'open-agent':{
     const route=childRoute({groups:childGroups,agents:raw.agents,serverId:raw.serverId,parentKey:args[0],agentId:args[1]});
     await openConversation(route);return{ok:true};
    }
    case 'refresh':return service.refresh();
    case 'open-main':return openPaseo();
    case 'settings.read-all':return settings.readAll();
    case 'settings.write':return settings.write(...args);
    case 'settings.delete':return settings.write(args[0],undefined);
    case 'pets.list':return pets.list();
    case 'pets.refresh':await pets.refresh();return pets.list();
    case 'attachments.grant':await attachments.grantPaths(args);return true;
    case 'workspace-files.read-binary':return attachments.readBinary(args[0]);
    case 'control':return actions.onRunNotificationControl(...args);
    case 'action':return actions.onRunNotificationAction(...args);
    case 'question':return actions.onSubmitQuestionOption(...args);
    case 'quick-chat':{const petId=commandPetId(args[0]);if(petId){await pets.install(petId);return{result:'sent'};}const result=await actions.onSubmitQuickChat(...args),createdThread=createdThreads.get(args[1]);createdThreads.delete(args[1]);return{result,...(createdThread?{createdThread}:{})};}
    case 'product-event':log({productEvent:args});return;
    case 'attachments.release':{try{await speech.dispose();}finally{speech=createPaseoSpeechHost({driver:service.driver,emit:value=>emit('speech.event',encodeVoiceEvent(value))});if(reservationBridge)speech.attachReservation(reservationBridge);await attachments.dispose();attachments=createAttachmentHost({directory:path.join(config.userData,'server-attachments')});createdThreads.clear();groupingEnabled=false;update();}return;}
    default:throw Error('연결되지 않은 서버 요청: '+method);
   }
  },
  async dispose(){if(closed)return;closed=true;const failures=[];for(const dispose of [()=>pets.dispose(),()=>speech.dispose(),()=>settings.dispose(),()=>attachments.dispose(),()=>service.dispose()])try{await dispose();}catch(e){failures.push(e);}if(failures.length)throw new AggregateError(failures,'펫 서버 정리 실패');},
 };
}
// 출력 오디오 역시 프로세스 경계에서만 Buffer로 바꾸고 렌더러의 기존 계약은 유지한다.
function encodeVoiceEvent(value){if(value.type==='audio-output'&&typeof value.payload?.audio==='string')return{...value,payload:{...value.payload,audio:Buffer.from(value.payload.audio,'base64')}};return value;}
module.exports={createPetService};
