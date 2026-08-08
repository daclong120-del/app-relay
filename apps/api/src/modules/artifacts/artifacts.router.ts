import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { supabase } from '../../database/supabase.js';
import { verifyDownloadUrlSignature } from '../../utils/signature.js';

const router = Router();
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(process.cwd(), 'artifacts');

// GET /v1/artifacts/:artifactId/download
// No Bearer token: the URL itself carries an expiring HMAC signature issued by
// POST /v1/jobs/:jobId/artifact/download-url.
router.get('/:artifactId/download', async (req: Request, res: Response) => {
  try {
    const { artifactId } = req.params;
    const expires = parseInt(String(req.query.expires ?? ''), 10);
    const signature = String(req.query.signature ?? '');

    if (!Number.isFinite(expires) || !signature) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Query parameters `expires` and `signature` are required' },
      });
    }

    if (!verifyDownloadUrlSignature(artifactId, expires, signature)) {
      return res.status(403).json({
        error: { code: 'INVALID_SIGNATURE', message: 'Download link is invalid or has expired' },
      });
    }

    const { data: artifact } = await supabase.from('artifacts').select('*').eq('id', artifactId).maybeSingle();

    if (!artifact) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Artifact not found' } });
    }

    if (artifact.state !== 'available' || !artifact.locator) {
      return res.status(410).json({
        error: { code: 'ARTIFACT_GONE', message: `Artifact is '${artifact.state}' and no longer downloadable` },
      });
    }

    // `locator` comes from the database, so resolve it and confirm it still points
    // inside ARTIFACT_DIR before opening — a tampered row must not read arbitrary files.
    const filePath = path.resolve(ARTIFACT_DIR, artifact.locator);
    const artifactRoot = path.resolve(ARTIFACT_DIR);
    if (filePath !== artifactRoot && !filePath.startsWith(artifactRoot + path.sep)) {
      return res.status(403).json({ error: { code: 'INVALID_LOCATOR', message: 'Artifact locator is out of bounds' } });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(410).json({
        error: { code: 'ARTIFACT_GONE', message: 'Artifact file is no longer present on this server' },
      });
    }

    const stat = await fs.promises.stat(filePath);

    res.setHeader('Content-Type', artifact.content_type || 'application/zip');
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(artifact.file_name || 'bundle.zip')}"`);
    if (artifact.sha256) {
      res.setHeader('X-Content-SHA256', artifact.sha256);
    }

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      // Headers are already sent by the time a read fails mid-stream, so the only
      // honest signal left is tearing down the connection.
      res.destroy();
    });
    stream.pipe(res);
  } catch (err: any) {
    if (res.headersSent) {
      return res.destroy();
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

export default router;
