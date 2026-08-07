import { z } from 'zod';

// ── Status Enums ──────────────────────────────────────────────────────
export const JobStatusSchema = z.enum([
  'queued',
  'running',
  'cancelling',
  'completed',
  'failed',
  'cancelled',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const StepSchema = z.enum([
  'claiming',
  'scraping_listing',
  'booting_emulator',
  'opening_play_store',
  'installing',
  'pulling_apk',
  'creating_manifest',
  'validating',
  'packaging',
  'uploading_artifact',
]);
export type CurrentStep = z.infer<typeof StepSchema>;

export const WorkerStatusSchema = z.enum(['online', 'busy', 'draining']);
export type WorkerStatus = z.infer<typeof WorkerStatusSchema>;

export const EventLevelSchema = z.enum(['debug', 'info', 'warning', 'error']);
export type EventLevel = z.infer<typeof EventLevelSchema>;

// ── Public API Schemas ────────────────────────────────────────────────
export const CreateJobRequestSchema = z.object({
  playUrl: z.string().url(),
  includeListing: z.boolean().default(true),
  includeScreenshots: z.boolean().default(true),
  options: z.record(z.unknown()).optional(),
});
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

export const CreateBatchJobRequestSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  includeListing: z.boolean().default(true),
  includeScreenshots: z.boolean().default(true),
  options: z.record(z.unknown()).optional(),
});
export type CreateBatchJobRequest = z.infer<typeof CreateBatchJobRequestSchema>;

export const JobQuerySchema = z.object({
  status: JobStatusSchema.optional(),
  batchId: z.string().uuid().optional(),
  packageId: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});
export type JobQuery = z.infer<typeof JobQuerySchema>;

export const AppQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});
export type AppQuery = z.infer<typeof AppQuerySchema>;

// ── Internal Worker Schemas ───────────────────────────────────────────
export const WorkerHeartbeatRequestSchema = z.object({
  workerId: z.string(),
  name: z.string().optional(),
  version: z.string().optional(),
  capabilities: z.record(z.unknown()).default({}),
  stats: z.record(z.unknown()).default({}),
});
export type WorkerHeartbeatRequest = z.infer<typeof WorkerHeartbeatRequestSchema>;

export const ClaimJobRequestSchema = z.object({
  workerId: z.string(),
});
export type ClaimJobRequest = z.infer<typeof ClaimJobRequestSchema>;

export const JobHeartbeatRequestSchema = z.object({
  workerId: z.string(),
  progress: z.number().min(0).max(100),
  currentStep: StepSchema.optional(),
});
export type JobHeartbeatRequest = z.infer<typeof JobHeartbeatRequestSchema>;

export const RecordEventRequestSchema = z.object({
  eventType: z.string(),
  level: EventLevelSchema.default('info'),
  message: z.string(),
  data: z.record(z.unknown()).default({}),
});
export type RecordEventRequest = z.infer<typeof RecordEventRequestSchema>;

export const CompleteJobRequestSchema = z.object({
  workerId: z.string(),
  result: z.object({
    versionName: z.string().optional(),
    versionCode: z.number().optional(),
    splitCount: z.number().optional(),
    screenshotCount: z.number().optional(),
    baseApkSizeBytes: z.number().optional(),
    title: z.string().optional(),
    developer: z.string().optional(),
    rating: z.union([z.number(), z.string()]).optional(),
    installsText: z.string().optional(),
    description: z.string().optional(),
    listingMetadata: z.record(z.unknown()).optional(),
  }),
});
export type CompleteJobRequest = z.infer<typeof CompleteJobRequestSchema>;

export const FailJobRequestSchema = z.object({
  workerId: z.string(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean().default(true),
  }),
});
export type FailJobRequest = z.infer<typeof FailJobRequestSchema>;

export const CancelledJobRequestSchema = z.object({
  workerId: z.string(),
  reason: z.string().optional(),
});
export type CancelledJobRequest = z.infer<typeof CancelledJobRequestSchema>;
