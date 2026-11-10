import { ApiError, databaseError } from '../utils/errors.js';
const fields={subscriptions:{name:'name',category:'category',amountMinor:'amount_minor',currency:'currency',frequency:'frequency',nextRenewal:'next_renewal',status:'status',unused:'unused',reminder:'reminder',color:'color',initials:'initials'},transactions:{merchant:'merchant',amountMinor:'amount_minor',currency:'currency',date:'date',category:'category',source:'source',status:'status',direction:'direction',batchKey:'batch_key',rowIndex:'row_index'},notifications:{title:'title',body:'body',read_at:'read_at',created_at:'created_at'}};
const encode=(table,value)=>Object.fromEntries(Object.entries(fields[table]).filter(([key])=>value[key]!==undefined).map(([key,column])=>[column,value[key]]));
const decode=(table,row)=>!fields[table]?row:({id:row.id,...Object.fromEntries(Object.entries(fields[table]).map(([key,column])=>[key,key==='amountMinor'?String(row[column]):row[column]]))});
const run=async query=>{let result;try{result=await query;}catch{throw databaseError({});}const {data,error,count}=result;if(error)throw databaseError(error);return {data,count};};
export function createRepository(client,userId,intelligenceWriter=null) {
  const owned=table=>client.from(table).select('*',{count:'exact'}).eq('user_id',userId);
  const privileged=()=>{if(!intelligenceWriter)throw new ApiError(503,'INTELLIGENCE_UNAVAILABLE','Intelligence persistence requires server-only configuration.');return intelligenceWriter;};
  return {
    async aiConversations({page=1,limit=25}={}){const {data,count}=await run(client.from('ai_conversations').select('*',{count:'exact'}).eq('user_id',userId).order('updated_at',{ascending:false}).order('id').range((page-1)*limit,page*limit-1));return {rows:data,total:count,page,limit};},
    async aiCreateConversation(title){return (await run(client.from('ai_conversations').insert({user_id:userId,title}).select().single())).data;},
    async aiConversation(id){const {data}=await run(client.from('ai_conversations').select('*').eq('user_id',userId).eq('id',id).maybeSingle());if(!data)throw new ApiError(404,'NOT_FOUND','Conversation not found.');return data;},
    async aiMessages(id,{page=1,limit=25}={}){await this.aiConversation(id);const {data,count}=await run(client.from('ai_messages').select('*',{count:'exact'}).eq('user_id',userId).eq('conversation_id',id).order('sequence',{ascending:false}).range((page-1)*limit,page*limit-1));return {rows:data.reverse(),total:count,page,limit};},
    async aiDeleteConversation(id){const {data}=await run(client.from('ai_conversations').delete().eq('user_id',userId).eq('id',id).select('id'));if(!data.length)throw new ApiError(404,'NOT_FOUND','Conversation not found.');},
    async aiTurn(id,requestId){await this.aiConversation(id);return (await run(client.from('ai_messages').select('role,content,structured_response').eq('user_id',userId).eq('conversation_id',id).eq('turn_id',requestId).order('sequence'))).data;},
    async aiAppendTurn(id,message,response,requestId){return (await run(privileged().rpc('append_ai_turn',{owner:userId,conversation:id,user_text:message,response,request_key:requestId}))).data;},
    async reserveAiRequest(){return (await run(privileged().rpc('reserve_ai_request',{owner:userId}))).data;},
    async aiDismiss(id){await run(client.from('ai_recommendation_dismissals').upsert({user_id:userId,recommendation_id:id},{onConflict:'user_id,recommendation_id',ignoreDuplicates:true}));},

    async intelligenceList(table,{page=1,limit=25,kind,from,to}={}){let query=client.from(table).select('*',{count:'exact'}).eq('user_id',userId);if(kind==='upcoming'){query=query.neq('state','Rejected').not('payload->prediction->>nextPaymentDate','is',null);if(from)query=query.gte('payload->prediction->>nextPaymentDate',from);if(to)query=query.lte('payload->prediction->>nextPaymentDate',to);}if(table==='transaction_anomalies'){query=query.eq('active',true);query=kind==='duplicates'?query.eq('type','possible_duplicate'):query.neq('type','possible_duplicate');}const {data,count}=await run(query.order('created_at').order('id').range((page-1)*limit,page*limit-1));return {rows:data,total:count,page,limit};},
    async suggestion(id){const {data}=await run(client.from('recurring_detection_suggestions').select('*').eq('user_id',userId).eq('id',id).maybeSingle());if(!data)throw new ApiError(404,'NOT_FOUND','Suggestion not found.');return data;},
    async persistIntelligence(result){return (await run(privileged().rpc('persist_intelligence',{owner:userId,result}))).data;},
    async reviewSuggestion(id,decision){return (await run(privileged().rpc('review_recurring',{owner:userId,suggestion:id,decision}))).data;},

    async list(table,filter={}) {
      const page=filter.page||1,limit=filter.limit||25;
      let query=client.from(table).select('*',{count:'exact'}).eq('user_id',userId);
      for(const key of ['currency','category','status'])if(filter[key])query=query.eq(key,filter[key]);
      const column=table==='subscriptions'?'next_renewal':'date';
      if(filter.from)query=query.gte(column,filter.from);if(filter.to)query=query.lte(column,filter.to);
      if(filter.merchant)query=query.ilike(table==='subscriptions'?'name':'merchant',`%${filter.merchant.replace(/[\\%_]/g,'\\$&')}%`);
      const {data,count}=await run(query.order('created_at',{ascending:false}).order('id').range((page-1)*limit,page*limit-1));
      return {rows:data.map(row=>decode(table,row)),total:count,page,limit};
    },
    async all(table,{from,to}={}) {
      const rows=[];
      while(rows.length<=10000){
        let query=owned(table);if(table==='transactions'){if(from)query=query.gte('date',from);if(to)query=query.lte('date',to);}
        const {data,count}=await run(query.order('id').range(rows.length,rows.length+999));
        if(!Number.isInteger(count)||count<0)throw new ApiError(503,'DATABASE_UNAVAILABLE','Cannot determine complete dataset size.');
        if(count>10000)throw new ApiError(422,'DATASET_LIMIT','Dataset exceeds the current analysis limit.');
        rows.push(...data.map(row=>decode(table,row)));
        if(rows.length>=count)return rows;
        if(data.length===0)throw new ApiError(503,'DATABASE_UNAVAILABLE','Incomplete dataset response.');
      }
      throw new ApiError(422,'DATASET_LIMIT','Dataset exceeds the current analysis limit.');
    },
    async get(table,key){const {data}=await run(owned(table).eq('id',key).maybeSingle());if(!data)throw new ApiError(404,'NOT_FOUND','Record not found.');return decode(table,data);},
    async create(table,input){const {data}=await run(client.from(table).insert({...encode(table,input),user_id:userId}).select().single());return decode(table,data);},
    async update(table,key,input){const {data}=await run(client.from(table).update(encode(table,input)).eq('user_id',userId).eq('id',key).select().maybeSingle());if(!data)throw new ApiError(404,'NOT_FOUND','Record not found.');return decode(table,data);},
    async delete(table,key){const {data}=await run(client.from(table).delete().eq('user_id',userId).eq('id',key).select('id'));if(!data.length)throw new ApiError(404,'NOT_FOUND','Record not found.');},
    async import(rows,batch){return (await run(client.rpc('import_transactions',{rows,batch}))).data;},
  };
}
