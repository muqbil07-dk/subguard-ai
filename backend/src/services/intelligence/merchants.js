export function normalizeMerchant(original){const normalized=original.normalize('NFKC').toLowerCase().trim().replace(/^https?:\/\//,'').replace(/^www\./,'').replace(/\.com\b/g,'').replace(/\bsubscription\b/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();return {original,identity:normalized||original.toLowerCase(),confidence:normalized?100:60};}
export function groupTransactions(rows,userId){const groups=new Map();for(const row of rows){if(row.user_id&&row.user_id!==userId)continue;const merchant=normalizeMerchant(row.merchant);const source=row.source||'User CSV import';const identity=JSON.stringify([userId,source,merchant.identity,row.currency]);if(!groups.has(identity))groups.set(identity,{merchant,source,currency:row.currency,rows:[]});groups.get(identity).rows.push(row);}return [...groups.values()];}

// Split parallel, materially different amount streams only when their observed
// date ranges overlap. Sequential price changes remain one merchant history.
export function splitParallelStreams(group,tolerancePercent=10){
 const clusters=[];
 for(const row of [...group.rows].sort((a,b)=>BigInt(a.amountMinor)<BigInt(b.amountMinor)?-1:1)){
  const amount=BigInt(row.amountMinor);
  let cluster=clusters.at(-1);
  if(cluster&&(amount-BigInt(cluster[0].amountMinor))*100n>BigInt(cluster[0].amountMinor)*BigInt(tolerancePercent))cluster=null;
  if(!cluster){cluster=[];clusters.push(cluster);}cluster.push(row);
 }
 if(clusters.length<2||clusters.some(c=>c.length<2))return [group];
 const ranges=clusters.map(c=>c.map(t=>t.date).sort());
 const first=ranges.map(r=>r[0]).sort().at(-1),last=ranges.map(r=>r.at(-1)).sort()[0];
 if(first>last)return [group];
 return clusters.map(rows=>({...group,rows,stream:rows.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))[0].id}));
}
