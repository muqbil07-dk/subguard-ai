import { createGeminiProvider } from './services/ai/geminiClient.js';
import { createFinancialAssistant } from './services/ai/financialAssistant.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { ApiError } from './utils/errors.js';
import { requireAuth } from './middleware/auth.js';
import { apiRouter } from './routes/api.js';
import { demoRouter } from './routes/demo.js';
import { createDemoAssistant } from './services/demo/demoAssistant.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createMonitor, routeLabel, safeErrorCode, failureCategory, safeLog } from './services/observability.js';
export function createApp({appMode='account',authenticate,origin='http://localhost:5173',clock,logger=()=>{},monitor=()=>{},rateLimitMax=120,assistant=createFinancialAssistant(createGeminiProvider({AI_ENABLED:false})),aiOptions,demoAssistant,demoOptions}={}){
 if(!['account','demo'].includes(appMode))throw new Error('Invalid application mode');
 if(appMode==='account'&&!authenticate)throw new Error('An authenticator is required');
 if(appMode==='demo'&&authenticate)throw new Error('Demo mode cannot initialize account authentication');
 const app=express();app.disable('x-powered-by');app.set('trust proxy',false);
 const report=createMonitor(monitor),context=new AsyncLocalStorage();
 const observedAssistant={...assistant,async explain(...args){
  const start=performance.now(),requestId=context.getStore()?.requestId;
  const purpose=args[2]?.purpose||'chat';
  try{const result=await assistant.explain(...args);report({event:'ai_operation',requestId,purpose,outcome:'success',category:'none',durationMs:performance.now()-start});return result;}
  catch(error){const code=safeErrorCode(error.code);report({event:'ai_operation',requestId,purpose,outcome:'server_error',category:failureCategory(code,error.status||500),code,durationMs:performance.now()-start});throw error;}
 }};
 app.use((req,res,next)=>{
  req.requestId=randomUUID();res.set('X-Request-Id',req.requestId);res.set('Cache-Control','no-store');
  const start=performance.now(),route=routeLabel(req.path);let errorCode,finished=false;
  const json=res.json;
  res.json=function(body){if(body?.error)errorCode=safeErrorCode(body.error.code);return json.call(this,body);};
  res.on('finish',()=>{
   finished=true;const durationMs=Math.round(performance.now()-start);
   safeLog(logger,{requestId:req.requestId,method:req.method,status:res.statusCode,durationMs});
   const code=res.statusCode>=400?(errorCode||'INTERNAL_ERROR'):undefined;
   report({event:'api_request',requestId:req.requestId,method:req.method,route,status:res.statusCode,durationMs,code,category:failureCategory(code||'',res.statusCode),outcome:res.statusCode>=500?'server_error':res.statusCode>=400?'client_error':'success'});
  });
  res.on('close',()=>{if(!finished)report({event:'api_request',requestId:req.requestId,method:req.method,route,status:499,durationMs:performance.now()-start,category:'request',outcome:'aborted'});});
  context.run({requestId:req.requestId},next);
 });
 app.use(helmet());
 app.use(cors({origin(requestOrigin,callback){if(!requestOrigin||requestOrigin===origin)return callback(null,true);callback(new ApiError(403,'ORIGIN_DENIED','Origin is not permitted.'));},methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Authorization','Content-Type','Idempotency-Key']}));
 app.use(rateLimit({windowMs:60000,limit:rateLimitMax,standardHeaders:'draft-8',legacyHeaders:false,handler:(req,res)=>res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many requests.',requestId:req.requestId}})}));
 app.get('/api/health',(_req,res)=>res.json({data:{status:'ok'}}));
 if(appMode==='demo'){
  app.use('/api/demo/assistant',express.json({limit:'4kb',strict:true}),(req,_res,next)=>{
   if(req.method==='POST'&&!req.is('application/json'))throw new ApiError(415,'UNSUPPORTED_MEDIA_TYPE','Use application/json.');
   next();
  },demoRouter(demoAssistant||createDemoAssistant(createGeminiProvider({AI_ENABLED:false})),demoOptions));
  // Account routes never receive a demo identity or fixture-backed repository.
  app.use(['/api','/api/v1'],()=>{throw new ApiError(401,'UNAUTHORIZED','Account APIs are not available in synthetic demo mode.');});
 }else{
 app.use(['/api','/api/v1'],requireAuth(authenticate),rateLimit({windowMs:60000,limit:rateLimitMax,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false,handler:(req,res)=>res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many requests.',requestId:req.requestId}})}));
 app.use(['/api/transactions/imports','/api/v1/transactions/imports'],express.json({limit:'1mb',strict:true}));
 app.use(express.json({limit:'32kb',strict:true}));
 app.use((req,_res,next)=>{if(['POST','PATCH'].includes(req.method)&&!req.is('application/json'))throw new ApiError(415,'UNSUPPORTED_MEDIA_TYPE','Use application/json.');next();});
 const router=apiRouter(clock,observedAssistant,aiOptions);app.use('/api/v1',router);app.use('/api',router);
 }
 app.use((_req,_res,next)=>next(new ApiError(404,'NOT_FOUND','Endpoint not found.')));
 app.use((error,req,res,_next)=>{let status=500,code='INTERNAL_ERROR',message='Request could not be completed.';
 if(error instanceof ZodError){status=400;code='VALIDATION_ERROR';message='Invalid request fields.';}
 else if(error.type==='entity.too.large'){status=413;code='PAYLOAD_TOO_LARGE';message='Request body is too large.';}
 else if(error.type==='entity.parse.failed'){status=400;code='INVALID_JSON';message='Malformed JSON.';}
 else if(error instanceof ApiError||['VALIDATION_ERROR'].includes(error.code)){status=error.status;code=error.code;message=error.message;}
 res.status(status).json({error:{code,message,requestId:req.requestId}});
 });
 return app;
}
