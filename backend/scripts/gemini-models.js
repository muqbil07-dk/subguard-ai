import { GoogleGenAI } from '@google/genai';
if(!process.env.GEMINI_API_KEY){console.error('Set GEMINI_API_KEY securely before listing models.');process.exit(1)}
try {
 const client=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY,httpOptions:{timeout:10000,retryOptions:{attempts:1}}});
 const pager=await client.models.list({config:{pageSize:100}});
 let count=0;
 for await(const model of pager){if(model.supportedActions?.includes('generateContent'))console.log(model.name);if(++count>=200)break;}
}catch{console.error('Model listing failed. Check key, region, quota and outbound access.');process.exitCode=1;}
