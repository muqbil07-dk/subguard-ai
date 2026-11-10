import { requireSupabase } from './supabaseClient.js'
export function createApiService({getClient=requireSupabase,fetcher=globalThis.fetch,baseUrl=import.meta.env.VITE_API_BASE_URL||'http://localhost:3000/api'}={}) {
 const request=async(path,{method='GET',body,headers={}}={})=>{
  const {data,error}=await getClient().auth.getSession();if(error)throw error;if(!data.session?.access_token)throw new Error('Sign in to access your account.');
  let response;try{response=await fetcher(`${baseUrl.replace(/\/$/,'')}${path}`,{method,signal:AbortSignal.timeout(path.startsWith('/ai/')?60000:15000),headers:{Authorization:`Bearer ${data.session.access_token}`,...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})})}catch{throw new Error('The account API is unavailable. Your demo remains separate; no sample data was substituted.')}
  const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error?.message||'Account request failed.'),{code:result.error?.code,status:response.status});return result;
 }
 const resource=path=>({
  async list(){let page=1,rows=[];while(page<=100){const result=await request(`${path}?limit=100&page=${page}`);rows.push(...result.data);if(!result.pagination||page*100>=result.pagination.total)return rows;page++}throw new Error('Account list exceeds the current supported limit.');},
  async get(id){return (await request(`${path}/${encodeURIComponent(id)}`)).data},
  async create(input){return (await request(path,{method:'POST',body:input})).data},
  async update(id,input){return (await request(`${path}/${encodeURIComponent(id)}`,{method:'PATCH',body:input})).data},
  async delete(id){return (await request(`${path}/${encodeURIComponent(id)}`,{method:'DELETE'})).data},
 });
 const notifications=resource('/notifications');notifications.update=async id=>(await request(`/notifications/${encodeURIComponent(id)}/read`,{method:'PATCH',body:{}})).data;
 const query=values=>new URLSearchParams(values).toString();
 return {
 ai:{
 async listConversations(page=1){return request(`/ai/conversations?page=${page}&limit=25`)},
 async createConversation(input={}){return (await request('/ai/conversations',{method:'POST',body:input})).data},
 async getConversation(id,page=1){return request(`/ai/conversations/${encodeURIComponent(id)}?page=${page}&limit=25`)},
 async deleteConversation(id){return (await request(`/ai/conversations/${encodeURIComponent(id)}`,{method:'DELETE'})).data},
 async chat(input){return (await request('/ai/chat',{method:'POST',body:input})).data},
 async recommendations(){return (await request('/ai/recommendations')).data},
 async wasteScore(){return (await request('/ai/waste-score')).data},
 async explain(input){return (await request('/ai/insights/explain',{method:'POST',body:input})).data},
 async dismissRecommendation(id){return (await request(`/ai/recommendations/${encodeURIComponent(id)}/dismiss`,{method:'POST',body:{}})).data},
 },
 intelligence:{
 async analyze(){return (await request('/intelligence/analyze-transactions',{method:'POST',body:{}})).data},
 async list(kind,page=1){return request(`/intelligence/${kind}?page=${page}&limit=25`)},
 async summary(){return (await request('/intelligence/summary')).data},
 async review(id,decision){return (await request(`/intelligence/suggestions/${encodeURIComponent(id)}/${decision}`,{method:'POST',body:{}})).data},
 },subscriptions:resource('/subscriptions'),transactions:resource('/transactions'),notifications,
 async importTransactions(rows,batch){return (await request('/transactions/imports',{method:'POST',headers:{'Idempotency-Key':batch},body:{rows}})).data},
 async summary(options={}){return (await request(`/dashboard/summary?${query(options)}`)).data},
 async spending(options={}){return (await request(`/dashboard/spending?${query(options)}`)).data},
 async categories(options={}){return (await request(`/dashboard/category-breakdown?${query(options)}`)).data},
 async upcoming(options={}){return (await request(`/dashboard/upcoming-payments?${query(options)}`)).data},
 async calendar(options={}){return (await request(`/calendar?${query(options)}`)).data},
 }
}
export const apiService=createApiService()
