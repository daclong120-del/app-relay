// Central Worker API Gateway Router & Dispatcher

import { randomUUID } from 'crypto';
import {
  badRequest,
  forbidden,
  formatErrorResponse,
  internalServerError,
  notFound,
  unauthorized,
  unprocessable,
} from './errors';
import { authenticateWorkerToken } from './guards/token.guard';
import { handleUploadComplete, handleUploadInit } from './handlers/artifacts';
import {
  handleAppendJobEvent,
  handleClaimJob,
  handleFailJob,
  handleJobHeartbeat,
  handleStartJob,
  handleSucceedJob,
} from './handlers/jobs';
import { handleRegisterWorker, handleWorkerHeartbeat } from './handlers/workers';
import { WORKER_SCOPES, WorkerApiScope } from './scopes';

export interface WorkerApiResponse {
  status: number;
  body: any;
}

export class WorkerApiRouter {
  constructor(private db: any) {}

  async dispatch(
    method: string,
    pathSegments: string[],
    headers: Record<string, string | null>,
    body: any
  ): Promise<WorkerApiResponse> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (method.toUpperCase() !== 'POST') {
      return formatErrorResponse(405, 'METHOD_NOT_ALLOWED', `Method ${method} not allowed on worker API.`, requestId);
    }

    const authHeader = headers['authorization'] || headers['Authorization'] || null;

    // Match route and determine required scope & handler
    const pathStr = pathSegments.join('/');

    let requiredScope: WorkerApiScope;
    let handler: (db: any, jobIdOrBody: any, bodyExtra?: any) => Promise<any>;

    if (pathStr === 'workers/register') {
      requiredScope = WORKER_SCOPES.WORKER_REGISTER;
      handler = (db, body) => handleRegisterWorker(db, body);
    } else if (pathStr === 'workers/heartbeat') {
      requiredScope = WORKER_SCOPES.WORKER_HEARTBEAT;
      handler = (db, body) => handleWorkerHeartbeat(db, body);
    } else if (pathStr === 'jobs/claim') {
      requiredScope = WORKER_SCOPES.JOB_CLAIM;
      handler = (db, body) => handleClaimJob(db, body);
    } else if (pathSegments.length === 3 && pathSegments[0] === 'jobs' && pathSegments[2] === 'start') {
      const jobId = pathSegments[1];
      requiredScope = WORKER_SCOPES.JOB_HEARTBEAT;
      handler = (db, body) => handleStartJob(db, jobId, body);
    } else if (pathSegments.length === 3 && pathSegments[0] === 'jobs' && pathSegments[2] === 'heartbeat') {
      const jobId = pathSegments[1];
      requiredScope = WORKER_SCOPES.JOB_HEARTBEAT;
      handler = (db, body) => handleJobHeartbeat(db, jobId, body);
    } else if (pathSegments.length === 3 && pathSegments[0] === 'jobs' && pathSegments[2] === 'events') {
      const jobId = pathSegments[1];
      requiredScope = WORKER_SCOPES.JOB_EVENT;
      handler = (db, body) => handleAppendJobEvent(db, jobId, body);
    } else if (pathSegments.length === 4 && pathSegments[0] === 'jobs' && pathSegments[2] === 'artifacts' && pathSegments[3] === 'upload-init') {
      const jobId = pathSegments[1];
      requiredScope = WORKER_SCOPES.ARTIFACT_WRITE;
      handler = (db, body) => handleUploadInit(db, jobId, body);
    } else if (pathSegments.length === 4 && pathSegments[0] === 'jobs' && pathSegments[2] === 'artifacts' && pathSegments[3] === 'upload-complete') {
      const jobId = pathSegments[1];
      requiredScope = WORKER_SCOPES.ARTIFACT_WRITE;
      handler = (db, body) => handleUploadComplete(db, jobId, body);
    } else if (pathSegments.length === 3 && pathSegments[0] === 'jobs' && pathSegments[2] === 'succeed') {
      const jobId = pathSegments[1];
      requiredScope = WORKER_SCOPES.JOB_COMPLETE;
      handler = (db, body) => handleSucceedJob(db, jobId, body);
    } else if (pathSegments.length === 3 && pathSegments[0] === 'jobs' && pathSegments[2] === 'fail') {
      const jobId = pathSegments[1];
      requiredScope = WORKER_SCOPES.JOB_COMPLETE;
      handler = (db, body) => handleFailJob(db, jobId, body);
    } else {
      return notFound(`Worker API endpoint NOT_FOUND: /${pathStr}`, requestId);
    }

    // 1. Authenticate Token & Check Scope
    const authResult = await authenticateWorkerToken(authHeader, requiredScope, this.db);
    if (!authResult.success) {
      return authResult.status === 403
        ? forbidden(authResult.message, requestId)
        : unauthorized(authResult.message, requestId);
    }

    // 2. Dispatch Handler
    try {
      const data = await handler(this.db, body);
      return {
        status: 200,
        body: {
          ...data,
          requestId,
        },
      };
    } catch (err: any) {
      const message = err?.message || 'An error occurred processing the request.';

      if (message.startsWith('NOT_FOUND:')) {
        return notFound(message.replace('NOT_FOUND:', '').trim(), requestId);
      }
      if (message.startsWith('FORBIDDEN:')) {
        return forbidden(message.replace('FORBIDDEN:', '').trim(), requestId);
      }
      if (message.startsWith('UNPROCESSABLE_ENTITY:')) {
        return unprocessable(message.replace('UNPROCESSABLE_ENTITY:', '').trim(), requestId);
      }
      if (message.includes('required') || message.includes('invalid') || message.includes('must be')) {
        return badRequest(message, requestId);
      }

      return internalServerError(message, requestId);
    }
  }
}
