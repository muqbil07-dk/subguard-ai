import { z } from 'zod';
export function loadConfig(env = process.env) {
  const mode=z.enum(['account','demo']).parse(env.APP_MODE??'account');
  if(mode==='demo'&&['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'].some(name=>env[name]?.trim()))throw new Error('Demo mode must not include account database configuration.');
  const config=z.object({APP_MODE:z.enum(['account','demo']),ALLOW_PUBLIC_DEMO:z.enum(['true','false']).default('false').transform(v=>v==='true'),NODE_ENV:z.enum(['development','test','staging','production']).default('development'),SUPABASE_URL:mode==='account'?z.url():z.undefined(),SUPABASE_SERVICE_ROLE_KEY:mode==='account'?z.string().min(1).optional():z.undefined(),SUPABASE_PUBLISHABLE_KEY:mode==='account'?z.string().min(1):z.undefined(),FRONTEND_ORIGIN:z.url(),AI_ENABLED:z.enum(['true','false']).default('false').transform(v=>v==='true'),AI_PROVIDER:z.enum(['gemini','disabled']).default('gemini'),GEMINI_API_KEY:z.string().optional(),GEMINI_MODEL:z.string().regex(/^(?:models\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/).optional().or(z.literal('')),PORT:z.coerce.number().int().min(1).max(65535).default(3000)}).parse({...env,APP_MODE:mode,SUPABASE_URL:mode==='account'?env.SUPABASE_URL:undefined,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY||undefined,SUPABASE_PUBLISHABLE_KEY:env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY||undefined});
  if(mode==='account'&&config.ALLOW_PUBLIC_DEMO)throw new Error('Public demo opt-in is incompatible with account mode.');
  if(mode==='demo'&&['staging','production'].includes(config.NODE_ENV)&&!config.ALLOW_PUBLIC_DEMO)throw new Error('Hosted demo requires explicit public-demo opt-in.');
  if(config.AI_ENABLED&&(config.AI_PROVIDER!=='gemini'||!config.GEMINI_API_KEY?.trim()||!config.GEMINI_MODEL))throw new Error('Enabled AI requires Gemini provider, key and model.');
  const origin=new URL(config.FRONTEND_ORIGIN);
  if(!['http:','https:'].includes(origin.protocol))throw new Error('Frontend origin must use HTTP or HTTPS');
  if(origin.origin!==config.FRONTEND_ORIGIN) throw new Error('FRONTEND_ORIGIN must be an exact origin without path or trailing slash');
  if(['staging','production'].includes(config.NODE_ENV)&&origin.protocol!=='https:')throw new Error('Staging and production require an HTTPS frontend origin');
  if(mode==='demo')return config;
  const database=new URL(config.SUPABASE_URL);
  if(!['http:','https:'].includes(database.protocol)||database.username||database.password||database.search||database.hash||database.pathname!=='/')throw new Error('Supabase requires an HTTP(S) origin without credentials, path, query or fragment');
  if(database.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(database.hostname))throw new Error('Remote Supabase requires HTTPS');
  if(['staging','production'].includes(config.NODE_ENV)&&(origin.protocol!=='https:'||database.protocol!=='https:'))throw new Error('Staging and production require HTTPS frontend and Supabase origins');
  return config;
}
