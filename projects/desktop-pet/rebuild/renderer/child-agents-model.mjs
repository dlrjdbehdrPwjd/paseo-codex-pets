// 하위 에이전트 UI의 표시 규칙. DOM과 React 없이 시험할 수 있도록 순수 함수만 둔다.
const ROW_ORDER={waiting:0,failed:1,running:2,initializing:3,completed:4,idle:5};
const STATUS_LABEL={waiting:'승인 대기',failed:'오류',running:'작업 중',initializing:'시작 중',completed:'작업 종료',idle:'작업 없음'};
export const MAX_BADGE=9;
export const SURFACE_PREFIX='activity-';

export function statusLabel(status){return STATUS_LABEL[status]??STATUS_LABEL.idle;}
export function badgeNumber(count){return count>MAX_BADGE?MAX_BADGE+'+':String(count);}

// 숫자는 항상 실행 중 수다. 총 개수는 아이콘에 그리지 않아 의미가 섞이지 않게 한다.
export function iconModel(group){
 const {counts,state}=group,running=counts.running;
 const number=running>0?badgeNumber(running):null;
 // 실행 중이 없으면 성공을 주장하지 않는다. finished도 중지와 구분된다는 근거가 없다.
 switch(state){
  case'waiting':return{glyph:running>0?'ring':'alert',tone:'warning',number,dot:running>0};
  case'failed':return{glyph:running>0?'ring':'alert',tone:'danger',number,dot:running>0};
  case'running':return{glyph:'ring',tone:'neutral',number,dot:false};
  case'initializing':return{glyph:'ring',tone:'neutral',number:null,dot:false};
  default:return{glyph:'idle',tone:'neutral',number:null,dot:false};
 }
}

// 부모 카드 왼쪽 체크는 부모 자신의 응답이 있고 자식 활동이 없을 때만 보인다. 승인·오류 경고는 대상이 아니다.
const ACTIVE_STATES=new Set(['waiting','failed','running','initializing']);
export function parentCheckHidden(group){return ACTIVE_STATES.has(group.state)||group.parentPresentation==='synthetic';}

// 부모와 자식 모두 활동이 없으면 배지 자체를 없앤다. 승인·오류·시작 중은 활동으로 본다.
const PARENT_ACTIVE_STATUSES=new Set(['running','waiting','failed']);
export function childBadgeVisible(group,parentStatus){return group.children.length>0&&(ACTIVE_STATES.has(group.state)||PARENT_ACTIVE_STATUSES.has(parentStatus));}
export function parentStatuses(sessions){return new Map((sessions??[]).map(session=>[session.key,session.status]));}
// 새 스냅샷에서 열린 목록을 유지할 수 있는지 판단한다. 배지가 사라지면 열림 상태도 버린다.
export function retainedOpenKey(openKey,groups,statuses){
 if(!openKey||!Object.hasOwn(groups,openKey))return null;
 return childBadgeVisible(groups[openKey],statuses.get(openKey))?openKey:null;
}

// 목록이 열린 동안 원본 버튼의 aria-pressed를 켠다. 원본 CSS가 hover와 같은 회색을 적용한다.
export function openButtonProps(isOpen){return{'aria-pressed':isOpen===true};}

// 아이콘의 접근성 이름, 툴팁, 목록 머리글이 같은 문장을 쓰게 한다.
export function summaryText({counts,state}){
 const total=counts.total;
 if(state==='completed')return`${total}개 작업 종료`;
 const parts=[];
 if(counts.running>0)parts.push(total===1?'1개 작업 중':counts.running===total?`${total}개 모두 작업 중`:`${total}개 중 ${counts.running}개 작업 중`);
 if(counts.initializing>0)parts.push(`${counts.initializing}개 시작 중`);
 if(counts.waiting>0)parts.push(`${counts.waiting}개 승인 대기`);
 if(counts.failed>0)parts.push(`${counts.failed}개 오류`);
 if(parts.length)return parts.join(', ');
 // 근거 없는 idle이 섞이면 전체 종료라고 말하지 않는다.
 const rest=[];
 if(counts.completed>0)rest.push(`작업 종료 ${counts.completed}개`);
 if(counts.idle>0)rest.push(`작업 없음 ${counts.idle}개`);
 return`실행 중 없음${rest.length?', '+rest.join(', '):''}`;
}

export function sortChildren(children){
 return children.map((child,index)=>({child,index})).sort((a,b)=>(ROW_ORDER[a.child.status]??9)-(ROW_ORDER[b.child.status]??9)||a.index-b.index).map(entry=>entry.child);
}

// 펫에서 만든 대화는 원본이 notification.id를 clientThreadId로 바꾸므로 카드 DOM 식별자도 달라진다.
export function surfaceId(parentKey,clientThreadIds){return SURFACE_PREFIX+(clientThreadIds?.get(parentKey)??parentKey);}

export function openFailureText(error){return error?.code==='CHILD_AGENT_UNAVAILABLE'?'대화를 찾을 수 없습니다':'열지 못했습니다';}

// 카드 오른쪽 끝에 맞춰 위쪽을 먼저 쓰고, 부족하면 아래로 뒤집은 뒤 창 안으로 끌어온다.
export function popoverPlacement({card,size,viewport,gap=6,margin=8}){
 const roomAbove=card.top-gap-margin,roomBelow=viewport.height-card.bottom-gap-margin;
 const side=size.height<=roomAbove||roomAbove>=roomBelow?'top':'bottom';
 const room=Math.max(0,side==='top'?roomAbove:roomBelow);
 const height=Math.min(size.height,room);
 const top=side==='top'?card.top-gap-height:card.bottom+gap;
 const left=Math.min(Math.max(margin,card.right-size.width),Math.max(margin,viewport.width-margin-size.width));
 return{side,top:Math.round(top),left:Math.round(left),maxHeight:Math.round(room)};
}

// 서버 자식 숨김 요청의 순서를 보장한다. 한 번 실패하면 이후 enable을 보내지 않아 최종값이 항상 false다.
export function createEnableController(send,{onResult=()=>{}}={}){
 let disabled=false,chain=Promise.resolve();
 const push=value=>{const run=chain.catch(()=>{}).then(()=>send(value)).then(result=>{onResult(result);return result;});chain=run;return run;};
 return{enable(){return disabled?Promise.resolve(false):push(true);},fail(){if(disabled)return chain;disabled=true;return push(false);},get disabled(){return disabled;}};
}

const STASHED_PREFIX=SURFACE_PREFIX+'stashed-attention-';
// 부모 카드가 없는 것은 정상이다(닫음·음소거·TTL·펫 숨김). 실패는 카드가 실제로 있는데 붙일 수 없을 때만이다.
export function findAttachmentFailure({cards,orphanSessionCards=0,knownIds,groupCardIds}){
 if(orphanSessionCards>0)return'session-card-without-surface-id';
 for(const card of cards){
  if(groupCardIds.has(card.id)&&!card.hasSlot)return'card-slot-missing:'+card.id;
  if(!card.isSession||card.id.startsWith(STASHED_PREFIX))continue;
  if(!knownIds.has(card.id.slice(SURFACE_PREFIX.length)))return'unknown-session-card:'+card.id;
 }
 return null;
}

export const STACKED_ATTRIBUTE='data-avatar-overlay-stacked-behind-primary';

// 트레이 변경을 관찰자 하나로 모은다. 카드 교체(childList)와 스택 순서 변경(속성)을 프레임당 한 번 알린다.
export function createSurfaceWatcher({root,createObserver,requestFrame,cancelFrame}){
 const listeners=new Set();let frame=null,observer=null;
 const flush=()=>{frame=null;for(const listener of [...listeners])listener();};
 const start=()=>{observer=createObserver(()=>{frame??=requestFrame(flush);});observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:[STACKED_ATTRIBUTE]});};
 const stop=()=>{observer?.disconnect();observer=null;if(frame!=null)cancelFrame(frame);frame=null;};
 return{subscribe(listener){listeners.add(listener);if(listeners.size===1)start();return()=>{listeners.delete(listener);if(!listeners.size)stop();};}};
}

// 같은 DOM 요소라도 스택 뒤로 가면 값이 달라져야 React가 다시 그린다.
export function cardView(card){return{card:card??null,behind:card?.getAttribute(STACKED_ATTRIBUTE)==='true'};}
export function sameCardView(a,b){return a.card===b.card&&a.behind===b.behind;}
export function cardBlocksList(view){return!view.card||view.behind;}
// 닫기 요청은 effect에서 처리되므로 그 전 렌더에서도 없는 카드나 스택 뒤 카드로 목록을 그리면 안 된다.
export function listRenderable(isOpen,view){return isOpen===true&&!cardBlocksList(view);}
export function trackCard({find,watcher,onChange}){
 const sync=()=>onChange(cardView(find()));
 sync();return watcher.subscribe(sync);
}

// 목록 열림과 hover 예약을 한곳에서 소유한다. 다른 부모의 hover가 고정을 빼앗지 못하고,
// 전체 닫기는 대기 중인 예약까지 함께 취소한다.
export function createOpenStore({schedule,cancel,hoverOpenMs=120,hoverCloseMs=200}){
 const listeners=new Set(),openTimers=new Map(),closeTimers=new Map();let state=null;
 const set=next=>{if(state===next||(state&&next&&state.key===next.key&&state.pinned===next.pinned))return;state=next;for(const listener of [...listeners])listener();};
 const cancelIn=(timers,key)=>{if(!timers.has(key))return;cancel(timers.get(key));timers.delete(key);};
 const cancelHover=key=>{cancelIn(openTimers,key);cancelIn(closeTimers,key);};
 const cancelAll=()=>{for(const timers of [openTimers,closeTimers]){for(const id of timers.values())cancel(id);timers.clear();}};
 return{
  getSnapshot:()=>state,
  subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
  cancelHover,
  hoverEnter(key){
   cancelHover(key);
   if(state?.key===key||state?.pinned)return;
   openTimers.set(key,schedule(()=>{openTimers.delete(key);if(state?.key!==key&&!state?.pinned)set({key,pinned:false});},hoverOpenMs));
  },
  hoverLeave(key){
   cancelHover(key);
   if(state?.key!==key||state.pinned)return;
   closeTimers.set(key,schedule(()=>{closeTimers.delete(key);if(state?.key===key&&!state.pinned)set(null);},hoverCloseMs));
  },
  click(key){cancelHover(key);set(state?.key===key&&state.pinned?null:{key,pinned:true});},
  close(key){cancelHover(key);if(state?.key===key)set(null);},
  closeAll(){cancelAll();set(null);},
 };
}

// 키보드 이동은 행 수 안에서 순환한다. 선택이 없으면 방향에 따라 첫 행 또는 끝 행에서 시작한다.
export function nextRowIndex(current,delta,length){
 if(length<=0)return-1;
 if(current<0)return delta>0?0:length-1;
 return(current+delta+length)%length;
}
