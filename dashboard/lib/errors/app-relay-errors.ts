// Domain Errors & Hierarchy for AppRelay Backend Core

export class AppRelayError extends Error {
  constructor(
    message: string,
    public readonly code: string = 'INTERNAL_ERROR',
    public readonly statusCode: number = 500,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidPlayUrlError extends AppRelayError {
  constructor(message: string = 'Invalid Google Play URL format.') {
    super(message.startsWith('INVALID_URL:') ? message : `INVALID_URL: ${message}`, 'INVALID_PLAY_URL', 400, false);
  }
}

export class JobNotFoundError extends AppRelayError {
  constructor(jobId: string) {
    super(`AppRelay job not found: ${jobId}`, 'JOB_NOT_FOUND', 404, false);
  }
}

export class JobStateConflictError extends AppRelayError {
  constructor(message: string = 'Job state conflict.') {
    super(message, 'JOB_STATE_CONFLICT', 409, false);
  }
}

export class ArtifactNotFoundError extends AppRelayError {
  constructor(jobId: string) {
    super(`No active artifact found for job: ${jobId}`, 'ARTIFACT_NOT_FOUND', 404, false);
  }
}

export class ArtifactExpiredError extends AppRelayError {
  constructor(message: string = 'Artifact download link has expired.') {
    super(message, 'ARTIFACT_EXPIRED', 410, false);
  }
}

export class UnauthorizedError extends AppRelayError {
  constructor(message: string = 'Authentication required.') {
    super(message, 'UNAUTHORIZED', 401, false);
  }
}

export class ForbiddenError extends AppRelayError {
  constructor(message: string = 'Insufficient permissions.') {
    super(message, 'FORBIDDEN', 403, false);
  }
}
