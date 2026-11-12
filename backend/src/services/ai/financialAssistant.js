import { createHash } from 'node:crypto';
import { buildFinancialContext } from './financialContextBuilder.js';
import { validateResponse } from './responseValidator.js';
import { ApiError } from '../../utils/errors.js';
import { redactInput } from './aiSafety.js';
import { AI_TIMEOUTS } from './timeouts.js';
export function createFinancialAssistant(provider,{now=()=>new Date().toISOString(),asOf,reserveRequest=repository=>repository.reserveAiRequest()}={}){
 const cache=new Map();
 async function perform(repository,userId,{question,purpose='chat',insightId,history=[]},signal){
  const safeQuestion=redactInput(question);const contextualQuestion=[...history.filter(m=>m.role==='user').slice(-2).map(m=>redactInput(m.content).slice(0,500)),safeQuestion].join(' ');const context=await buildFinancialContext(repository,{question:contextualQuestion,purpose,insightId,asOf:asOf||now().slice(0,10)});
  signal.throwIfAborted();
  const cacheKey=createHash('sha256').update(JSON.stringify([userId,purpose,safeQuestion,context.facts,context.recommendations])).digest('hex');
  const existing=cache.get(cacheKey);if(purpose!=='chat'&&existing?.until>Date.now())return {response:existing.response,context};
  if(!provider.enabled)await provider.generate({question:safeQuestion,context}); // explicit unavailable, never a fake reply
  await reserveRequest(repository);
  signal.throwIfAborted();
  const generated=await provider.generate({question:safeQuestion,context,signal,history:history.filter(m=>m.role==='user').map(m=>({content:redactInput(m.content)}))});
  const authorized={...context,facts:context.facts.filter(f=>generated.allowedFactIds.includes(f.id))};
  const response=validateResponse(generated.text,authorized,now());
  if(purpose!=='chat'){if(cache.size>=200)cache.delete(cache.keys().next().value);cache.set(cacheKey,{until:Date.now()+300000,response});}
  return {response,context};
 }
 async function explain(repository,userId,options){
 const controller=new AbortController();let timer;
 try{return await Promise.race([perform(repository,userId,options,controller.signal),new Promise((_resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ApiError(504,'AI_TIMEOUT','AI request exceeded its total deadline.'));},AI_TIMEOUTS.assistantTotalMs)})]);}finally{clearTimeout(timer)}
 }
 return {explain,provider,buildContext:(repository,options)=>buildFinancialContext(repository,{...options,asOf:asOf||now().slice(0,10)})};
}
