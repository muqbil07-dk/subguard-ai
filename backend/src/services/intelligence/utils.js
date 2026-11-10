import { createHash } from 'node:crypto';
export const RULE_VERSION='recurring-v1';
export const key=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000);
export const median=values=>{const sorted=[...values].sort((a,b)=>a<b?-1:a>b?1:0);return sorted[Math.floor((sorted.length-1)/2)];};
export function advance(anchor,index,frequency){const [y,m,d]=anchor.split('-').map(Number);if(frequency==='Weekly'){const date=new Date(anchor);date.setUTCDate(date.getUTCDate()+index*7);return date.toISOString().slice(0,10);}const date=new Date(Date.UTC(y,m-1+index*({Monthly:1,Quarterly:3,'Half-yearly':6,Yearly:12}[frequency]),1));date.setUTCDate(Math.min(d,new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate()));return date.toISOString().slice(0,10);}
export const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export const eligible=t=>validDate(t.date)&&typeof t.id==='string'&&typeof t.merchant==='string'&&t.merchant.trim().length>0&&['INR','USD','EUR','GBP','JPY'].includes(t.currency)&&t.status==='Completed'&&t.direction==='debit'&&/^\d+$/.test(t.amountMinor)&&BigInt(t.amountMinor)>0n;
