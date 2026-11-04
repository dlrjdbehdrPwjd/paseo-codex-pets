/** Backend callbacks for the unchanged original Ev owner. */
const {createSubmissionAdapter}=require('./attachments.cjs');
const {questionResponse}=require('./questions.cjs');
function createActions({service,getSessions,openConversation,getNewThreadTarget,attachments,onCreated}){
 const submissions=attachments??createSubmissionAdapter({readLocalFile:service.readAttachment,uploadFile:service.driver?.uploadFile?.bind(service.driver)});
 function find(notification){
  const id=notification?.notificationPreferenceId??notification?.controlTarget?.conversationId;
  const session=getSessions().find(value=>value.key===id||value.localConversationId===id);
  if(!session?.paseo)throw Error('원래 파세오 대화를 찾을 수 없습니다.');return session;
 }
 return {
  async onRunNotificationControl(notification,control){
   switch(control.type){
    // Ev owns these UI transitions; the original parent also has no backend effect.
    case 'close-follow-up':case 'follow-up-active-changed':case 'follow-up-editor-changed':case 'open-follow-up':return;
    case 'stop':await service.stop(find(notification).paseo.agentId);return;
    case 'submit-follow-up':{const prompt=control.prompt?.trim();if(!prompt)throw Error('메시지가 비어 있습니다.');await service.send(find(notification).paseo.agentId,prompt);return 'submitted';}
    default:throw Error('지원하지 않는 펫 조작: '+control.type);
   }
  },
  async onRunNotificationAction(notification,action){
   const session=find(notification);
   if(action==null||action.intent==='open')return openConversation(session.paseo);
   if(action.intent==='paseo-permission'){
    if(!action.paseoPermission)throw Error('파세오 승인 응답이 없습니다.');
    return service.permission(session.paseo.agentId,action.paseoPermission);
   }
   throw Error('파세오에 연결되지 않은 원본 작업: '+action.intent);
  },
  async onSubmitQuickChat(prompt,_clientThreadId,appshotContexts,replyTarget,onSent,_useChatGPT,attachmentContext,replyToMessageId){
   if(replyToMessageId!=null)throw Error('이 파세오 버전은 특정 메시지에 대한 답장 전송을 지원하지 않습니다.');
   if(replyTarget){
    const session=find({controlTarget:{conversationId:replyTarget.conversationId}});
    const prepared=await submissions.prepareSubmission({prompt,appshotContexts,attachmentContext});
    await service.send(session.paseo.agentId,prepared.text,prepared.media);onSent?.();return 'sent';
   }
   const target=getNewThreadTarget?.();if(!target)throw Error('새 대화를 시작할 파세오 프로젝트를 선택하세요.');
   const prepared=await submissions.prepareSubmission({prompt,appshotContexts,attachmentContext});
   const agentId=await service.create({...target,text:prepared.text,media:prepared.media,idempotencyKey:_clientThreadId});await onCreated?.({clientThreadId:_clientThreadId,agentId});onSent?.();return 'created';
  },
  async onSubmitQuestionOption(notification,option){
   const session=find(notification),waiting=session.waitingRequest;
   if(notification.waitingRequest?.requestId!==waiting?.requestId)throw Error('질문이 변경되었습니다. 현재 대화에서 확인하세요.');
   return service.permission(session.paseo.agentId,questionResponse(waiting,option));
  },
 };
}
module.exports={createActions};
