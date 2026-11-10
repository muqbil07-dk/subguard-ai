import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider } from '../src/services/ai/geminiClient.js';

const config={AI_ENABLED:true,GEMINI_API_KEY:'synthetic-key',GEMINI_MODEL:'synthetic-model'};
const context={operations:['getFinancialSummary'],facts:[{id:'verified',operation:'getFinancialSummary'}],model:{facts:[{id:'verified',value:'ready'}],recommendations:[]}};
const selection={functionCalls:[{name:'getFinancialSummary',args:{}}]};
const cancelled=error=>error.status===504&&error.code==='AI_TIMEOUT'&&!error.message.includes('private-reason');
const pendingAbort=signal=>new Promise((_resolve,reject)=>{
 if(signal.aborted){reject(signal.reason);return;}
 signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
});

test('pre-aborted generation skips client construction, metadata and generation',async()=>{
 let constructed=0;
 const provider=createGeminiProvider(config,{clientFactory:()=>{constructed++;throw new Error('No network expected');}});
 const controller=new AbortController();controller.abort('private-reason');
 await assert.rejects(provider.generate({question:'Review facts',context,signal:controller.signal}),cancelled);
 assert.equal(constructed,0);
});

test('metadata request receives caller cancellation and cancelled verification is not cached',async()=>{
 let metadata=0,generations=0,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const provider=createGeminiProvider(config,{clientFactory:()=>({models:{
  get:async params=>{metadata++;if(metadata===1){assert.equal(params.config.httpOptions.retryOptions.attempts,1);started();return pendingAbort(params.config.abortSignal);}return {supportedActions:['generateContent']};},
  generateContent:async()=>{generations++;return generations===1?selection:{text:'validated separately'};},
 }})});
 const controller=new AbortController();const pending=provider.generate({question:'Review facts',context,signal:controller.signal});
 const rejected=assert.rejects(pending,cancelled);
 await ready;controller.abort(new Error('private-reason'));await rejected;
 assert.equal(generations,0);
 await provider.generate({question:'Review facts',context});
 assert.equal(metadata,2);assert.equal(generations,2);
});

test('cancellation after metadata resolution prevents tool-selection generation',async()=>{
 const controller=new AbortController();let generations=0;
 const provider=createGeminiProvider(config,{clientFactory:()=>({models:{get:async()=>{controller.abort('private-reason');return {supportedActions:['generateContent']};},generateContent:async()=>{generations++;return selection;}}})});
 await assert.rejects(provider.generate({question:'Review facts',context,signal:controller.signal}),cancelled);
 assert.equal(generations,0);
});

test('cancellation during tool selection prevents the final generation request',async()=>{
 const controller=new AbortController();let calls=0;
 const provider=createGeminiProvider(config,{clientFactory:()=>({models:{get:async()=>({supportedActions:['generateContent']}),generateContent:async params=>{calls++;assert.equal(params.config.httpOptions.retryOptions.attempts,1);controller.abort('private-reason');return selection;}}})});
 await assert.rejects(provider.generate({question:'Review facts',context,signal:controller.signal}),cancelled);
 assert.equal(calls,1);
});

test('in-flight final generation receives abort and cannot accept a cancelled response',async()=>{
 const controller=new AbortController();let calls=0,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const provider=createGeminiProvider(config,{clientFactory:()=>({models:{get:async()=>({supportedActions:['generateContent']}),generateContent:async params=>{calls++;if(calls===1)return selection;started();return pendingAbort(params.config.abortSignal);}}})});
 const rejected=assert.rejects(provider.generate({question:'Review facts',context,signal:controller.signal}),cancelled);
 await ready;controller.abort('private-reason');await rejected;assert.equal(calls,2);
});

test('an SDK that resolves after cancellation cannot return an accepted result',async()=>{
 const controller=new AbortController();let calls=0;
 const provider=createGeminiProvider(config,{clientFactory:()=>({models:{get:async()=>({supportedActions:['generateContent']}),generateContent:async()=>{if(++calls===1)return selection;controller.abort('private-reason');return {text:'must not be accepted'};}}})});
 await assert.rejects(provider.generate({question:'Review facts',context,signal:controller.signal}),cancelled);
 assert.equal(calls,2);
});

test('verify() remains compatible and rejects cancelled cached verification without network',async()=>{
 let metadata=0;
 const provider=createGeminiProvider(config,{clientFactory:()=>({models:{get:async()=>{metadata++;return {supportedActions:['generateContent']};}}})});
 assert.deepEqual(await provider.verify(),{enabled:true});
 const controller=new AbortController();controller.abort('private-reason');
 await assert.rejects(provider.verify({signal:controller.signal}),cancelled);
 assert.equal(metadata,1);
});
