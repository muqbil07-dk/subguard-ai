import { requireSupabase } from './supabaseClient.js'
const fields={subscriptions:{name:'name',category:'category',amountMinor:'amount_minor',currency:'currency',frequency:'frequency',nextRenewal:'next_renewal',status:'status',unused:'unused',reminder:'reminder',color:'color',initials:'initials'},transactions:{merchant:'merchant',amountMinor:'amount_minor',currency:'currency',date:'date',category:'category',source:'source',status:'status',direction:'direction',batchKey:'batch_key',rowIndex:'row_index'}}
export function createPersistentService(getClient=requireSupabase){
 const owner=async()=>{const client=getClient();const {data,error}=await client.auth.getUser();if(error)throw error;if(!data.user)throw new Error('Authentication required');return {client,id:data.user.id}}
 const run=async query=>{const {data,error}=await query;if(error)throw error;return data}
 const dto=(row,map)=>({id:row.id,...Object.fromEntries(Object.entries(map).map(([k,v])=>[k,k==='amountMinor'?String(row[v]):row[v]]))})
 const api=(table,map=null)=>{
 const encode=input=>Object.fromEntries(Object.entries(map||{}).filter(([k])=>input[k]!==undefined).map(([k,v])=>[v,input[k]]))
 const decode=row=>map?dto(row,map):row
 return {
 async list(){const {client,id}=await owner();return (await run(client.from(table).select('*').eq('user_id',id).order('created_at'))).map(decode)},
 async get(key){const {client,id}=await owner();return decode(await run(client.from(table).select('*').eq('user_id',id).eq('id',key).single()))},
 async create(input){const {client,id}=await owner();return decode(await run(client.from(table).insert({...encode(input),user_id:id}).select().single()))},
 async update(key,input){const {client,id}=await owner();const value=map?encode(input):Object.fromEntries(Object.entries(input).filter(([k])=>({profiles:['name'],user_preferences:['currency','renewal_reminders','unusual_charges','weekly_digest'],notifications:['read_at'],ai_insights:['dismissed']}[table]||[]).includes(k)));return decode(await run(client.from(table).update(value).eq('user_id',id).eq('id',key).select().single()))},
 async delete(key){const {client,id}=await owner();await run(client.from(table).delete().eq('user_id',id).eq('id',key))}
 }}
 return {subscriptions:api('subscriptions',fields.subscriptions),transactions:api('transactions',fields.transactions),profiles:api('profiles'),preferences:api('user_preferences'),notifications:api('notifications'),insights:api('ai_insights')}
}
export const persistentService=createPersistentService()
