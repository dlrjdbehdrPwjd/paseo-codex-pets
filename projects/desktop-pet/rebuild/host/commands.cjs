// 초기 상태 조회 중 도착한 표시 의도를 보관한다. 실제 창 명령도 순서대로 적용한다.
function createHostCommands({quit}){
 let target,visible=true,settingsPending=false,quitting=false,queue=Promise.resolve();
 const enqueue=operation=>{const task=queue.then(()=>{if(!quitting)return operation();});queue=task.catch(()=>{});return task;};
 return{
  handle(action){
   if(action==='quit'){quitting=true;quit();return Promise.resolve();}
   if(quitting)return Promise.resolve();
   if(action==='settings'){if(!target){settingsPending=true;return Promise.resolve();}return enqueue(()=>target.openSettings());}
   if(target){
    if(action==='show')return enqueue(()=>target.manager.open(undefined,{forcePetView:true}));
    if(action==='hide')return enqueue(()=>target.manager.hide());
    if(action==='toggle')return enqueue(()=>target.manager.toggle());
    return Promise.reject(Error('허용되지 않은 창 명령입니다.'));
   }
   if(action==='show')visible=true;
   else if(action==='hide')visible=false;
   else if(action==='toggle')visible=!visible;
   else return Promise.reject(Error('허용되지 않은 창 명령입니다.'));
   // 초기화 전에는 실행 성공을 알리지 않고 최종 표시 의도만 저장한다.
   return Promise.resolve();
  },
  ready(value){
   if(target)throw Error('펫 창 명령 연결이 이미 준비됐습니다.');target=value;
   const initiallyVisible=visible;
   return enqueue(async()=>{if(initiallyVisible)await target.manager.open(undefined,{forcePetView:true});else target.manager.hide();if(settingsPending){settingsPending=false;await target.openSettings();}});
  },
 };
}
module.exports={createHostCommands};
