import { createFinancialAssistant } from '../ai/financialAssistant.js';
import { aiError } from '../ai/aiSafety.js';
import { DEMO_OWNER_ID, DEMO_AS_OF, DEMO_DATASET, createDemoRepository, demoFinancialSummary, demoSavingsScenarios } from './demoDataset.js';

export function createDemoAssistant(provider) {
  // Same provider, context and validation pipeline as accounts; only the read-only
  // fixture adapter and process-local rate limit replace account persistence.
  const repository = createDemoRepository();
  const assistant = createFinancialAssistant(provider, {
    asOf: DEMO_AS_OF,
    reserveRequest: async () => {},
  });
  return {
    async ask(question) {
      const context = await assistant.buildContext(repository, { question });
      const data = {
        mode: 'synthetic_demo', synthetic: true, label: 'Synthetic Demo Data',
        dataset: DEMO_DATASET,
        context: {
          asOf: context.asOf, facts: context.facts,
          recommendations: context.recommendations, warnings: context.warnings,
          summary: demoFinancialSummary(), scenarios: demoSavingsScenarios(),
        },
        ai: { provider: 'gemini', generated: false },
      };
      try {
        const { response } = await assistant.explain(repository, DEMO_OWNER_ID, { question });
        return { ...data, response, ai: { provider: 'gemini', generated: true } };
      } catch (error) {
        const safe = aiError(error);
        safe.demoData = data;
        throw safe;
      }
    },
  };
}
