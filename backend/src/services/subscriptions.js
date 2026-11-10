import { subscription } from './schemas.js';
// All subscription creation paths share validation. Suggestion confirmation uses
// the atomic database creation variant so retries cannot create a second plan.
export async function createSubscription(repository,input,{suggestionId}={}) {
 const validated=subscription.parse(input);
 if(!suggestionId)return repository.create('subscriptions',validated);
 const id=await repository.reviewSuggestion(suggestionId,'confirm');
 return repository.get('subscriptions',id);
}
