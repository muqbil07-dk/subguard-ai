import { describe,it,expect,vi } from 'vitest'
import { createApiService } from './apiService.js'
const getClient=()=>({auth:{getSession:async()=>({data:{session:{access_token:'caller-token'}}})}})
describe('authenticated backend adapter',()=>{
 it('lets AI finish within its backend deadline while retaining short ordinary API timeouts',async()=>{
  const deadline=vi.spyOn(AbortSignal,'timeout')
  try {
   const api=createApiService({getClient,fetcher:async()=>({ok:true,json:async()=>({data:{}})})})
   await api.ai.chat({message:'Review synthetic subscriptions'})
   await api.summary()
   expect(deadline.mock.calls.map(([ms])=>ms)).toEqual([85000,15000])
  } finally { deadline.mockRestore() }
 })
 it('forwards caller access token and reads every bounded page',async()=>{const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({data:[{id:'first'}],pagination:{total:101}})}).mockResolvedValueOnce({ok:true,json:async()=>({data:[{id:'last'}],pagination:{total:101}})});const api=createApiService({getClient,fetcher,baseUrl:'http://api.test/api'});expect((await api.subscriptions.list()).map(r=>r.id)).toEqual(['first','last']);expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer caller-token');expect(fetcher.mock.calls[1][0]).toContain('page=2')})
 it('fails without a session, without a network or on rejected backend responses; never seeds demo',async()=>{const fetcher=vi.fn();const api=createApiService({getClient:()=>({auth:{getSession:async()=>({data:{session:null}})}}),fetcher});await expect(api.transactions.list()).rejects.toThrow('Sign in');expect(fetcher).not.toHaveBeenCalled();const unavailable=createApiService({getClient,fetcher:async()=>{throw new Error('offline')}});await expect(unavailable.calendar()).rejects.toThrow('no sample data');const denied=createApiService({getClient,fetcher:async()=>({ok:false,status:401,json:async()=>({error:{message:'Expired session',code:'UNAUTHORIZED'}})})});await expect(denied.summary()).rejects.toMatchObject({status:401,code:'UNAUTHORIZED'})})
 it('sends imports with stable replay header and notifications through server-owned read timestamp',async()=>{const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{inserted:1}})});const api=createApiService({getClient,fetcher});await api.importTransactions([{merchant:'Store'}],'file-hash');expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('file-hash');await api.notifications.update('notification',{read_at:'client-forged'});expect(fetcher.mock.calls[1][0]).toContain('/notifications/notification/read');expect(fetcher.mock.calls[1][1].body).toBe('{}')})
})

describe('API response failure boundaries',()=>{
 it.each([200,502,401])('handles malformed/non-JSON responses without exposing the response body (%s)',async status=>{
  const fetcher=vi.fn().mockResolvedValue({ok:status===200,status,json:async()=>{throw new SyntaxError('private upstream HTML body')}})
  const api=createApiService({getClient,fetcher})
  await expect(api.summary()).rejects.toMatchObject({status,code:'INVALID_API_RESPONSE',message:'The account API returned an unreadable response. Please retry.'})
 })
 it.each([null,[],{},'private upstream text'])('rejects invalid response envelopes: %j',async result=>{
  const api=createApiService({getClient,fetcher:async()=>({ok:true,status:200,json:async()=>result})})
  await expect(api.summary()).rejects.toMatchObject({code:'INVALID_API_RESPONSE'})
 })
})
