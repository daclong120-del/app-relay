import { Router, Request, Response } from 'express';
import { WorkerHeartbeatRequestSchema } from '@app-relay/contracts';
import { supabase } from '../../database/supabase.js';
import { requireWorkerAuth } from '../../middleware/auth.js';

const router = Router();

// POST /internal/v1/workers/heartbeat
router.post('/heartbeat', requireWorkerAuth, async (req: Request, res: Response) => {
  try {
    const body = WorkerHeartbeatRequestSchema.parse(req.body);

    const { error } = await supabase.from('workers').upsert([
      {
        id: body.workerId,
        name: body.name || body.workerId,
        version: body.version || '1.0.0',
        capabilities: body.capabilities,
        stats: body.stats,
        last_heartbeat_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    if (error) throw error;
    res.json({ status: 'ok' });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

export default router;
