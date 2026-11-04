'use strict';
// Verified against installed @getpaseo/server 0.11.2 Codex providers. The
// original compact card can answer only one non-secret, single-choice question.
function singleQuestion(request){
 if(request?.provider!=='codex'||request.kind!=='question'||!['request_user_input','request_user_input_async'].includes(request.name))return null;
 const questions=request.input?.questions;
 if(!Array.isArray(questions)||questions.length!==1)return null;
 const q=questions[0];
 if(!q||q.multiSelect===true||q.isSecret===true||![q.id,q.header,q.question].every(x=>typeof x==='string'&&x.trim()))return null;
 if(!Array.isArray(q.options)||!q.options.length)return null;
 if(q.options.some(o=>!o||typeof o.label!=='string'||!o.label.trim()||o.label!==o.label.trim()))return null;
 if(new Set(q.options.map(o=>o.label)).size!==q.options.length)return null;
 return q;
}
function questionToWaitingRequest(request){
 const q=singleQuestion(request);if(!q)return null;
 return{kind:'question',requestId:request.id,title:request.title||'질문',prompt:q.question,
  options:q.options.map(o=>({questionId:q.id,label:o.label,description:typeof o.description==='string'&&o.description.trim()?o.description:null})),
  paseoQuestion:{questionId:q.id,header:q.header},
 };
}
function questionResponse(waitingRequest,option){
 if(waitingRequest?.kind!=='question'||!waitingRequest.paseoQuestion||typeof waitingRequest.requestId!=='string'||!waitingRequest.requestId)throw Error('응답 가능한 파세오 질문이 없습니다.');
 const match=waitingRequest.options.find(o=>o.questionId===option?.questionId&&o.label===option?.label);
 if(!match||!match.label.trim()||option.questionId!==waitingRequest.paseoQuestion.questionId)throw Error('현재 질문에 없는 답변입니다.');
 // Provider maps header -> original question id. Never send allow with empty
 // answers: synchronous Codex would otherwise choose its first option itself.
 return{requestId:waitingRequest.requestId,response:{behavior:'allow',updatedInput:{answers:{[waitingRequest.paseoQuestion.header]:match.label}}}};
}
function validatePermissionResponse(request,response){
 const waiting=questionToWaitingRequest(request);
 if(waiting){
  const answers=response?.updatedInput?.answers,header=waiting.paseoQuestion.header;
  if(response?.behavior!=='allow'||!answers||Object.keys(answers).length!==1||!Object.hasOwn(answers,header))throw Error('질문의 답변 형식이 변경됐습니다.');
  const option=waiting.options.find(value=>value.label===answers[header]);
  return questionResponse(waiting,option).response;
 }
 if(request?.kind==='question')throw Error('이 질문은 파세오 대화에서 응답해야 합니다.');
 const action=request?.actions?.find(value=>value.id===response?.selectedActionId);
 if(!action||!['allow','deny'].includes(action.behavior)||action.behavior!==response?.behavior)throw Error('승인 요청 또는 선택지가 변경됐습니다.');
 return{behavior:action.behavior,selectedActionId:action.id};
}
module.exports={singleQuestion,questionToWaitingRequest,questionResponse,validatePermissionResponse};
