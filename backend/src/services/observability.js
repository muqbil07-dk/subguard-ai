// Deliberately finite labels keep user-controlled values and cardinality out of logs.
const codes = new Set([
  'CONFIGURATION_ERROR', 'SHUTDOWN_TIMEOUT', 'INTERNAL_ERROR', 'INVALID_JSON', 'NOT_FOUND', 'ORIGIN_DENIED', 'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED', 'UNSUPPORTED_MEDIA_TYPE', 'VALIDATION_ERROR', 'AUTH_UNAVAILABLE',
  'UNAUTHORIZED', 'FORBIDDEN', 'CONFLICT', 'DATABASE_UNAVAILABLE', 'DATABASE_NOT_READY',
  'DATASET_LIMIT', 'INTELLIGENCE_UNAVAILABLE', 'AI_HISTORY_UNAVAILABLE', 'AI_RATE_LIMITED',
  'AI_CONFIGURATION', 'AI_MODEL_UNAVAILABLE', 'AI_QUOTA', 'AI_TIMEOUT', 'AI_UNAVAILABLE',
  'AI_UNGROUNDED', 'AI_CONTEXT_LIMIT', 'AI_DISABLED', 'AI_TOOL_REJECTED', 'AI_INVALID_RESPONSE',
]);
const routes = [
  ['/health', '/health'], ['/readiness', '/readiness'],
  ['/dashboard/summary', '/dashboard/summary'], ['/dashboard/spending', '/dashboard/spending'],
  ['/dashboard/category-breakdown', '/dashboard/category-breakdown'],
  ['/dashboard/upcoming-payments', '/dashboard/upcoming-payments'], ['/calendar', '/calendar'],
  ['/transactions/imports', '/transactions/imports'], ['/ai/chat', '/ai/chat'],
  ['/ai/insights/explain', '/ai/insights/explain'], ['/ai/recommendations', '/ai/recommendations'],
  ['/ai/waste-score', '/ai/waste-score'], ['/ai/conversations', '/ai/conversations'],
];
const resourceNames = ['subscriptions', 'transactions', 'notifications'];
const routeLabels=new Set([...routes.map(([,label])=>label),...resourceNames.flatMap(name=>[`/${name}`,`/${name}/:id`]),'/notifications/:id/read','/ai/conversations/:id','/ai/recommendations/:id/dismiss','/intelligence/suggestions/:id/review','/intelligence/suggestions/:id',...['detect-recurring','analyze-transactions','summary','suggestions','anomalies','duplicates','upcoming-payments'].map(name=>`/intelligence/${name}`)]);
const methods = new Set(['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
const outcomes = new Set(['success', 'client_error', 'server_error', 'aborted']);
const purposes = new Set(['chat', 'insight', 'recommendations', 'score']);
const events = new Set(['api_request', 'ai_operation', 'service_start', 'service_stop', 'dependency_check']);
const categories = new Set(['none', 'authentication', 'database', 'ai', 'validation', 'rate_limit', 'request', 'internal']);

export function routeLabel(path) {
  const value = path.replace(/^\/api(?:\/v1)?(?=\/|$)/, '');
  const exact = routes.find(([candidate]) => candidate === value);
  if (exact) return exact[1];
  for (const resource of resourceNames) {
    if (value === `/${resource}`) return `/${resource}`;
    if (new RegExp(`^/${resource}/[^/]+$`).test(value)) return `/${resource}/:id`;
  }
  if (/^\/notifications\/[^/]+\/read$/.test(value)) return '/notifications/:id/read';
  if (/^\/ai\/conversations\/[^/]+$/.test(value)) return '/ai/conversations/:id';
  if (/^\/ai\/recommendations\/[^/]+\/dismiss$/.test(value)) return '/ai/recommendations/:id/dismiss';
  if (/^\/intelligence\/(?:detect-recurring|analyze-transactions|summary|suggestions|anomalies|duplicates|upcoming-payments)$/.test(value)) return value;
  if (/^\/intelligence\/suggestions\/[^/]+$/.test(value)) return '/intelligence/suggestions/:id';
  if (/^\/intelligence\/suggestions\/[^/]+\/(?:confirm|reject)$/.test(value)) return '/intelligence/suggestions/:id/review';
  return 'unknown';
}
export const safeErrorCode = value => codes.has(value) ? value : 'INTERNAL_ERROR';
export function failureCategory(code, status) {
  if (code === 'AUTH_UNAVAILABLE' || status === 401 || status === 403) return 'authentication';
  if (code.startsWith('DATABASE_') || code === 'INTELLIGENCE_UNAVAILABLE') return 'database';
  if (code.startsWith('AI_')) return 'ai';
  if (code === 'RATE_LIMITED') return 'rate_limit';
  if (status === 400 || status === 413 || status === 415) return 'validation';
  return status >= 500 ? 'internal' : status >= 400 ? 'request' : 'none';
}
// Handles both synchronous throws and async sink rejection without changing requests.
export function safeLog(sink, record) {
  try { Promise.resolve(sink(record)).catch(() => {}); } catch { /* logging is best-effort */ }
}
export function createMonitor(sink = () => {}) {
  return input => {
    if (!events.has(input.event)) return;
    const record = { event: input.event, timestamp: new Date().toISOString() };
    if (typeof input.requestId === 'string' && /^[a-f0-9-]{36}$/.test(input.requestId)) record.requestId = input.requestId;
    if (methods.has(input.method)) record.method = input.method;
    if (routeLabels.has(input.route)) record.route = input.route;
    else if (input.route !== undefined) record.route = 'unknown';
    if (Number.isInteger(input.status) && input.status >= 100 && input.status <= 599) record.status = input.status;
    if (Number.isFinite(input.durationMs) && input.durationMs >= 0) record.durationMs = Math.round(input.durationMs);
    if (input.code !== undefined) record.code = safeErrorCode(input.code);
    if (categories.has(input.category)) record.category = input.category;
    if (outcomes.has(input.outcome)) record.outcome = input.outcome;
    if (purposes.has(input.purpose)) record.purpose = input.purpose;
    safeLog(sink, record);
  };
}
