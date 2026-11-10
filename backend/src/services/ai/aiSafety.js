import { narratives } from './narratives.js';
import { ApiError } from '../../utils/errors.js';
export function redactInput(text){
 return [...text.normalize('NFKC')].filter(c=>c==='\n'||c==='\t'||(c.codePointAt(0)>=32&&c.codePointAt(0)!==127)).join('')
 .replace(/Bearer\s+\S+/gi,'[credential redacted]')
 .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[token redacted]')
 .replace(/\b(?:AIza|sk-)[A-Za-z0-9_-]{12,}\b/g,'[key redacted]')
 .replace(/\b(?:password|api[_ -]?key|secret|access[_ -]?token)\s*(?:is|:|=)\s*\S+/gi,'[secret redacted]')
 .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email redacted]')
 .replace(/\b\d{9,}\b/g,'[identifier redacted]').trim();
}
// Model prose is deliberately non-numeric and non-authoritative. Verified figures,
// dates, merchants, usage assertions and payment statuses are attached as facts.
export function validateProse(text){
 if(!narratives.includes(text))throw new ApiError(502,'AI_UNGROUNDED','AI output contained unsupported narrative. Please retry.');
 return text;
}
export function aiError(error){
 if(error instanceof ApiError)return error;
 const status=Number(error.status||error.code);
 if(status===408||status===504||error.name==='AbortError'||error.name==='TimeoutError'||/timeout|timed out/i.test(error.message||''))return new ApiError(504,'AI_TIMEOUT','AI request timed out. Please retry later.');
 if(status===401||status===403||(status===400&&/API.?key|API_KEY_INVALID/i.test(error.message||'')))return new ApiError(503,'AI_CONFIGURATION','AI provider authentication failed. Ask the operator to check configuration.');
 if(status===429)return new ApiError(429,'AI_QUOTA','AI quota is exhausted. Please try later.');
 if(status===404)return new ApiError(503,'AI_MODEL_UNAVAILABLE','Configured AI model is unavailable.');
 return new ApiError(503,'AI_UNAVAILABLE','AI assistance is temporarily unavailable. Deterministic insights remain available.');
}
