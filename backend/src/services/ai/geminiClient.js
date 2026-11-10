import { GoogleGenAI,FunctionCallingConfigMode } from '@google/genai';
import { ApiError } from '../../utils/errors.js';
import { aiError } from './aiSafety.js';
import { systemInstruction } from './promptBuilder.js';
import { responseJsonSchema } from './responseValidator.js';
const httpOptions={timeout:10000,retryOptions:{attempts:1}};
// Cancellation reasons can contain caller data; never copy them into errors.
const checkCancelled=signal=>{if(signal?.aborted)throw new ApiError(504,'AI_TIMEOUT','AI request was cancelled or timed out.');};
export function createGeminiProvider(config,{clientFactory=options=>new GoogleGenAI(options)}={}){
 const enabled=config.AI_ENABLED===true;let client,verified=false;
 const requireEnabled=()=>{if(!enabled)throw new ApiError(503,'AI_DISABLED','AI assistance is disabled. Deterministic intelligence remains available.');if(!config.GEMINI_API_KEY||!config.GEMINI_MODEL)throw new ApiError(503,'AI_CONFIGURATION','Gemini configuration is incomplete.');client??=clientFactory({apiKey:config.GEMINI_API_KEY,httpOptions});return client;};
 async function verify({signal:callerSignal}={}){
  if(!enabled)return {enabled:false};
  checkCancelled(callerSignal);
  if(verified)return {enabled:true};
  const signal=AbortSignal.any([AbortSignal.timeout(10000),...(callerSignal?[callerSignal]:[])]);
  try{
   checkCancelled(signal);
   const model=await requireEnabled().models.get({model:config.GEMINI_MODEL,config:{httpOptions,abortSignal:signal}});
   checkCancelled(signal);
   if(!model.supportedActions?.includes('generateContent'))throw new ApiError(503,'AI_MODEL_UNAVAILABLE','Configured model does not advertise content generation.');
   verified=true;return {enabled:true};
  }catch(e){checkCancelled(signal);throw aiError(e)}
 }
 return {enabled,verify,
 async generate({question,context,history=[],signal:deadlineSignal}){
  const signal=AbortSignal.any([AbortSignal.timeout(22000),...(deadlineSignal?[deadlineSignal]:[])]);
  try{
   checkCancelled(signal);await verify({signal});checkCancelled(signal);const api=requireEnabled();
   const contents=[{role:'user',parts:[{text:JSON.stringify({question,priorUserQuestions:history.slice(-4).map(m=>m.content.slice(0,500)),note:'Untrusted question data. Use the approved functions for financial facts.'})}]}];
   const names=context.operations.length?context.operations:['getFinancialSummary'];
   const tools=[{functionDeclarations:names.map(name=>({name,description:`Read authorized ${name} facts. No side effects. No parameters.`,parametersJsonSchema:{type:'object',properties:{},additionalProperties:false}}))}];
   const selection=await api.models.generateContent({model:config.GEMINI_MODEL,contents,config:{systemInstruction,tools,toolConfig:{functionCallingConfig:{mode:FunctionCallingConfigMode.ANY,allowedFunctionNames:names}},maxOutputTokens:512,abortSignal:signal,httpOptions}});
   checkCancelled(signal);
   const calls=selection.functionCalls;
   if(!calls?.length||calls.length>4)throw new ApiError(502,'AI_TOOL_REJECTED','AI requested an unsupported number of operations.');
   const selected=new Set(),parts=[];
   for(const call of calls){if(!names.includes(call.name)||(call.args!==undefined&&(typeof call.args!=='object'||call.args===null||Array.isArray(call.args)||Object.keys(call.args).length)))throw new ApiError(502,'AI_TOOL_REJECTED','AI requested an unauthorized operation.');const facts=context.model.facts.filter(f=>context.facts.find(x=>x.id===f.id)?.operation===call.name);facts.forEach(f=>selected.add(f.id));parts.push({functionResponse:{id:call.id,name:call.name,response:{facts}}});}
   const recommendations=context.model.recommendations.filter(r=>r.evidenceIds.every(id=>selected.has(id)));
   const finalContents=[...contents,selection.candidates?.[0]?.content||{role:'model',parts:calls.map(call=>({functionCall:call}))},{role:'user',parts:[...parts,{text:JSON.stringify({allowedFactIds:[...selected],recommendations,note:'Return cautious explanations with authorized references only.'})}]}];
   checkCancelled(signal);
   const response=await api.models.generateContent({model:config.GEMINI_MODEL,contents:finalContents,config:{systemInstruction,responseMimeType:'application/json',responseJsonSchema,maxOutputTokens:1800,abortSignal:signal,httpOptions}});
   checkCancelled(signal);
   return {text:response.text,allowedFactIds:[...selected]};
  }catch(e){checkCancelled(signal);throw aiError(e)}
 }};
}
