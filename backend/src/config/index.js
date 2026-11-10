import { z } from 'zod';
export function loadConfig(env = process.env) {
  const config=z.object({SUPABASE_URL:z.url(),SUPABASE_SERVICE_ROLE_KEY:z.string().min(1).optional(),SUPABASE_PUBLISHABLE_KEY:z.string().min(1),FRONTEND_ORIGIN:z.url(),AI_ENABLED:z.enum(['true','false']).default('false').transform(v=>v==='true'),AI_PROVIDER:z.enum(['gemini','disabled']).default('gemini'),GEMINI_API_KEY:z.string().optional(),GEMINI_MODEL:z.string().regex(/^(?:models\/)?[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/).optional().or(z.literal('')),PORT:z.coerce.number().int().min(1).max(65535).default(3000)}).parse({...env,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY||undefined,SUPABASE_PUBLISHABLE_KEY:env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY});
  if(config.AI_ENABLED&&(config.AI_PROVIDER!=='gemini'||!config.GEMINI_API_KEY?.trim()||!config.GEMINI_MODEL))throw new Error('Enabled AI requires Gemini provider, key and model.');
  const origin=new URL(config.FRONTEND_ORIGIN);
  if(origin.origin!==config.FRONTEND_ORIGIN) throw new Error('FRONTEND_ORIGIN must be an exact origin without path or trailing slash');
  if(new URL(config.SUPABASE_URL).protocol!=='https:' && !['localhost','127.0.0.1'].includes(new URL(config.SUPABASE_URL).hostname)) throw new Error('Remote Supabase requires HTTPS');
  return config;
}
