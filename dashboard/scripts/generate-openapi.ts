import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';
import yaml from 'yaml';
import {
  registry,
  OverviewResponseSchema,
  JobListResponseSchema,
  JobResponseSchema,
  CreateJobRequestSchema,
  EventListResponseSchema,
  ActionReasonRequestSchema,
  DownloadUrlResponseSchema,
  ArtifactDeleteResponseSchema,
  WorkerListResponseSchema,
  WorkerResponseSchema,
} from '../lib/schemas/app-relay-api.schemas';

// Common Parameters
const PageParam = registry.registerParameter(
  'Page',
  z.number().int().min(1).default(1).openapi({
    param: { name: 'page', in: 'query', description: 'One-based page number.' },
  })
);

const PageSizeParam = registry.registerParameter(
  'PageSize',
  z.number().int().min(1).max(100).default(25).openapi({
    param: { name: 'pageSize', in: 'query', description: 'Number of resources per page.' },
  })
);

const SearchParam = registry.registerParameter(
  'Search',
  z.string().min(1).max(200).optional().openapi({
    param: { name: 'search', in: 'query', description: 'Case-insensitive search by package ID or job ID.' },
  })
);

const JobIdPath = registry.registerParameter(
  'JobId',
  z.string().uuid().openapi({
    param: { name: 'jobId', in: 'path', description: 'AppRelay job UUID.' },
  })
);

const WorkerIdPath = registry.registerParameter(
  'WorkerIdPath',
  z.string().uuid().openapi({
    param: { name: 'workerId', in: 'path', description: 'Registered worker UUID.' },
  })
);

// Register Paths

// 1. GET /overview
registry.registerPath({
  method: 'get',
  path: '/overview',
  tags: ['Overview'],
  summary: 'Get AppRelay operational summary',
  description: 'Returns compact metrics for the AppRelay overview page.',
  responses: {
    200: {
      description: 'Operational summary',
      content: {
        'application/json': {
          schema: OverviewResponseSchema,
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden' },
    500: { description: 'Internal Server Error' },
  },
});

// 2. GET /jobs
registry.registerPath({
  method: 'get',
  path: '/jobs',
  tags: ['Jobs'],
  summary: 'List AppRelay jobs',
  description: 'Returns paginated pull_apk jobs.',
  request: {
    query: z.object({
      page: z.number().optional(),
      pageSize: z.number().optional(),
      search: z.string().optional(),
    }),
  },
  responses: {
    200: {
      description: 'Paginated jobs',
      content: {
        'application/json': {
          schema: JobListResponseSchema,
        },
      },
    },
    400: { description: 'Bad Request' },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden' },
    500: { description: 'Internal Server Error' },
  },
});

// 3. POST /jobs
registry.registerPath({
  method: 'post',
  path: '/jobs',
  tags: ['Jobs'],
  summary: 'Create an APK acquisition job',
  description: 'Validates Google Play details URL and creates a pull_apk job.',
  security: [{ supabaseBearer: [], csrfToken: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateJobRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: 'Job accepted and queued',
      content: {
        'application/json': {
          schema: JobResponseSchema,
        },
      },
    },
    400: { description: 'Bad Request' },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden' },
    409: { description: 'Conflict' },
    422: { description: 'Unprocessable Entity' },
  },
});

// 4. GET /jobs/{jobId}
registry.registerPath({
  method: 'get',
  path: '/jobs/{jobId}',
  tags: ['Jobs'],
  summary: 'Get complete AppRelay job detail',
  description: 'Returns the job read model plus its assigned worker, artifact, and events.',
  request: {
    params: z.object({ jobId: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Complete job detail',
      content: {
        'application/json': {
          schema: JobResponseSchema,
        },
      },
    },
    404: { description: 'Not Found' },
    500: { description: 'Internal Server Error' },
  },
});

// 5. GET /jobs/{jobId}/events
registry.registerPath({
  method: 'get',
  path: '/jobs/{jobId}/events',
  tags: ['Events'],
  summary: 'List append-only events for a job',
  description: 'Cursor-paginated timeline endpoint for a job.',
  request: {
    params: z.object({ jobId: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Event page',
      content: {
        'application/json': {
          schema: EventListResponseSchema,
        },
      },
    },
    404: { description: 'Not Found' },
    500: { description: 'Internal Server Error' },
  },
});

// 6. POST /jobs/{jobId}/cancel
registry.registerPath({
  method: 'post',
  path: '/jobs/{jobId}/cancel',
  tags: ['Jobs'],
  summary: 'Cancel or request cancellation of a job',
  security: [{ supabaseBearer: [], csrfToken: [] }],
  request: {
    params: z.object({ jobId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: ActionReasonRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: 'Cancellation applied or requested',
      content: {
        'application/json': {
          schema: JobResponseSchema,
        },
      },
    },
    400: { description: 'Bad Request' },
    404: { description: 'Not Found' },
    409: { description: 'Conflict' },
  },
});

// 7. POST /jobs/{jobId}/retry
registry.registerPath({
  method: 'post',
  path: '/jobs/{jobId}/retry',
  tags: ['Jobs'],
  summary: 'Retry an eligible failed job',
  security: [{ supabaseBearer: [], csrfToken: [] }],
  request: {
    params: z.object({ jobId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: ActionReasonRequestSchema,
        },
      },
    },
  },
  responses: {
    202: {
      description: 'Retry accepted',
      content: {
        'application/json': {
          schema: JobResponseSchema,
        },
      },
    },
    400: { description: 'Bad Request' },
    404: { description: 'Not Found' },
    409: { description: 'Conflict' },
  },
});

// 8. POST /jobs/{jobId}/artifact/download-url
registry.registerPath({
  method: 'post',
  path: '/jobs/{jobId}/artifact/download-url',
  tags: ['Artifacts'],
  summary: 'Create a short-lived artifact download URL',
  request: {
    params: z.object({ jobId: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Signed download handoff',
      content: {
        'application/json': {
          schema: DownloadUrlResponseSchema,
        },
      },
    },
    404: { description: 'Not Found' },
    410: { description: 'Gone' },
  },
});

// 9. DELETE /jobs/{jobId}/artifact
registry.registerPath({
  method: 'delete',
  path: '/jobs/{jobId}/artifact',
  tags: ['Artifacts'],
  summary: 'Delete the durable artifact',
  security: [{ supabaseBearer: [], csrfToken: [] }],
  request: {
    params: z.object({ jobId: z.string().uuid() }),
    body: {
      content: {
        'application/json': {
          schema: ActionReasonRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Artifact deleted',
      content: {
        'application/json': {
          schema: ArtifactDeleteResponseSchema,
        },
      },
    },
    404: { description: 'Not Found' },
  },
});

// 10. GET /workers
registry.registerPath({
  method: 'get',
  path: '/workers',
  tags: ['Workers'],
  summary: 'List AppRelay-capable workers',
  responses: {
    200: {
      description: 'Paginated AppRelay workers',
      content: {
        'application/json': {
          schema: WorkerListResponseSchema,
        },
      },
    },
    500: { description: 'Internal Server Error' },
  },
});

// 11. GET /workers/{workerId}
registry.registerPath({
  method: 'get',
  path: '/workers/{workerId}',
  tags: ['Workers'],
  summary: 'Get worker and device readiness detail',
  request: {
    params: z.object({ workerId: z.string().uuid() }),
  },
  responses: {
    200: {
      description: 'Worker detail',
      content: {
        'application/json': {
          schema: WorkerResponseSchema,
        },
      },
    },
    404: { description: 'Not Found' },
  },
});

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      version: '1.0.0',
      title: 'AppRelay Frontend API (Auto-Generated from TypeScript)',
      description:
        'REST contract between the SinoMedia main frontend and the AppRelay control plane. Generated code-first from Zod schemas.',
      contact: {
        name: 'SinoMedia Release Ops',
      },
      license: {
        name: 'Proprietary',
      },
    },
    servers: [{ url: '/api/app-relay/v1', description: 'Same-origin AppRelay frontend API for dual dashboards' }],
  });
}

function main() {
  const doc = generateOpenApiDocument();
  const yamlString = yaml.stringify(doc);

  const outputPath = path.resolve(__dirname, '../../docs/04-detailed-design/cdd-lld/api-spec/openapi.yaml');
  fs.writeFileSync(outputPath, yamlString, 'utf8');

  console.log(`✅ Successfully generated OpenAPI 3.1.0 document from TypeScript to: ${outputPath}`);
}

main();
