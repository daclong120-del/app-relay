import { Router, Request, Response } from 'express';
import { AppQuerySchema } from '@app-relay/contracts';
import { supabase } from '../../database/supabase.js';
import { requirePublicAuth } from '../../middleware/auth.js';
import { formatAppResponse } from '../../utils/formatters.js';
import { isValidPackageId } from '../../utils/validation.js';
import { ilikeContains } from '../../utils/postgrest.js';

const router = Router();

// GET /v1/apps
router.get('/', requirePublicAuth, async (req: Request, res: Response) => {
  try {
    const query = AppQuerySchema.parse(req.query);
    let dbQuery = supabase.from('apps').select('*', { count: 'exact' });

    if (query.search) {
      dbQuery = dbQuery.or(
        [ilikeContains('title', query.search), ilikeContains('package_id', query.search)].join(','),
      );
    }

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, count, error } = await dbQuery.range(from, to).order('last_pulled_at', { ascending: false });

    if (error) throw error;

    res.json({
      data: (data || []).map(formatAppResponse),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count || 0,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

// GET /v1/apps/:packageId
router.get('/:packageId', requirePublicAuth, async (req: Request, res: Response) => {
  try {
    const { packageId } = req.params;

    if (!isValidPackageId(packageId)) {
      return res.status(400).json({
        error: { code: 'INVALID_PACKAGE_ID', message: `Invalid package ID format: ${packageId}` },
      });
    }

    const { data, error } = await supabase.from('apps').select('*').eq('package_id', packageId).single();

    if (error || !data) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `App ${packageId} not found` } });
    }

    res.json({ data: formatAppResponse(data) });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

export default router;
