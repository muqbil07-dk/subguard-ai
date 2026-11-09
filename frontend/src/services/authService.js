import { requireSupabase } from './supabaseClient.js'
export function createAuthService(getClient = requireSupabase) {
 const call = async (method, ...args) => { const {data,error} = await getClient().auth[method](...args); if(error) throw error; return data }
 return {
 login: ({email,password}) => call('signInWithPassword',{email,password}),
 register: ({name,email,password}) => call('signUp',{email,password,options:{data:{name},emailRedirectTo: `${window.location.origin}/account`}}),
 resetPassword: ({email}) => call('resetPasswordForEmail',email,{redirectTo:`${window.location.origin}/reset-password`}),
 updatePassword: password => call('updateUser',{password}),
 logout: () => call('signOut'),
 getSession: () => call('getSession'),
 }
}
export const authService = createAuthService()
