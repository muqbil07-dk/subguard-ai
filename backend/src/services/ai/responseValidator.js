import { narratives } from './narratives.js';
import { z } from 'zod';
import { ApiError } from '../../utils/errors.js';
import { validateProse } from './aiSafety.js';
export const modelResponseSchema=z.strictObject({answer:z.enum(narratives),summary:z.enum(narratives),keyFacts:z.array(z.string().max(100)).max(12),recommendations:z.array(z.strictObject({id:z.string().max(100),explanation:z.enum(narratives)})).max(5),evidence:z.array(z.string().max(100)).max(20),warnings:z.array(z.enum(narratives)).max(5),confidence:z.enum(['limited','grounded'])});
export const responseJsonSchema=z.toJSONSchema(modelResponseSchema);
export function validateResponse(text,context,generatedAt){
 let parsed;try{if(typeof text!=='string'||text.length>12000)throw new Error();parsed=modelResponseSchema.parse(JSON.parse(text));}catch{throw new ApiError(502,'AI_INVALID_RESPONSE','AI returned an invalid response. Please retry.');}
 const facts=new Map(context.facts.map(f=>[f.id,f]));const candidates=new Map(context.recommendations.map(r=>[r.id,r]));
 for(const content of [parsed.answer,parsed.summary,...parsed.warnings,...parsed.recommendations.map(r=>r.explanation)])validateProse(content);
 for(const ref of [...parsed.keyFacts,...parsed.evidence])if(!facts.has(ref))throw new ApiError(502,'AI_UNGROUNDED','AI referenced unavailable evidence.');
 for(const r of parsed.recommendations)if(!candidates.has(r.id)||candidates.get(r.id).evidence.some(e=>!facts.has(e.id)))throw new ApiError(502,'AI_UNGROUNDED','AI recommendation lacks authorized evidence.');
 if(context.facts.length&&parsed.keyFacts.length+parsed.evidence.length===0)throw new ApiError(502,'AI_UNGROUNDED','AI response did not cite available evidence.');
 return {answer:parsed.answer,summary:parsed.summary,keyFacts:[...new Set(parsed.keyFacts)].map(id=>facts.get(id)),recommendations:parsed.recommendations.map(r=>({...candidates.get(r.id),explanation:r.explanation})),evidence:[...new Set([...parsed.evidence,...parsed.keyFacts])].map(id=>facts.get(id)),warnings:[...context.warnings,...parsed.warnings],confidence:context.facts.length&&parsed.evidence.length?'grounded':'limited',generatedAt};
}
