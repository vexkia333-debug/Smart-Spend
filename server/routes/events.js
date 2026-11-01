import { Router } from 'express';
import { handleSseConnection } from '../services/sse.js';

const router = Router();

// SSE Endpoint cho Web Dashboard
router.get('/', handleSseConnection);

export default router;
