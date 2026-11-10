import { validationMain } from './staging-validation.js';
// Explicit operator opt-in is mandatory even when a real key is configured.
process.exitCode = await validationMain('gemini');
