// Metadata is cheap; two sequential generation calls need a larger, finite budget.
// Keep the outer assistant deadline above the provider budget so it can sanitize
// errors, and keep browser deadlines above both (frontend/src/utils/aiTimeouts.js).
export const AI_TIMEOUTS = Object.freeze({
  metadataMs: 10_000,
  generationRequestMs: 30_000,
  providerTotalMs: 70_000,
  assistantTotalMs: 75_000,
});
