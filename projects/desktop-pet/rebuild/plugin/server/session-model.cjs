'use strict';

// Pure boundary: raw Paseo AgentSnapshotPayload -> original Ev session props.
// Ev/nh/ah keep responsibility for notification filtering, order, TTL and copy.
const STATUS = new Set(['initializing', 'idle', 'running', 'error', 'closed']);
const {questionToWaitingRequest}=require('./questions.cjs');
function requiredId(value, label) {
  if (typeof value !== 'string' || !value.length) throw new TypeError(`${label} must be a nonempty string`);
  return value;
}
function sessionIdentity(serverId, agentId) {
  return `paseo:${encodeURIComponent(requiredId(serverId, 'serverId'))}:${encodeURIComponent(requiredId(agentId, 'agent.id'))}`;
}
function timestamp(value, label) {
  const number = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a valid timestamp`);
  return number;
}
function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function deriveSessionStatus(agent) {
  if (!STATUS.has(agent.status)) throw new TypeError(`Unknown Paseo status: ${agent.status}`);
  // Identical precedence to protocol 0.14 deriveAgentStateBucket, expressed in
  // original session vocabulary. Initializing is not evidence of a running turn.
  if ((agent.pendingPermissions?.length ?? 0) > 0 || agent.attentionReason === 'permission') return 'waiting';
  if (agent.status === 'error' || agent.attentionReason === 'error') return 'failed';
  if (agent.status === 'running') return 'running';
  if (agent.requiresAttention === true) return 'review';
  return 'idle';
}
function permissionToWaitingRequest(request) {
  if (!request) return null;
  requiredId(request.id, 'permission.id');
  const question=questionToWaitingRequest(request);
  if(question)return question;
  const title = text(request.title) ?? text(request.name) ?? '확인 요청';
  const actions = (request.kind==='question'?[]:request.actions ?? []).flatMap(action => {
    if (typeof action.id !== 'string' || !action.id || !text(action.label) || !['allow', 'deny'].includes(action.behavior)) return [];
    return [{
      intent: 'paseo-permission',
      label: action.label,
      tone: ['primary', 'secondary', 'danger'].includes(action.variant) ? action.variant : action.behavior === 'deny' ? 'danger' : 'primary',
      // This is a real Paseo response envelope, not a made-up Codex decision.
      paseoPermission: {requestId: request.id, response: {behavior: action.behavior, selectedActionId: action.id}},
    }];
  });
  return {
    kind: 'tool', requestId: request.id, operation: title, title,
    target: text(request.name) ?? title, summary: text(request.description),
    actions: actions.length ? actions : [{intent: 'open', label: '대화에서 확인', tone: 'primary'}],
  };
}
function toOriginalSession(agent, context) {
  if (!agent || !context) throw new TypeError('agent and context are required');
  const id = requiredId(agent.id, 'agent.id'), serverId = requiredId(context.serverId, 'serverId');
  // These entries do not represent visible recent sessions in the Paseo UI.
  if (agent.archivedAt || agent.internal || agent.status === 'closed') return null;
  const key = sessionIdentity(serverId, id), status = deriveSessionStatus(agent);
  const previous = context.previous?.key === key ? context.previous : null;
  const userMessageAt = agent.lastUserMessageAt ?? null;
  const activeTurnId = text(agent.activeTurn?.turnId);
  const unchangedUserTurn = previous?.paseo && previous.paseo.lastUserMessageAt === userMessageAt;
  // Keep a provider turn ID after activeTurn disappears on completion. A new
  // user-message timestamp retires that retained ID. Caller passes prior output.
  const turnKey = activeTurnId ?? (unchangedUserTurn ? previous.turnKey : null) ?? userMessageAt ?? agent.attentionTimestamp ?? null;
  const updatedAtMs = timestamp(agent.attentionTimestamp && agent.requiresAttention ? agent.attentionTimestamp : agent.updatedAt, 'agent.updatedAt/attentionTimestamp');
  const sortAtMs = agent.activeTurn?.startedAt ? timestamp(agent.activeTurn.startedAt, 'activeTurn.startedAt')
    : previous?.turnKey === turnKey ? previous.sortAtMs
    : userMessageAt ? timestamp(userMessageAt, 'lastUserMessageAt') : timestamp(agent.updatedAt, 'agent.updatedAt');
  const pending = agent.pendingPermissions ?? [];
  if (!Array.isArray(pending)) throw new TypeError('pendingPermissions must be an array');
  const latestRequest = pending.at(-1) ?? null;
  return {
    actionPath: `paseo://h/${encodeURIComponent(serverId)}/agent/${encodeURIComponent(id)}`,
    controlTarget: context.canControl === false ? null : {type: 'app-server-conversation', conversationId: key},
    // The actual bridge connects only to this machine's loopback daemon. This
    // host ID describes where files execute, not the Paseo routing identity.
    hostId: 'local', key, localConversationId: key,
    source: context.source ?? 'local', showInNotificationTray: true,
    sortAtMs, status, subtitle: text(context.subtitle) ?? (status === 'failed' ? text(agent.lastError) : null),
    title: text(agent.title) ?? '새 대화', turnKey, updatedAtMs,
    waitingRequest: status === 'waiting' ? permissionToWaitingRequest(latestRequest) : null,
    // Explicit route metadata consumed only by real host callbacks. Never parse
    // a display title or a Codex host ID to guess which Paseo daemon to contact.
    paseo: {serverId, agentId: id, workspaceId: agent.workspaceId ?? null, lastUserMessageAt: userMessageAt, activeTurnId, permissionRequestIds: pending.map(request => request.id)},
  };
}
function toOriginalSessions(agents, context) {
  if (!Array.isArray(agents)) throw new TypeError('agents must be an array');
  const previous = new Map((context.previousSessions ?? []).map(session => [session.key, session]));
  const found = new Set(), sessions = [];
  for (const agent of agents) {
    const key = sessionIdentity(context.serverId, agent.id);
    if (found.has(key)) throw new Error(`Duplicate Paseo agent identity: ${key}`);
    found.add(key);
    const session = toOriginalSession(agent, {...context, previous: previous.get(key)});
    if (session) sessions.push(session);
  }
  return sessions;
}
module.exports = {sessionIdentity, deriveSessionStatus, permissionToWaitingRequest, toOriginalSession, toOriginalSessions};
