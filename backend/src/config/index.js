import { z } from 'zod';
export function loadConfig(env = process.env) {
  const config=z.object({SUPABASE_URL:z.url(),SUPABASE_PUBLISHABLE_KEY:z.string().min(1),FRONTEND_ORIGIN:z.url(),PORT:z.coerce.number().int().min(1).max(65535).default(3000)}).parse({...env,SUPABASE_PUBLISHABLE_KEY:env.SUPABASE_PUBLISHABLE_KEY||env.SUPABASE_ANON_KEY});
  const origin=new URL(config.FRONTEND_ORIGIN);
  if(origin.origin!==config.FRONTEND_ORIGIN) throw new Error('FRONTEND_ORIGIN must be an exact origin without path or trailing slash');
  if(new URL(config.SUPABASE_URL).protocol!=='https:' && !['localhost','127.0.0.1'].includes(new URL(config.SUPABASE_URL).hostname)) throw new Error('Remote Supabase requires HTTPS');
  return config;
}
