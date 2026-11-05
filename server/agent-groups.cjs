'use strict';

// 실제 부모 라벨만 사용한다. 폴더·제목·생성 시각은 관계의 근거가 아니다.
const {createHash}=require('node:crypto');
const {deriveSessionStatus,sessionIdentity}=require('./session-model.cjs');
const DAY=24*60*60*1000;
const ACTIVE=new Set(['waiting','failed','running','initializing']);
const ORDER={waiting:0,failed:1,running:2,initializing:3,completed:4,idle:5};
const emptyCounts=()=>({total:0,running:0,initializing:0,waiting:0,failed:0,completed:0,idle:0});
const nonempty=value=>typeof value==='string'&&value.trim()?value.trim():null;

function parentId(agent,serverId){
 const id=nonempty(agent.labels?.['paseo.parent-agent-id']);
 const server=nonempty(agent.labels?.['paseo.parent-server-id']);
 return id&&(!server||server===serverId)?id:null;
}

// 각 노드를 한 번만 해석한다. 순환 관계와 그에 딸린 노드는 독립 표시한다.
function resolveRoots(agents,serverId){
 const resolved=new Map();
 for(const id of agents.keys()){
  if(resolved.has(id))continue;
  const path=[],visiting=new Set();let current=id,base,invalid=false;
  while(true){
   if(resolved.has(current)){base=resolved.get(current);invalid=base.invalid;break;}
   if(visiting.has(current)){invalid=true;break;}
   visiting.add(current);path.push(current);
   const parent=parentId(agents.get(current),serverId);
   if(!parent||!agents.has(parent)){base={root:current,depth:0};path.pop();resolved.set(current,base);break;}
   current=parent;
  }
  if(invalid){for(const item of path)resolved.set(item,{root:item,depth:0,invalid:true});continue;}
  for(let index=path.length-1;index>=0;index--){base={root:base.root,depth:base.depth+1};resolved.set(path[index],base);}
 }
 return resolved;
}

function childStatus(agent,session,previousCompletions,completions){
 const status=deriveSessionStatus(agent);
 if(['waiting','failed','running'].includes(status))return status;
 if(agent.status==='initializing')return 'initializing';
 const turn=JSON.stringify([session.turnKey,session.paseo.lastUserMessageAt]);
 // idle만으로 정상 완료를 추측하지 않는다. 데몬의 finished 관찰은 읽음 처리 후에도 같은 턴에서 유지한다.
 if(agent.status==='idle'&&(agent.attentionReason==='finished'||previousCompletions.get(session.key)===turn)){
  completions.set(session.key,turn);return 'completed';
 }
 return 'idle';
}

function groupState(counts){
 for(const state of ['waiting','failed','running','initializing'])if(counts[state])return state;
 return counts.total>0&&counts.completed===counts.total?'completed':'idle';
}

function groupAgents({agents,sessions,serverId,now=Date.now(),previousCompletions=new Map()}){
 const bySession=new Map(sessions.map(session=>[session.paseo.agentId,session]));
 const visible=new Map(agents.filter(agent=>bySession.has(agent.id)).map(agent=>[agent.id,agent]));
 const roots=resolveRoots(visible,serverId),completions=new Map(),groups=new Map(),hidden=new Set();
 for(const [id,agent]of visible){
  const relation=roots.get(id),session=bySession.get(id);
  if(relation.root===id)continue;
  hidden.add(id);
  const status=childStatus(agent,session,previousCompletions,completions);
  const updatedAtMs=Date.parse(agent.attentionTimestamp&&agent.requiresAttention?agent.attentionTimestamp:agent.updatedAt);
  const ttl=agent.requiresAttention?7*DAY:DAY;
  if(!ACTIVE.has(status)&&now-updatedAtMs>ttl)continue;
  const list=groups.get(relation.root)??[];
  list.push({agentId:id,key:session.key,title:session.title,status,requiresAttention:agent.requiresAttention===true,updatedAtMs,depth:relation.depth,
   // 정렬·알림 구간 계산에만 쓰고 전송 전에 제거한다.
   createdAtMs:Date.parse(agent.createdAt)||0,turnKey:session.turnKey,permissionIds:session.paseo.permissionRequestIds});
  groups.set(relation.root,list);
 }
 const childGroups=Object.create(null),notifications=new Map();
 for(const [root,list]of groups){
  const parent=bySession.get(root),counts=emptyCounts();
  list.sort((a,b)=>ORDER[a.status]-ORDER[b.status]||a.createdAtMs-b.createdAtMs||a.agentId.localeCompare(b.agentId));
  for(const child of list){counts.total++;counts[child.status]++;}
  const state=groupState(counts);
  // 부모 고유 알림과 자식 때문에 합성한 알림을 구분하되 실제 세션 상태는 바꾸지 않는다.
  const parentPresentation=parent.status==='idle'&&(ACTIVE.has(state)||state==='completed'&&list.some(child=>child.requiresAttention))?'synthetic':'own';
  // 자식이 그대로여도 부모 알림의 출처가 달라지면 렌더러가 표시를 갱신해야 한다.
  const revision=createHash('sha256').update(JSON.stringify({parentPresentation,children:list})).digest('hex');
  const group={parentKey:parent.key,parentAgentId:root,parentPresentation,children:list.map(({createdAtMs,turnKey,permissionIds,...child})=>child),counts,state,revision};
  childGroups[parent.key]=group;
  // 이름·읽음 변경이나 일부 자식 완료만으로 닫은 카드를 다시 띄우지 않는다.
  const interval=list.map(child=>[child.agentId,child.turnKey,child.status==='waiting'?child.permissionIds:child.status==='failed'?child.updatedAtMs:null]).sort((a,b)=>a[0].localeCompare(b[0]));
  const attentionKey=createHash('sha256').update(JSON.stringify([state,interval])).digest('hex');
  notifications.set(root,{group,attentionKey,updatedAtMs:list.reduce((latest,child)=>Math.max(latest,child.updatedAtMs),0)});
 }
 const display=sessions.filter(session=>!hidden.has(session.paseo.agentId)).map(session=>{
  const info=notifications.get(session.paseo.agentId);if(!info)return session;
  const {group,attentionKey,updatedAtMs}=info,{counts,state}=group;
  if(session.status!=='idle'){
   // 부모 고유 승인·제어·본문은 유지하면서 새 자식 승인이 닫힌 카드에 가려지지 않게 한다.
   return ['waiting','failed'].includes(state)?{...session,turnKey:`child-attention:${session.turnKey??''}:${attentionKey}`}:session;
  }
  let status,subtitle;
  if(state==='waiting'){status='waiting';subtitle=`하위 에이전트 승인 대기 ${counts.waiting}개`;}
  else if(state==='failed'){status='failed';subtitle=`하위 에이전트 오류 ${counts.failed}개`;}
  else if(state==='running'){status='running';subtitle=`하위 에이전트 ${counts.running}개 작업 중`;}
  else if(state==='initializing'){status='running';subtitle=`하위 에이전트 ${counts.initializing}개 시작 중`;}
  else if(state==='completed'&&group.children.some(child=>child.requiresAttention)){status='review';subtitle=`하위 에이전트 ${counts.total}개 작업 종료`;}
  else return session;
  return {...session,status,subtitle,controlTarget:null,waitingRequest:null,updatedAtMs,sortAtMs:updatedAtMs,turnKey:`child-group:${session.turnKey??''}:${attentionKey}`};
 });
 return {sessions:display,childGroups,completions,hiddenAgentIds:hidden};
}

function unavailable(){return Object.assign(Error('해당 하위 대화를 찾을 수 없습니다.'),{code:'CHILD_AGENT_UNAVAILABLE'});}
function childRoute({groups,agents,serverId,parentKey,agentId}){
 const group=Object.hasOwn(groups,parentKey)?groups[parentKey]:undefined;
 if(!group?.children.some(child=>child.agentId===agentId))throw unavailable();
 const agent=agents.find(value=>value.id===agentId);
 if(!agent||agent.archivedAt||agent.internal||agent.status==='closed')throw unavailable();
 if(sessionIdentity(serverId,group.parentAgentId)!==parentKey)throw unavailable();
 return {serverId,agentId};
}

module.exports={groupAgents,childRoute,resolveRoots,groupState};
