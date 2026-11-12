import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { ApiError } from '../utils/errors.js';
import { redactInput } from '../services/ai/aiSafety.js';

const questionSchema = z.strictObject({ message: z.string().trim().min(3).max(1000) });
export function demoRouter(assistant, { limit = 5, globalLimit = 50, concurrency = 2 } = {}) {
  const router = Router();
  let day, used = 0, inFlight = 0;
  router.use(rateLimit({
    windowMs: 60000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { code: 'AI_RATE_LIMITED', message: 'Demo request limit reached. Try again later.', requestId: req.requestId } }),
  }));
  router.post('/', async (req, res) => {
    const input = questionSchema.parse(req.body);
    const message = redactInput(input.message);
    if (message.length < 3) throw new ApiError(400, 'VALIDATION_ERROR', 'Enter a question with at least three characters.');
    const today = new Date().toISOString().slice(0, 10);
    if (day !== today) { day = today; used = 0; }
    if (used >= globalLimit || inFlight >= concurrency) {
      res.set('Retry-After', '60');
      throw new ApiError(429, 'AI_RATE_LIMITED', 'Demo capacity reached. Try again later.');
    }
    used++; inFlight++;
    try {
      res.json({ data: await assistant.ask(message) });
    } catch (error) {
      if (!error.demoData) throw error;
      res.status(error.status).json({
        error: { code: error.code, message: error.message, requestId: req.requestId },
        data: error.demoData,
      });
    } finally { inFlight--; }
  });
  return router;
}
