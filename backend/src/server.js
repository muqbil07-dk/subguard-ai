import { createGeminiProvider } from './services/ai/geminiClient.js';
import { createFinancialAssistant } from './services/ai/financialAssistant.js';
import { loadConfig } from './config/index.js';
import { createAuthenticator } from './middleware/auth.js';
import { createApp } from './app.js';
import { createMonitor } from './services/observability.js';
import { createDemoAssistant } from './services/demo/demoAssistant.js';
const monitor=record=>console.info(JSON.stringify(record));
const report=createMonitor(monitor);
let config;
try { config=loadConfig(); } catch { report({event:'service_start',code:'CONFIGURATION_ERROR',outcome:'server_error',category:'internal'});process.exit(1); }
const provider=createGeminiProvider(config);
if(config.AI_ENABLED){try{await provider.verify()}catch(e){report({event:'dependency_check',code:e.code||'AI_UNAVAILABLE',category:'ai',outcome:'server_error'})}}
// The demo branch never constructs a Supabase client/authenticator or repository.
const app=config.APP_MODE==='demo'
 ?createApp({appMode:'demo',demoAssistant:createDemoAssistant(provider),origin:config.FRONTEND_ORIGIN,monitor})
 :createApp({authenticate:createAuthenticator(config),assistant:createFinancialAssistant(provider),origin:config.FRONTEND_ORIGIN,monitor});
console.info(JSON.stringify({event:'configuration_summary',mode:config.APP_MODE,aiEnabled:config.AI_ENABLED,provider:config.AI_PROVIDER,database:config.APP_MODE==='demo'?'not_initialized':'account_mode'}));
const server=app.listen(config.PORT,()=>report({event:'service_start',outcome:'success',category:'none'}));
server.requestTimeout=30000;server.headersTimeout=15000;
let shuttingDown=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(shuttingDown)return;shuttingDown=true;server.close(()=>{report({event:'service_stop',outcome:'success',category:'none'});process.exit(0)});setTimeout(()=>{report({event:'service_stop',code:'SHUTDOWN_TIMEOUT',outcome:'server_error',category:'internal'});process.exit(1)},10000).unref();});
