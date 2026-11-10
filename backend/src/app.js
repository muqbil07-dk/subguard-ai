import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { ApiError } from './utils/errors.js';
import { requireAuth } from './middleware/auth.js';
import { apiRouter } from './routes/api.js';
export function createApp({authenticate,origin='http://localhost:5173',clock,logger=()=>{},rateLimitMax=120}={}){
 if(!authenticate)throw new Error('An authenticator is required');
 const app=express();app.disable('x-powered-by');app.set('trust proxy',false);
 app.use((req,res,next)=>{req.requestId=randomUUID();res.set('X-Request-Id',req.requestId);res.set('Cache-Control','no-store');const start=Date.now();res.on('finish',()=>logger({requestId:req.requestId,method:req.method,status:res.statusCode,durationMs:Date.now()-start}));next();});
 app.use(helmet());
 app.use(cors({origin(requestOrigin,callback){if(!requestOrigin||requestOrigin===origin)return callback(null,true);callback(new ApiError(403,'ORIGIN_DENIED','Origin is not permitted.'));},methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Authorization','Content-Type','Idempotency-Key']}));
 app.use(rateLimit({windowMs:60000,limit:rateLimitMax,standardHeaders:'draft-8',legacyHeaders:false,handler:(req,res)=>res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many requests.',requestId:req.requestId}})}));
 app.get('/api/health',(_req,res)=>res.json({data:{status:'ok'}}));
 app.use(['/api','/api/v1'],requireAuth(authenticate),rateLimit({windowMs:60000,limit:rateLimitMax,keyGenerator:req=>req.user.id,standardHeaders:'draft-8',legacyHeaders:false,handler:(req,res)=>res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many requests.',requestId:req.requestId}})}));
 app.use(['/api/transactions/imports','/api/v1/transactions/imports'],express.json({limit:'1mb',strict:true}));
 app.use(express.json({limit:'32kb',strict:true}));
 app.use((req,_res,next)=>{if(['POST','PATCH'].includes(req.method)&&!req.is('application/json'))throw new ApiError(415,'UNSUPPORTED_MEDIA_TYPE','Use application/json.');next();});
 const router=apiRouter(clock);app.use('/api/v1',router);app.use('/api',router);
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
