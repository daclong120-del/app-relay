import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

// Public modules (/v1)
import healthRouter from './modules/health/health.router.js';
import systemRouter from './modules/system/system.router.js';
import appsRouter from './modules/apps/apps.router.js';
import jobsRouter from './modules/jobs/jobs.router.js';
import artifactsRouter from './modules/artifacts/artifacts.router.js';

// Internal worker modules (/internal/v1)
import internalWorkersRouter from './internal/workers/workers.router.js';
import internalJobsRouter from './internal/jobs/jobs.router.js';

const app = express();

app.set('trust proxy', 1);

app.use(cors());

app.use(express.json({ limit: '10mb' }));

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(process.cwd(), 'artifacts');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

// ── Public Routes (/v1) ────────────────────────────────────────────────
app.use('/v1/health', healthRouter);
app.use('/v1/system/status', systemRouter);
app.use('/v1/apps', appsRouter);
app.use('/v1/jobs', jobsRouter);
app.use('/v1/artifacts', artifactsRouter);

// ── Internal Worker Routes (/internal/v1) ─────────────────────────────
app.use('/internal/v1/workers', internalWorkersRouter);
app.use('/internal/v1/jobs', internalJobsRouter);

export default app;
