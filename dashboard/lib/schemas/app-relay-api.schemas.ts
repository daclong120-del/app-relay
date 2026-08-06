import { z } from 'zod';
import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Security Schemes
registry.registerComponent('securitySchemes', 'supabaseBearer', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Supabase access token for an authenticated admin.',
});

registry.registerComponent('securitySchemes', 'csrfToken', {
  type: 'apiKey',
  in: 'header',
  name: 'X-CSRF-Token',
  description: 'Required for user-triggered state-changing operations.',
});

// Domain Schemas
export const JobStatusSchema = registry.register(
  'JobStatus',
  z.enum([
    'queued',
    'claimed',
    'running',
    'succeeded',
    'failed',
    'retrying',
    'dead_letter',
    'cancelled',
    'expired',
  ]).openapi({ description: 'Current status of the AppRelay job.' })
);

export const JobStageSchema = registry.register(
  'JobStage',
  z.enum([
    'validate_url',
    'acquire_listing',
    'pull_apk',
    'verify_apk',
    'upload_storage',
    'complete',
  ]).openapi({ description: 'AppRelay execution pipeline stage.' })
);

export const WorkerStatusSchema = registry.register(
  'WorkerStatus',
  z.enum(['online', 'busy', 'offline', 'degraded']).openapi({ description: 'Worker operational status.' })
);

export const DeviceProfileSchema = registry.register(
  'AppRelayDeviceProfile',
  z.object({
    sdk: z.number().int().openapi({ example: 34 }),
    abi: z.string().openapi({ example: 'arm64-v8a' }),
    density: z.number().int().openapi({ example: 480 }),
    locale: z.string().openapi({ example: 'en_US' }),
  })
);

export const CreateJobRequestSchema = registry.register(
  'CreateJobRequest',
  z.object({
    playUrl: z.string().url().openapi({
      description: 'Official Google Play details URL.',
      example: 'https://play.google.com/store/apps/details?id=com.example.app&hl=en',
    }),
    locale: z.string().optional().openapi({ example: 'en' }),
    includeListing: z.boolean().default(true).openapi({ example: true }),
    includeScreenshots: z.boolean().default(true).openapi({ example: true }),
  })
);

export const ActionReasonRequestSchema = registry.register(
  'ActionReasonRequest',
  z.object({
    reason: z.string().max(500).optional().openapi({ description: 'Optional user-provided cancellation or retry reason.' }),
  })
);

export const AppRelayJobSchema = registry.register(
  'Job',
  z.object({
    id: z.string().uuid().openapi({ example: '8b6bbfd8-62da-4c36-a49b-4e99f778f587' }),
    jobType: z.literal('pull_apk').openapi({ example: 'pull_apk' }),
    status: JobStatusSchema,
    priority: z.number().int().openapi({ example: 100 }),
    releaseId: z.string().uuid().nullable().optional(),
    appId: z.string().nullable().optional(),
    packageId: z.string().openapi({ example: 'com.example.app' }),
    workerId: z.string().uuid().nullable().optional(),
    attemptCount: z.number().int().openapi({ example: 1 }),
    maxAttempts: z.number().int().openapi({ example: 3 }),
    errorMessage: z.string().nullable().optional(),
    createdBy: z.string().uuid().nullable().optional(),
    createdAt: z.string().datetime().openapi({ example: '2026-08-06T09:00:00Z' }),
    updatedAt: z.string().datetime().openapi({ example: '2026-08-06T09:05:00Z' }),
  })
);

export const AppRelayEventSchema = registry.register(
  'JobEvent',
  z.object({
    id: z.string().uuid(),
    jobId: z.string().uuid(),
    level: z.enum(['info', 'warn', 'error']),
    stage: JobStageSchema,
    message: z.string(),
    progress: z.number().min(0).max(100),
    metadata: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().datetime(),
  })
);

export const AppRelayArtifactSchema = registry.register(
  'Artifact',
  z.object({
    id: z.string().uuid(),
    jobId: z.string().uuid(),
    fileName: z.string(),
    checksum: z.string().nullable().optional(),
    storagePath: z.string(),
    artifactType: z.string(),
    contentType: z.string(),
    sizeBytes: z.number().int(),
    expiresAt: z.string().datetime().nullable().optional(),
    deletedAt: z.string().datetime().nullable().optional(),
    createdAt: z.string().datetime(),
  })
);

export const AppRelayWorkerSchema = registry.register(
  'Worker',
  z.object({
    id: z.string().uuid(),
    workerName: z.string(),
    status: WorkerStatusSchema,
    maxParallelJobs: z.number().int(),
    lastHeartbeat: z.string().datetime().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
);

export const OverviewResponseSchema = registry.register(
  'OverviewResponse',
  z.object({
    totalJobs: z.number().int().openapi({ example: 1250 }),
    activeJobs: z.number().int().openapi({ example: 4 }),
    succeededJobs: z.number().int().openapi({ example: 1180 }),
    failedJobs: z.number().int().openapi({ example: 66 }),
    onlineWorkers: z.number().int().openapi({ example: 2 }),
  })
);

export const JobResponseSchema = registry.register(
  'JobResponse',
  z.object({
    job: AppRelayJobSchema,
  })
);

export const JobListResponseSchema = registry.register(
  'JobListResponse',
  z.object({
    data: z.array(AppRelayJobSchema),
    pagination: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      totalItems: z.number().int(),
      totalPages: z.number().int(),
    }),
  })
);

export const EventListResponseSchema = registry.register(
  'EventListResponse',
  z.object({
    data: z.array(AppRelayEventSchema),
    nextCursor: z.string().nullable().optional(),
  })
);

export const DownloadUrlResponseSchema = registry.register(
  'DownloadUrlResponse',
  z.object({
    downloadUrl: z.string().url(),
    expiresAt: z.string().datetime(),
  })
);

export const ArtifactDeleteResponseSchema = registry.register(
  'ArtifactDeleteResponse',
  z.object({
    success: z.boolean(),
    artifactId: z.string().uuid(),
  })
);

export const WorkerListResponseSchema = registry.register(
  'WorkerListResponse',
  z.object({
    data: z.array(AppRelayWorkerSchema),
    pagination: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      totalItems: z.number().int(),
      totalPages: z.number().int(),
    }),
  })
);

export const WorkerResponseSchema = registry.register(
  'WorkerResponse',
  z.object({
    worker: AppRelayWorkerSchema,
  })
);

export const ErrorResponseSchema = registry.register(
  'ErrorResponse',
  z.object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      requestId: z.string().uuid().optional(),
      retryable: z.boolean().default(false),
    }),
  })
);
