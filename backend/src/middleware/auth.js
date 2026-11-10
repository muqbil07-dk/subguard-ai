import { createClient } from '@supabase/supabase-js';
import { ApiError } from '../utils/errors.js';
import { createRepository } from '../services/repository.js';
// getUser(token) calls the configured Supabase Auth server, verifying signature,
// issuer/project and expiry there. Decoded client claims are never authorization.
export function createAuthenticator(config, clientFactory = createClient) {
  return async token => {
    const client=clientFactory(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`},fetch:(url,init={})=>fetch(url,{...init,signal:AbortSignal.timeout(10000)})}});
    let response;
    try { response=await client.auth.getUser(token); } catch { throw new ApiError(503,'AUTH_UNAVAILABLE','Authentication service unavailable.'); }
    const {data,error}=response;
    if(error) { if(error.status>=500 || !error.status) throw new ApiError(503,'AUTH_UNAVAILABLE','Authentication service unavailable.'); throw new ApiError(401,'UNAUTHORIZED','Invalid or expired access token.'); }
    if(!data?.user?.id) throw new ApiError(401,'UNAUTHORIZED','Invalid or expired access token.');
    return {user:data.user,repository:createRepository(client,data.user.id,config.SUPABASE_SERVICE_ROLE_KEY?clientFactory(config.SUPABASE_URL,config.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}):null)};
  };
}
export const requireAuth = authenticate => async (req,_res,next) => {
  const match=/^Bearer ([^\s]{1,8192})$/i.exec(req.headers.authorization||'');
  if(!match) throw new ApiError(401,'UNAUTHORIZED','A bearer access token is required.');
  const context=await authenticate(match[1]);
  req.user=context.user; req.repository=context.repository; next();
};
