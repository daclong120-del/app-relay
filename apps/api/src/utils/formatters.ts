export function formatAppResponse(app: any) {
  if (!app) return null;
  return {
    packageId: app.package_id,
    playUrl: app.play_url,
    title: app.title || null,
    developer: app.developer || null,
    versionName: app.version_name || null,
    versionCode: app.version_code ? Number(app.version_code) : null,
    rating: app.rating ? Number(app.rating) : null,
    installsText: app.installs_text || null,
    description: app.description || null,
    listingMetadata: app.listing_metadata || {},
    screenshotCount: app.screenshot_count ?? 0,
    splitCount: app.split_count ?? 0,
    baseApkSizeBytes: app.base_apk_size_bytes ? Number(app.base_apk_size_bytes) : null,
    artifactSizeBytes: app.artifact_size_bytes ? Number(app.artifact_size_bytes) : null,
    lastSuccessfulJobId: app.last_successful_job_id || null,
    firstSeenAt: app.first_seen_at || null,
    lastPulledAt: app.last_pulled_at || null,
    updatedAt: app.updated_at || null,
  };
}

export function formatJobResponse(job: any) {
  if (!job) return null;
  // Exclude internal database fields like locator or internal storage paths
  return {
    jobId: job.id,
    batchId: job.batch_id || null,
    packageId: job.package_id,
    playUrl: job.play_url,
    includeListing: job.include_listing ?? true,
    includeScreenshots: job.include_screenshots ?? true,
    options: job.options || {},
    status: job.status,
    progress: job.progress ?? 0,
    currentStep: job.current_step || null,
    errorCode: job.error_code || null,
    errorMessage: job.error_message || null,
    errorRetryable: job.error_retryable ?? null,
    attemptCount: job.attempt_count ?? 0,
    createdAt: job.created_at,
    queuedAt: job.queued_at || job.created_at,
    startedAt: job.started_at || null,
    completedAt: job.completed_at || null,
    updatedAt: job.updated_at || null,
    cancelRequestedAt: job.cancel_requested_at || null,
    cancelReason: job.cancel_reason || null,
    resultSummary: job.result_summary || null,
  };
}

export function formatArtifactResponse(artifact: any) {
  if (!artifact) return null;
  // Strictly exclude internal secret/system fields: locator, storage_backend
  return {
    artifactId: artifact.id,
    jobId: artifact.job_id,
    kind: artifact.kind,
    state: artifact.state,
    fileName: artifact.file_name,
    contentType: artifact.content_type,
    sizeBytes: artifact.size_bytes ? Number(artifact.size_bytes) : 0,
    sha256: artifact.sha256 || null,
    expiresAt: artifact.expires_at || null,
    createdAt: artifact.created_at,
    updatedAt: artifact.updated_at,
  };
}

export function formatJobEventResponse(event: any) {
  if (!event) return null;
  return {
    id: event.id,
    jobId: event.job_id,
    eventType: event.event_type,
    level: event.level || 'info',
    message: event.message,
    data: event.data || {},
    createdAt: event.created_at,
  };
}

export function formatEventResponse(event: any) {
  return formatJobEventResponse(event);
}

