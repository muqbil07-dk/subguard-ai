import { eligible,key,RULE_VERSION,validDate } from './utils.js';
import { groupTransactions,splitParallelStreams } from './merchants.js';
import { detect } from './detection.js';
import { anomalies,duplicates } from './anomalies.js';
export { recurringSummary } from './spending.js';
export function analyzeTransactions(transactions,{userId,asOf,config}={}){
 if(!userId||!validDate(asOf))throw new Error('A verified owner and valid analysis date are required.');
 if(transactions.length>10000)throw new Error('Analysis exceeds 10000 input records.');
 const unique=new Map();for(const t of transactions){if((t.user_id&&t.user_id!==userId)||t.date>asOf||!eligible(t))continue;const identity=t.batchKey!==undefined&&t.rowIndex!==undefined?key(t.user_id||userId,t.batchKey,t.rowIndex):t.id;if(!unique.has(identity))unique.set(identity,t);}
 const suggestions=[],findings=[];for(const group of groupTransactions([...unique.values()],userId).flatMap(g=>splitParallelStreams(g))){const candidate=detect(group,asOf,config?.detection);suggestions.push(candidate);findings.push(...anomalies(group,candidate,config?.anomalies),...duplicates(group));}
 return {ruleVersion:RULE_VERSION,asOf,suggestions,findings};
}
