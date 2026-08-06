// Release Ops Error Retryability Classifier & Backoff Calculator

export const NON_RETRYABLE_ERROR_CODES = [
  'INVALID_URL',
  'INVALID_PACKAGE_ID',
  'APP_NOT_FOUND',
  'UNSUPPORTED_REGION',
  'PAYMENT_OR_APPROVAL_REQUIRED',
  'PLAY_LOGIN_REQUIRED',
  'APK_VALIDATION_FAILED',
  'JOB_CANCELLED',
  'LISTING_PARSE_FAILED',
];

export const RETRYABLE_ERROR_CODES = [
  'DEVICE_UNAVAILABLE',
  'EMULATOR_BOOT_TIMEOUT',
  'INSTALL_TIMEOUT',
  'STORAGE_UPLOAD_FAILED',
  'APK_PULL_FAILED',
  'DOWNLOAD_FAILED',
  'TIMEOUT',
  'INTERNAL_SERVER_ERROR',
];

export function isErrorRetryable(errorMsgOrCode: string): boolean {
  if (!errorMsgOrCode || typeof errorMsgOrCode !== 'string') return false;

  const upperStr = errorMsgOrCode.toUpperCase();

  // 1. Check non-retryable keywords first
  for (const code of NON_RETRYABLE_ERROR_CODES) {
    if (upperStr.includes(code)) {
      return false;
    }
  }

  // 2. Check retryable keywords
  for (const code of RETRYABLE_ERROR_CODES) {
    if (upperStr.includes(code)) {
      return true;
    }
  }

  // 3. Network connection failures are retryable by default
  if (
    upperStr.includes('FETCH') ||
    upperStr.includes('ECONNRESET') ||
    upperStr.includes('ETIMEDOUT') ||
    upperStr.includes('NETWORK')
  ) {
    return true;
  }

  // Default to non-retryable for safety
  return false;
}

export function getBackoffDelayMs(
  attemptCount: number,
  baseMs = 5000,
  maxMs = 300000
): number {
  const attempt = Math.max(1, attemptCount);
  const exponential = baseMs * Math.pow(2, attempt - 1);
  const capped = Math.min(maxMs, exponential);
  const jitter = Math.floor(Math.random() * 1000);
  return capped + jitter;
}
