import { createGeminiProvider } from '../src/services/ai/geminiClient.js';
import { validateResponse } from '../src/services/ai/responseValidator.js';
const provider=createGeminiProvider({AI_ENABLED:true,GEMINI_API_KEY:process.env.GEMINI_API_KEY,GEMINI_MODEL:process.env.GEMINI_MODEL});
const fact={id:'readiness',kind:'readiness',label:'Synthetic connectivity check',value:'ready',operation:'getFinancialSummary'};
const context={facts:[fact],recommendations:[],warnings:['Synthetic readiness data only.'],operations:['getFinancialSummary'],model:{facts:[fact],recommendations:[]}};
try{await provider.verify();const result=await provider.generate({question:'Please review the readiness evidence.',context});validateResponse(result.text,context,new Date().toISOString());console.log('Live Gemini model metadata, function call and structured response check passed (synthetic context).');}
catch(error){console.error(error.code||'AI_SMOKE_FAILED');process.exitCode=1;}
