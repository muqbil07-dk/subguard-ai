// Synthetic in-memory adapters for bounded loopback HTTP tests only.
// These emulate owner scoping and atomic turn insertion, not PostgreSQL locking.
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../../src/app.js';
import { createFinancialAssistant } from '../../src/services/ai/financialAssistant.js';
import { narratives } from '../../src/services/ai/narratives.js';
import { ApiError } from '../../src/utils/errors.js';

export function createConcurrencyFixture({ providerDelayMs = 40 } = {}) {
  const owners = new Map(['a', 'b'].map(owner => [owner, {
    conversations: [], messages: [],
    plans: [{ id: `${owner}-plan`, name: `Synthetic ${owner} plan`, amountMinor: owner === 'a' ? '79900' : '129900', currency: 'INR', frequency: 'Monthly', category: 'Tools', status: 'Active', unused: false, nextRenewal: '2026-11-12' }],
    transactions: [{ id: `${owner}-transaction`, merchant: `Synthetic ${owner} plan`, amountMinor: owner === 'a' ? '200' : '300', currency: 'INR', category: 'Tools', date: '2026-11-01', status: 'Completed', direction: 'debit' }],
  }]));
  let generations = 0, sequence = 0, activeGenerations = 0, maxActiveGenerations = 0;
  const provider = {
    enabled: true,
    async generate({ context, signal }) {
      generations++; activeGenerations++;
      maxActiveGenerations = Math.max(maxActiveGenerations, activeGenerations);
      try {
        await delay(providerDelayMs, undefined, { signal });
        return {
          allowedFactIds: context.facts.map(fact => fact.id),
          text: JSON.stringify({ answer: narratives[0], summary: narratives[1], keyFacts: context.facts.filter(fact => fact.kind === 'monthly_estimate').map(fact => fact.id), recommendations: [], evidence: context.facts.filter(fact => fact.kind === 'monthly_estimate').map(fact => fact.id), warnings: [], confidence: 'grounded' }),
        };
      } finally { activeGenerations--; }
    },
  };
  const authenticate = async token => {
    const owner = token === 'fixture-a' ? 'a' : token === 'fixture-b' ? 'b' : null;
    if (!owner) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired fixture session.');
    const state = owners.get(owner);
    const repository = {
      async all(table) {
        await delay(2);
        return structuredClone(table === 'subscriptions' ? state.plans : table === 'transactions' ? state.transactions : []);
      },
      async aiCreateConversation(title) {
        const conversation = { id: randomUUID(), user_id: owner, title };
        state.conversations.push(conversation);
        return { ...conversation };
      },
      async aiConversation(id) {
        const conversation = state.conversations.find(value => value.id === id);
        if (!conversation) throw new ApiError(404, 'NOT_FOUND', 'Conversation not found.');
        return { ...conversation };
      },
      async aiMessages(id, { page, limit }) {
        await this.aiConversation(id);
        const messages = state.messages.filter(message => message.conversation_id === id).sort((a, b) => b.sequence - a.sequence);
        return { rows: structuredClone(messages.slice((page - 1) * limit, page * limit).reverse()), total: messages.length, page, limit };
      },
      async aiTurn(id, requestId) {
        await this.aiConversation(id);
        return structuredClone(state.messages.filter(message => message.conversation_id === id && message.turn_id === requestId));
      },
      async aiAppendTurn(id, message, response, requestId) {
        await this.aiConversation(id);
        // A small asynchronous delay permits HTTP races. The following synchronous
        // check/insert models an atomic database boundary, without claiming SQL locks.
        await delay(2);
        const existing = state.messages.find(value => value.conversation_id === id && value.turn_id === requestId);
        if (existing) {
          if (existing.content !== message) throw new ApiError(409, 'CONFLICT', 'Fixture request key mismatch.');
          return;
        }
        state.messages.push(
          { id: randomUUID(), user_id: owner, conversation_id: id, turn_id: requestId, role: 'user', content: message, sequence: ++sequence },
          { id: randomUUID(), user_id: owner, conversation_id: id, turn_id: requestId, role: 'assistant', content: response.answer, structured_response: structuredClone(response), sequence: ++sequence },
        );
      },
      async aiDeleteConversation(id) {
        await this.aiConversation(id);
        state.conversations = state.conversations.filter(value => value.id !== id);
        state.messages = state.messages.filter(value => value.conversation_id !== id);
      },
      async reserveAiRequest() {}, // paid-attempt quotas are covered by SQL tests, not this adapter
    };
    return { user: { id: owner }, repository };
  };
  const app = createApp({ authenticate, assistant: createFinancialAssistant(provider, { now: () => '2026-11-10T12:00:00Z' }), clock: () => '2026-11-10', rateLimitMax: 120, aiOptions: { limit: 120 } });
  return { app, owners, stats: () => ({ generations, maxActiveGenerations }) };
}
