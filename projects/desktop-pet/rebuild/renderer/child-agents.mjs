/**
 * 부모 카드의 하위 에이전트 아이콘과 목록. 원본 함수 본문은 바꾸지 않고, 같은 React 트리에서
 * 원본 카드 DOM으로 portal한다. 입력 영역은 원본이 수집하는 data-avatar-overlay-hit-region을 따른다.
 */
import {cardBlocksList,cardView,childBadgeVisible,createEnableController,createOpenStore,createSurfaceWatcher,findAttachmentFailure,iconModel,listRenderable,nextRowIndex,openButtonProps,openFailureText,parentCheckHidden,parentStatuses,popoverPlacement,retainedOpenKey,sameCardView,sortChildren,statusLabel,summaryText,surfaceId,trackCard} from './child-agents-model.mjs';

const OPEN_DEBOUNCE_MS=1000,POPOVER_WIDTH=300,ROW_HEIGHT=48,VISIBLE_ROWS=5.5,HEADER_HEIGHT=37,ATTACH_CONFIRM_MS=3000;
const CARD_MARK='data-paseo-child-parent',HOST_CLASS='paseo-child-host',CHECK_HIDDEN_MARK='data-paseo-child-hide-check',ALERT_ICON='warning';

// 색과 글자는 원본 토큰만 참조한다. 카드 재질 값은 열릴 때 실제 카드에서 읽어 온다.
const STYLE=`
[${CARD_MARK}]{--activity-pill-edge-inset:56px}
[${CHECK_HIDDEN_MARK}] [data-avatar-overlay-status="check-circle"]{position:absolute!important;width:1px!important;height:1px!important;margin:0!important;overflow:hidden;clip-path:inset(50%)}
[${CARD_MARK}] [data-avatar-overlay-activity-content]>.relative>[role="button"]{padding-inline-end:56px!important}
.${HOST_CLASS}{position:absolute;top:12px;right:16px;z-index:21;display:flex;height:32px;align-items:center}
[data-avatar-overlay-stacked-behind-primary="true"] .${HOST_CLASS}{display:none}
.paseo-child-icon{position:relative;display:flex;width:32px;height:32px;align-items:center;justify-content:center}
.paseo-child-ring{position:absolute;inset:6px;width:20px;height:20px;animation:paseo-child-spin 1.1s linear infinite}
.paseo-child-ring-track{stroke:currentColor;opacity:.16}
.paseo-child-ring-arc{stroke:currentColor;stroke-linecap:round;opacity:.72}
.paseo-child-number{position:relative;font-size:11px;line-height:12px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--color-token-foreground)}
.paseo-child-alert{font-size:14px;line-height:16px;font-weight:700}
.paseo-child-dot{position:absolute;top:3px;right:3px;width:8px;height:8px;border-radius:9999px;box-shadow:0 0 0 1.5px var(--paseo-child-card-background,#fff)}
.paseo-child-idle{width:10px;height:2px;border-radius:1px;background:currentColor;opacity:.5}
.paseo-child-tone-warning{color:var(--color-token-editor-warning-foreground,var(--color-orange))}
.paseo-child-dot.paseo-child-tone-warning{background:var(--color-token-editor-warning-foreground,var(--color-orange))}
.paseo-child-tone-danger{color:var(--color-danger,var(--color-red))}
.paseo-child-dot.paseo-child-tone-danger{background:var(--color-danger,var(--color-red))}
.paseo-child-tone-warning svg{color:var(--color-token-editor-warning-foreground,var(--color-orange))!important}
.paseo-child-popover{position:fixed;z-index:60;width:${POPOVER_WIDTH}px;display:flex;flex-direction:column;overflow:hidden;border-radius:20px;pointer-events:auto;font-size:13px;line-height:16px;color:var(--color-token-foreground);animation:paseo-child-enter .12s ease-out;user-select:none}
.paseo-child-header{flex:none;height:${HEADER_HEIGHT}px;box-sizing:border-box;padding:12px 16px 9px;font-size:12px;line-height:16px;color:var(--color-token-description-foreground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.paseo-child-list{overflow-y:auto;overscroll-behavior:contain;padding:0 6px 6px;scrollbar-width:auto;scrollbar-color:auto}
.paseo-child-list::-webkit-scrollbar{width:10px}
.paseo-child-list::-webkit-scrollbar-button{display:none;width:0;height:0}
.paseo-child-list::-webkit-scrollbar-thumb{border:3px solid transparent;border-radius:9999px;background:var(--color-token-description-foreground);background-clip:padding-box;opacity:.5}
.paseo-child-row{display:flex;width:100%;height:${ROW_HEIGHT}px;box-sizing:border-box;align-items:center;gap:8px;padding:8px 10px;border:0;border-radius:14px;background:transparent;color:inherit;text-align:start;cursor:pointer;font:inherit}
.paseo-child-row:hover,.paseo-child-row:focus-visible{background:var(--color-token-list-hover-background,rgba(127,127,127,.12));outline:none}
.paseo-child-row[aria-busy="true"]{cursor:progress;opacity:.7}
.paseo-child-row-icon{flex:none;display:flex;width:16px;height:16px;align-items:center;justify-content:center}
.paseo-child-row-spinner{width:14px;height:14px;animation:paseo-child-spin 1.1s linear infinite}
.paseo-child-row-text{min-width:0;flex:1}
.paseo-child-row-title{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-weight:600}
.paseo-child-row-status{display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--color-token-description-foreground)}
.paseo-child-row-status[data-error="true"]{color:var(--color-danger,var(--color-red))}
@keyframes paseo-child-spin{to{transform:rotate(360deg)}}
@keyframes paseo-child-enter{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.paseo-child-ring,.paseo-child-row-spinner{animation:none}.paseo-child-popover{animation:none}}
`;

function installStyle(doc){
 if(doc.getElementById('paseo-child-agents-style'))return;
 const style=doc.createElement('style');style.id='paseo-child-agents-style';style.textContent=STYLE;doc.head.append(style);
}
function findCard(doc,id){return doc.querySelector(`[data-avatar-overlay-native-surface-id="${CSS.escape(id)}"]`);}
function cardSlot(card){return card?.querySelector('[data-avatar-overlay-activity-content]>.relative')??null;}

export function createChildAgentsLayer({React:R,createPortal,Button,StatusIcon,backend,setKeyboardInteraction,report=()=>{},document:doc=globalThis.document,window:win=globalThis.window}){
 const h=R.createElement;
 const watcher=createSurfaceWatcher({root:doc.body,createObserver:callback=>new MutationObserver(callback),requestFrame:callback=>win.requestAnimationFrame(callback),cancelFrame:id=>win.cancelAnimationFrame(id)});
 const openStore=createOpenStore({schedule:(callback,delay)=>win.setTimeout(callback,delay),cancel:id=>win.clearTimeout(id)});

 function Spinner({className}){
  return h('svg',{className,viewBox:'0 0 20 20',fill:'none','aria-hidden':true},
   h('circle',{className:'paseo-child-ring-track',cx:10,cy:10,r:8.5,strokeWidth:2}),
   h('path',{className:'paseo-child-ring-arc',d:'M10 1.5a8.5 8.5 0 0 1 8.5 8.5',strokeWidth:2}));
 }
 function statusIcon(iconType){return h(StatusIcon,{iconType});}

 function IconFace({group}){
  const model=iconModel(group);
  if(model.glyph==='alert')return h('span',{className:`paseo-child-icon paseo-child-alert paseo-child-tone-${model.tone}`},'!');
  if(model.glyph==='idle')return h('span',{className:'paseo-child-icon'},h('span',{className:'paseo-child-idle'}));
  return h('span',{className:'paseo-child-icon'},
   h(Spinner,{className:'paseo-child-ring'}),
   model.number==null?null:h('span',{className:'paseo-child-number'},model.number),
   model.dot?h('span',{className:`paseo-child-dot paseo-child-tone-${model.tone}`}):null);
 }

 function rowIcon(child){
  switch(child.status){
   case'waiting':return h('span',{className:'paseo-child-row-icon paseo-child-tone-warning'},statusIcon(ALERT_ICON));
   case'failed':return h('span',{className:'paseo-child-row-icon paseo-child-tone-danger'},statusIcon(ALERT_ICON));
   case'running':case'initializing':return h('span',{className:'paseo-child-row-icon'},h(Spinner,{className:'paseo-child-row-spinner'}));
   default:return h('span',{className:'paseo-child-row-icon'},h('span',{className:'paseo-child-idle'}));
  }
 }

 function Popover({group,card,pinned,onPointerEnter,onPointerLeave,onClose,onDismiss,popoverRef}){
  const [layout,setLayout]=R.useState(null),[pending,setPending]=R.useState(null),[failures,setFailures]=R.useState({});
  const lastOpen=R.useRef(new Map()),listRef=R.useRef(null);
  const children=R.useMemo(()=>sortChildren(group.children),[group.children]);
  // 창 위치 변화나 스택 전개로 카드가 움직일 수 있어 열려 있는 동안만 프레임마다 맞춘다.
  R.useLayoutEffect(()=>{
   let frame,previous='';
   const update=()=>{
    const element=popoverRef.current;
    if(element&&card.isConnected){
     const rect=card.getBoundingClientRect(),listHeight=Math.min(children.length,VISIBLE_ROWS)*ROW_HEIGHT+6;
     const next=popoverPlacement({card:rect,size:{width:POPOVER_WIDTH,height:HEADER_HEIGHT+listHeight},viewport:{width:win.innerWidth,height:win.innerHeight}});
     const key=JSON.stringify(next);if(key!==previous){previous=key;const style=win.getComputedStyle(card);setLayout({...next,background:style.backgroundColor,boxShadow:style.boxShadow,backdropFilter:style.backdropFilter});}
    }
    frame=win.requestAnimationFrame(update);
   };
   update();return()=>win.cancelAnimationFrame(frame);
  },[card,children.length]);
  const open=child=>{
   const now=Date.now();if(now-(lastOpen.current.get(child.agentId)??0)<OPEN_DEBOUNCE_MS)return;lastOpen.current.set(child.agentId,now);
   setPending(child.agentId);setFailures(value=>{const{[child.agentId]:_,...rest}=value;return rest;});
   void backend.openAgent(group.parentKey,child.agentId).then(()=>{setPending(null);onClose();},error=>{setPending(null);setFailures(value=>({...value,[child.agentId]:openFailureText(error)}));report({ok:false,childAgentOpenError:String(error?.message??error)});});
  };
  const onKeyDown=event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onDismiss();return;}
   if(event.key==='Tab'){event.preventDefault();onDismiss();return;}
   if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
   event.preventDefault();
   const rows=[...listRef.current.querySelectorAll('button')];
   rows[nextRowIndex(rows.indexOf(doc.activeElement),event.key==='ArrowDown'?1:-1,rows.length)]?.focus();
  };
  const style=layout?{top:layout.top,left:layout.left,maxHeight:layout.maxHeight,background:layout.background,boxShadow:layout.boxShadow,backdropFilter:layout.backdropFilter}:{visibility:'hidden',top:0,left:0};
  return h('div',{ref:popoverRef,className:'paseo-child-popover','data-avatar-overlay-hit-region':'paseo-child-agents','data-side':layout?.side,'data-pinned':pinned?'true':undefined,role:'menu','aria-label':'하위 에이전트',style,onPointerEnter,onPointerLeave,onKeyDown,onPointerDown:event=>event.stopPropagation()},
   h('div',{className:'paseo-child-header'},`하위 에이전트 · ${summaryText(group)}`),
   h('div',{ref:listRef,className:'paseo-child-list',style:{maxHeight:VISIBLE_ROWS*ROW_HEIGHT+6}},
    children.map(child=>{
     const failure=failures[child.agentId];
     return h('button',{key:child.agentId,type:'button',role:'menuitem',className:'paseo-child-row','data-agent-id':child.agentId,'data-status':child.status,'aria-busy':pending===child.agentId?'true':undefined,title:child.title,style:child.depth>1?{paddingInlineStart:10+(child.depth-1)*14}:undefined,onClick:()=>open(child)},
      rowIcon(child),
      h('span',{className:'paseo-child-row-text'},
       h('span',{className:'paseo-child-row-title'},child.title),
       h('span',{className:'paseo-child-row-status','data-error':failure?'true':undefined},failure??statusLabel(child.status))));
    })));
 }

 const Group=R.memo(function Group({group,cardId,showBadge,isOpen,isPinned}){
  const key=group.parentKey;
  const [view,setView]=R.useState(()=>cardView(findCard(doc,cardId))),[host,setHost]=R.useState(null),{card}=view;
  const popoverRef=R.useRef(null),buttonRef=R.useRef(null);
  R.useEffect(()=>trackCard({find:()=>findCard(doc,cardId),watcher,onChange:next=>setView(current=>sameCardView(current,next)?current:next)}),[cardId]);
  // 카드마다 전용 자리를 만들어 원본이 관리하는 자식과 섞지 않는다.
  R.useLayoutEffect(()=>{
   // 배지가 없으면 여백 보정도 두지 않는다. 왼쪽 체크 숨김은 아래에서 따로 유지한다.
   const slot=showBadge?cardSlot(card):null;
   if(!slot){setHost(null);return;}
   const node=doc.createElement('div');node.className=HOST_CLASS;node.dataset.paseoChildFor=group.parentKey;slot.append(node);card.setAttribute(CARD_MARK,'true');setHost(node);
   return()=>{node.remove();card.removeAttribute(CARD_MARK);setHost(null);};
  },[card,group.parentKey,showBadge]);
  // 왼쪽 체크를 시각적으로만 가린다. 원본 status와 접근성 라벨은 그대로다.
  const hideParentCheck=parentCheckHidden(group);
  R.useLayoutEffect(()=>{
   if(!card||!hideParentCheck)return;
   card.setAttribute(CHECK_HIDDEN_MARK,'true');
   return()=>card.removeAttribute(CHECK_HIDDEN_MARK);
  },[card,hideParentCheck]);
  // 점 테두리를 카드 배경과 맞춘다.
  R.useEffect(()=>{if(host&&card)host.style.setProperty('--paseo-child-card-background',win.getComputedStyle(card).backgroundColor);},[host,card]);
  R.useEffect(()=>()=>openStore.cancelHover(key),[key]);
  R.useEffect(()=>{if(!showBadge)openStore.cancelHover(key);},[key,showBadge]);
  const close=()=>openStore.close(key);
  const listOpen=listRenderable(isOpen,view);
  const onIconClick=event=>{event.stopPropagation();openStore.click(key);};
  const onIconKeyDown=event=>{
   if(!listOpen)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();openStore.closeAll();}
   else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();const rows=[...(popoverRef.current?.querySelectorAll('button')??[])];rows[event.key==='ArrowDown'?0:rows.length-1]?.focus();}
  };
  // 목록을 띄운 카드가 스택 뒤로 가거나 사라지면 닫는다.
  R.useEffect(()=>{if(isOpen&&cardBlocksList(view))openStore.close(key);},[isOpen,view,key]);
  if(!host)return null;
  const label=`하위 에이전트: ${summaryText(group)}`;
  return R.createElement(R.Fragment,null,
   createPortal(h(Button,{ref:buttonRef,'aria-label':label,'aria-haspopup':'menu','aria-expanded':listOpen,...openButtonProps(listOpen),'data-avatar-overlay-material':'css','data-paseo-child-state':group.state,color:'activity',size:'iconCircle',title:label,onClick:onIconClick,onKeyDown:onIconKeyDown,onPointerEnter:()=>openStore.hoverEnter(key),onPointerLeave:()=>openStore.hoverLeave(key),onPointerDown:event=>event.stopPropagation()},h(IconFace,{group})),host),
   listOpen?createPortal(h(Popover,{group,card,pinned:isPinned,popoverRef,onClose:close,onDismiss:openStore.closeAll,onPointerEnter:()=>openStore.cancelHover(key),onPointerLeave:()=>openStore.hoverLeave(key)}),doc.body):null);
 },(a,b)=>a.group.revision===b.group.revision&&a.cardId===b.cardId&&a.showBadge===b.showBadge&&a.isOpen===b.isOpen&&a.isPinned===b.isPinned);

 function Layer({onFailure,onReady}){
  const state=R.useSyncExternalStore(backend.subscribe,backend.getSnapshot,backend.getSnapshot);
  const groups=state.childGroups??{};
  const active=R.useSyncExternalStore(openStore.subscribe,openStore.getSnapshot,openStore.getSnapshot);
  const focusSeen=R.useRef(false),seenIds=R.useRef(new Set());
  const activeKey=active?.key??null,pinned=active?.pinned===true;
  const closeAll=openStore.closeAll;
  R.useEffect(()=>closeAll,[closeAll]);
  // 입력 영역 밖 클릭은 OS가 다른 앱으로 넘겨 DOM에 오지 않으므로 고정 중에는 포커스를 잡고 blur로 닫는다.
  R.useEffect(()=>{
   if(!pinned)return;
   // 답장 입력 등으로 이미 포커스가 있으면 원본 소유이므로 잡거나 놓지 않는다.
   const owned=!win.document.hasFocus();focusSeen.current=!owned;
   if(owned)void setKeyboardInteraction?.(true,true);
   const onFocus=()=>{focusSeen.current=true;};
   const onBlur=()=>{if(focusSeen.current)closeAll();};
   win.addEventListener('focus',onFocus);win.addEventListener('blur',onBlur);
   return()=>{win.removeEventListener('focus',onFocus);win.removeEventListener('blur',onBlur);if(doc.activeElement?.closest?.('.paseo-child-popover,.'+HOST_CLASS))doc.activeElement.blur();if(owned)void setKeyboardInteraction?.(false,true);};
  },[pinned,closeAll]);
  R.useEffect(()=>{
   if(!activeKey)return;
   // 카드 본문, 마스코트 등 목록 밖을 누르면 드래그와 충돌하지 않도록 먼저 닫는다.
   const onPointerDown=()=>closeAll();
   const onKeyDown=event=>{if(event.key==='Escape')closeAll();};
   doc.addEventListener('pointerdown',onPointerDown);doc.addEventListener('keydown',onKeyDown);
   return()=>{doc.removeEventListener('pointerdown',onPointerDown);doc.removeEventListener('keydown',onKeyDown);};
  },[activeKey,closeAll]);
  const statuses=parentStatuses(state.sessions);
  R.useEffect(()=>{if(activeKey&&!retainedOpenKey(activeKey,groups,statuses))openStore.close(activeKey);});
  const clientThreadIds=backend.clientThreadIds?.();
  // 층이 실제로 마운트된 뒤에만 자식 숨김을 요청한다. 렌더 실패 시 이 효과는 실행되지 않는다.
  R.useEffect(()=>{onReady();},[]);
  const groupsRef=R.useRef(groups),sessionsRef=R.useRef(state.sessions);groupsRef.current=groups;sessionsRef.current=state.sessions;
  // 실제로 있는 카드에 붙이지 못하면 알림을 잃지 않도록 독립 카드로 되돌린다.
  R.useEffect(()=>{
   let timer=null,suspect=null;
   const inspect=()=>{
    for(const session of sessionsRef.current??[])seenIds.current.add(session.key);
    // 배지를 숨긴 묶음은 붙일 것이 없으므로 부착 실패로 세지 않는다.
    const current=parentStatuses(sessionsRef.current),list=Object.values(groupsRef.current).filter(group=>childBadgeVisible(group,current.get(group.parentKey)));
    if(!list.length)return null;
    const threads=backend.clientThreadIds?.(),known=new Set([...seenIds.current,...(threads?.values()??[]),...(backend.submittedThreadIds?.()??[])]);
    const cards=[...doc.querySelectorAll('[data-avatar-overlay-native-surface-id^="activity-"]')].map(card=>({id:card.dataset.avatarOverlayNativeSurfaceId,hasSlot:!!cardSlot(card),isSession:!!card.querySelector('[data-avatar-overlay-notification-kind="session"]')}));
    const orphanSessionCards=[...doc.querySelectorAll('[data-avatar-overlay-notification-kind="session"]')].filter(node=>!node.closest('[data-avatar-overlay-native-surface-id^="activity-"]')).length;
    return findAttachmentFailure({cards,orphanSessionCards,knownIds:known,groupCardIds:new Set(list.map(group=>surfaceId(group.parentKey,threads)))});
   };
   const evaluate=()=>{
    const reason=inspect();
    if(reason===suspect)return;
    win.clearTimeout(timer);suspect=reason;
    if(reason)timer=win.setTimeout(()=>{if(inspect()===reason)onFailure(reason);},ATTACH_CONFIRM_MS);
   };
   evaluate();const off=watcher.subscribe(evaluate);
   return()=>{off();win.clearTimeout(timer);};
  },[onFailure]);
  return R.createElement(R.Fragment,null,Object.values(groups).map(group=>{if(!group.children.length)return null;const showBadge=childBadgeVisible(group,statuses.get(group.parentKey)),isActive=showBadge&&activeKey===group.parentKey;return h(Group,{key:group.parentKey,group,cardId:surfaceId(group.parentKey,clientThreadIds),showBadge,isOpen:isActive,isPinned:isActive&&pinned});}));
 }

 // 최종 상태를 문서에 남겨 격리 검사와 통합 검증이 같은 값을 확인하게 한다.
 const mark=(name,value)=>{doc.documentElement.dataset[name]=String(value);};
 const controller=createEnableController(value=>backend.enableChildGroups(value),{onResult:value=>mark('paseoChildAgents',value)});
 const enable=()=>{void controller.enable().catch(error=>report({ok:false,childAgentEnableError:String(error?.message??error)}));};
 const disable=reason=>{mark('paseoChildAgentsFailure',reason);report({ok:false,childAgentAttachFailure:reason});void controller.fail().catch(error=>report({ok:false,childAgentDisableError:String(error?.message??error)}));};
 class Boundary extends R.Component{
  constructor(props){super(props);this.state={failed:false};}
  static getDerivedStateFromError(){return{failed:true};}
  componentDidCatch(error){disable('render-error:'+(error?.message??error));}
  render(){return this.state.failed?null:this.props.children;}
 }
 return function ChildAgentsLayer(){
  const [failed,setFailed]=R.useState(false);
  const onFailure=R.useCallback(reason=>{setFailed(true);disable(reason);},[]);
  R.useLayoutEffect(()=>{installStyle(doc);},[]);
  return failed?null:h(Boundary,null,h(Layer,{onFailure,onReady:enable}));
 };
}
