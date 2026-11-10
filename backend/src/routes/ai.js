import { randomUUID } from 'node:crypto';
import { ApiError } from '../utils/errors.js';
import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { id,filters } from '../services/schemas.js';
import { redactInput } from '../services/ai/aiSafety.js';
const pageSchema=filters.pick({page:true,limit:true});
const empty=z.strictObject({});
export function aiRouter(assistant,{limit=20}={}){
 const router=Router();
 router.use(rateLimit({windowMs:60000,limit,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false,handler:(req,res)=>{res.set('Retry-After','60');res.status(429).json({error:{code:'AI_RATE_LIMITED',message:'AI request limit reached. Try again later.',requestId:req.requestId}})}}));
 router.get('/conversations',async(req,res)=>{const r=await req.repository.aiConversations(pageSchema.parse(req.query));res.json({data:r.rows,pagination:{page:r.page,limit:r.limit,total:r.total}})});
 router.post('/conversations',async(req,res)=>{const input=z.strictObject({title:z.string().trim().min(1).max(100).default('Subscription questions')}).parse(req.body);res.status(201).json({data:await req.repository.aiCreateConversation(redactInput(input.title).slice(0,100)||'Subscription questions')})});
 router.get('/conversations/:id',async(req,res)=>{const key=id.parse(req.params.id);const conversation=await req.repository.aiConversation(key);const r=await req.repository.aiMessages(key,pageSchema.parse(req.query));res.json({data:{conversation,messages:r.rows},pagination:{page:r.page,limit:r.limit,total:r.total}})});
 router.delete('/conversations/:id',async(req,res)=>{await req.repository.aiDeleteConversation(id.parse(req.params.id));res.json({data:{deleted:true}})});
 router.post('/chat',async(req,res)=>{
  const input=z.strictObject({conversationId:id,requestId:id.optional(),message:z.string().trim().min(3).max(1000)}).parse(req.body);
  await req.repository.aiConversation(input.conversationId);
  const requestId=input.requestId||randomUUID();
  const message=z.string().min(3).max(1000).parse([...redactInput(input.message).replace(/\s+/g,' ')].slice(0,1000).join('').trim());
  const existing=await req.repository.aiTurn(input.conversationId,requestId);
  if(existing.length){const user=existing.find(m=>m.role==='user'),reply=existing.find(m=>m.role==='assistant');if(user?.content!==message||!reply?.structured_response)throw new ApiError(409,'CONFLICT','Request identifier was used for different content.');res.json({data:{conversationId:input.conversationId,response:reply.structured_response}});return;}
  const history=await req.repository.aiMessages(input.conversationId,{page:1,limit:8});

  const {response}=await assistant.explain(req.repository,req.user.id,{question:message,history:history.rows});
  await req.repository.aiAppendTurn(input.conversationId,message,response,requestId);
  const saved=(await req.repository.aiTurn(input.conversationId,requestId)).find(m=>m.role==='assistant');
  if(!saved?.structured_response)throw new ApiError(503,'AI_HISTORY_UNAVAILABLE','The saved response could not be read. Retry with the same request identifier.');
  res.json({data:{conversationId:input.conversationId,response:saved.structured_response}});
 });
 router.post('/insights/explain',async(req,res)=>{const input=z.strictObject({insightId:id}).parse(req.body);const {response}=await assistant.explain(req.repository,req.user.id,{question:'Please explain the linked billing signal cautiously.',purpose:'insight',insightId:input.insightId});res.json({data:response})});
 router.get('/recommendations',async(req,res)=>{
  empty.parse(req.query);const context=await assistant.buildContext(req.repository,{purpose:'recommendations'});const dismissed=new Set((await req.repository.all('ai_recommendation_dismissals')).map(r=>r.recommendation_id));
  let recommendations=context.recommendations,warning=null,aiAvailable=false;
  if(assistant.provider.enabled){try{const {response}=await assistant.explain(req.repository,req.user.id,{question:'Consider reviewing the authorized recommendation evidence.',purpose:'recommendations'});const explanations=new Map(response.recommendations.map(r=>[r.id,r.explanation]));recommendations=recommendations.map(r=>({...r,explanation:explanations.get(r.id)||r.explanation}));aiAvailable=true;}catch{warning='AI explanations are unavailable. These recommendations are deterministic and evidence-based.';}}
  else warning='AI provider is disabled. Deterministic recommendations remain available.';
  res.json({data:{recommendations:recommendations.filter(r=>!dismissed.has(r.id)),aiAvailable,warning,generatedAt:context.asOf}});
 });
 router.get('/waste-score',async(req,res)=>{
  empty.parse(req.query);const context=await assistant.buildContext(req.repository,{purpose:'score'});const result={...context.score};
  if(assistant.provider.enabled&&result.state==='ready'){try{const {response}=await assistant.explain(req.repository,req.user.id,{question:'Consider explaining the review priority score cautiously.',purpose:'score'});result.explanation=response.answer;}catch{result.warning='AI explanation is unavailable. The score remains deterministic.';}}
  else result.warning='AI explanation is not connected; deterministic evidence is shown.';
  res.json({data:result});
 });
 router.post('/recommendations/:id/dismiss',async(req,res)=>{empty.parse(req.body);const key=z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.id);const context=await assistant.buildContext(req.repository,{purpose:'recommendations'});if(!context.recommendations.some(r=>r.id===key)){res.status(404).json({error:{code:'NOT_FOUND',message:'Recommendation not found.',requestId:req.requestId}});return}await req.repository.aiDismiss(key);res.json({data:{dismissed:true}})});
 return router;
}
