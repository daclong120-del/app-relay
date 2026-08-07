import { Router, Request, Response } from 'express';
import { supabase } from '../../database/supabase.js';
import { requirePublicAuth } from '../../middleware/auth.js';

const router = Router();

// GET /v1/system/status
router.get('/', requirePublicAuth, async (_req: Request, res: Response) => {
  try {
    const { error: dbErr } = await supabase.from('jobs').select('id', { head: true }).limit(1);
    const dbStatus = dbErr ? 'error' : 'ok';

    const { count: queuedCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'queued');
    const { count: runningCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'running');
    const { count: failedCount } = await supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'failed');

    const { data: workers } = await supabase.from('workers').select('id, status, last_heartbeat_at');
    const now = Date.now();
    const cutoff = now - 60000;

    let onlineCount = 0;
    let busyCount = 0;
    let offlineCount = 0;

    if (workers) {
      for (const w of workers) {
        const lastHb = w.last_heartbeat_at ? new Date(w.last_heartbeat_at).getTime() : 0;
        if (lastHb < cutoff) {
          offlineCount++;
        } else if (w.status === 'busy') {
          busyCount++;
        } else {
          onlineCount++;
        }
      }
    }

    res.json({
      data: {
        database: dbStatus,
        jobs: {
          queued: queuedCount || 0,
          running: runningCount || 0,
          failed: failedCount || 0,
        },
        workers: {
          online: onlineCount,
          busy: busyCount,
          offline: offlineCount,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

export default router;
