// Feature Flags Evaluator for Rollout & Gradual Feature Releases

export interface FeatureFlagsConfig {
  enableAppRelay: boolean;
  enableWorkerJobClaim: boolean;
  enableRealtimeSubscriptions: boolean;
}

export function evaluateFeatureFlags(env = process.env): FeatureFlagsConfig {
  const parseBool = (val: string | undefined, defaultValue: boolean): boolean => {
    if (val === undefined || val === '') return defaultValue;
    return val.toLowerCase() === 'true' || val === '1';
  };

  return {
    enableAppRelay: parseBool(env.NEXT_PUBLIC_ENABLE_APP_RELAY || env.ENABLE_APP_RELAY, true),
    enableWorkerJobClaim: parseBool(env.ENABLE_WORKER_JOB_CLAIM, true),
    enableRealtimeSubscriptions: parseBool(env.ENABLE_REALTIME_SUBSCRIPTIONS, true),
  };
}

export function isAppRelayEnabled(env = process.env): boolean {
  return evaluateFeatureFlags(env).enableAppRelay;
}

export function isWorkerClaimAllowed(env = process.env): boolean {
  return evaluateFeatureFlags(env).enableWorkerJobClaim;
}

export function isRealtimeEnabled(env = process.env): boolean {
  return evaluateFeatureFlags(env).enableRealtimeSubscriptions;
}
