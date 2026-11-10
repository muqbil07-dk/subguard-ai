import { createGeminiProvider } from './services/ai/geminiClient.js';
import { createFinancialAssistant } from './services/ai/financialAssistant.js';
import { loadConfig } from './config/index.js';
import { createAuthenticator } from './middleware/auth.js';
import { createApp } from './app.js';
let config;
try { config=loadConfig(); } catch { console.error('Invalid backend configuration. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY FRONTEND_ORIGIN and enabled AI settings.');process.exit(1); }
const provider=createGeminiProvider(config);
if(config.AI_ENABLED){try{await provider.verify()}catch(e){console.error(e.code||'AI_UNAVAILABLE')}}
const app=createApp({authenticate:createAuthenticator(config),assistant:createFinancialAssistant(provider),origin:config.FRONTEND_ORIGIN,logger:record=>console.info(JSON.stringify(record))});
const server=app.listen(config.PORT,()=>console.info(`API listening on port ${config.PORT}`));
server.requestTimeout=30000;server.headersTimeout=15000;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
