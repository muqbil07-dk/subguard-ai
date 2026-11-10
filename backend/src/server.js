import { loadConfig } from './config/index.js';
import { createAuthenticator } from './middleware/auth.js';
import { createApp } from './app.js';
let config;
try { config=loadConfig(); } catch { console.error('Invalid backend configuration. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and FRONTEND_ORIGIN.');process.exit(1); }
const app=createApp({authenticate:createAuthenticator(config),origin:config.FRONTEND_ORIGIN,logger:record=>console.info(JSON.stringify(record))});
const server=app.listen(config.PORT,()=>console.info(`API listening on port ${config.PORT}`));
server.requestTimeout=30000;server.headersTimeout=15000;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
