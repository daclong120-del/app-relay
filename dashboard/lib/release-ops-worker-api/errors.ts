// Release Ops Worker API Standard Error Response Helpers

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
}

export class WorkerApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'WorkerApiError';
  }
}

export function formatErrorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId: string,
  details?: unknown
): { status: number; body: ApiErrorResponse } {
  return {
    status: statusCode,
    body: {
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
      requestId,
    },
  };
}

export function badRequest(message: string, requestId: string, details?: unknown) {
  return formatErrorResponse(400, 'BAD_REQUEST', message, requestId, details);
}

export function unauthorized(message: string, requestId: string) {
  return formatErrorResponse(401, 'UNAUTHORIZED', message, requestId);
}

export function forbidden(message: string, requestId: string) {
  return formatErrorResponse(403, 'FORBIDDEN', message, requestId);
}

export function notFound(message: string, requestId: string) {
  return formatErrorResponse(404, 'NOT_FOUND', message, requestId);
}

export function conflict(message: string, requestId: string) {
  return formatErrorResponse(409, 'CONFLICT', message, requestId);
}

export function unprocessable(message: string, requestId: string, details?: unknown) {
  return formatErrorResponse(422, 'UNPROCESSABLE_ENTITY', message, requestId, details);
}

export function internalServerError(message: string, requestId: string) {
  return formatErrorResponse(500, 'INTERNAL_SERVER_ERROR', message, requestId);
}
