// Reusable Mock Supabase Database Client for AppRelay API Matrix Integration Tests

export class MockApiDbClient {
  public jobs: Map<string, any> = new Map();
  public events: any[] = [];
  public artifacts: Map<string, any> = new Map();
  public workers: Map<string, any> = new Map();
  public audits: any[] = [];

  constructor() {
    this.seedInitialData();
  }

  public seedInitialData() {
    this.jobs.clear();
    this.events = [];
    this.artifacts.clear();
    this.workers.clear();
    this.audits = [];

    // Pre-populate worker
    const workerId = 'worker-uuid-101';
    this.workers.set(workerId, {
      id: workerId,
      worker_name: 'test-node-01',
      status: 'online',
      max_parallel_jobs: 2,
      last_heartbeat: new Date().toISOString(),
      metadata: { capabilities: ['pull_apk'] },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Pre-populate a completed job with artifact
    const succeededJobId = 'job_succeeded_001';
    this.jobs.set(succeededJobId, {
      id: succeededJobId,
      job_type: 'pull_apk',
      status: 'succeeded',
      priority: 10,
      release_id: null,
      app_id: null,
      worker_id: workerId,
      lease_until: null,
      heartbeat_at: new Date().toISOString(),
      attempt_count: 1,
      max_attempts: 3,
      idempotency_key: 'idem_key_001',
      payload: { packageId: 'com.facemoji.lite', playUrl: 'https://play.google.com/store/apps/details?id=com.facemoji.lite' },
      result: { artifactId: 'art_001' },
      error_message: null,
      created_by: 'user-001',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Pre-populate event for succeeded job
    this.events.push({
      id: 'evt_001',
      job_id: succeededJobId,
      level: 'info',
      stage: 'complete',
      message: 'APK pull completed successfully',
      progress: 100,
      metadata: {},
      created_at: new Date().toISOString(),
    });

    // Pre-populate artifact for succeeded job
    const artifactId = 'art_001';
    this.artifacts.set(artifactId, {
      id: artifactId,
      job_id: succeededJobId,
      file_name: 'com.facemoji.lite-v1.0.apk',
      checksum: 'sha256:abc123def456',
      storage_path: 'artifacts/com.facemoji.lite-v1.0.apk',
      artifact_type: 'apk',
      content_type: 'application/vnd.android.package-archive',
      size_bytes: 25480000,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      deleted_at: null,
      created_at: new Date().toISOString(),
    });
  }

  from(tableName: string) {
    const self = this;

    if (tableName === 'release_ops_jobs') {
      return {
        select() {
          return {
            eq(field: string, value: any) {
              if (field === 'job_type') {
                return {
                  order() {
                    return {
                      range(offset: number, limit: number) {
                        const rows = Array.from(self.jobs.values()).filter((j) => j.job_type === value);
                        return Promise.resolve({ data: rows.slice(offset, limit + 1), error: null });
                      },
                    };
                  },
                };
              }
              if (field === 'id') {
                return {
                  single() {
                    const row = self.jobs.get(value);
                    return Promise.resolve({ data: row || null, error: row ? null : new Error('Not found') });
                  },
                };
              }
              if (field === 'idempotency_key') {
                return {
                  maybeSingle() {
                    const row = Array.from(self.jobs.values()).find((j) => j.idempotency_key === value);
                    return Promise.resolve({ data: row || null, error: null });
                  },
                };
              }
              return this;
            },
            order() {
              return {
                range(offset: number, limit: number) {
                  const rows = Array.from(self.jobs.values());
                  return Promise.resolve({ data: rows.slice(offset, limit + 1), error: null });
                },
              };
            },
          };
        },
        insert(data: any) {
          return {
            select() {
              return {
                single() {
                  const record = {
                    id: 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                    status: 'queued',
                    attempt_count: 0,
                    max_attempts: 3,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    ...data,
                  };
                  self.jobs.set(record.id, record);
                  return Promise.resolve({ data: record, error: null });
                },
              };
            },
          };
        },
        update(updateData: any) {
          return {
            eq(field: string, value: any) {
              const job = self.jobs.get(value);
              if (job) {
                Object.assign(job, updateData);
                return Promise.resolve({ error: null });
              }
              return Promise.resolve({ error: new Error('Job not found') });
            },
          };
        },
      };
    }

    if (tableName === 'release_ops_workers') {
      return {
        select() {
          return {
            order() {
              const rows = Array.from(self.workers.values());
              return Promise.resolve({ data: rows, error: null });
            },
            eq(field: string, value: any) {
              if (field === 'id') {
                return {
                  single() {
                    const row = self.workers.get(value);
                    return Promise.resolve({ data: row || null, error: row ? null : new Error('Not found') });
                  },
                };
              }
              return this;
            },
          };
        },
      };
    }

    if (tableName === 'release_ops_job_events') {
      return {
        select() {
          return {
            eq(field: string, value: any) {
              const rows = self.events.filter((e) => e.job_id === value);
              return {
                order() {
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
      };
    }

    if (tableName === 'release_ops_artifacts') {
      return {
        select() {
          return {
            eq(field: string, value: any) {
              if (field === 'job_id') {
                return {
                  maybeSingle() {
                    const row = Array.from(self.artifacts.values()).find((a) => a.job_id === value && !a.deleted_at);
                    return Promise.resolve({ data: row || null, error: null });
                  },
                };
              }
              if (field === 'id') {
                return {
                  single() {
                    const row = self.artifacts.get(value);
                    return Promise.resolve({ data: row || null, error: row ? null : new Error('Not found') });
                  },
                };
              }
              return this;
            },
          };
        },
        update(updateData: any) {
          return {
            eq(field: string, value: any) {
              const artifact = self.artifacts.get(value);
              if (artifact) {
                Object.assign(artifact, updateData);
                return Promise.resolve({ error: null });
              }
              return Promise.resolve({ error: new Error('Artifact not found') });
            },
          };
        },
      };
    }

    if (tableName === 'release_ops_audits') {
      return {
        insert(data: any) {
          self.audits.push(data);
          return Promise.resolve({ error: null });
        },
      };
    }

    return {
      select() {
        return {
          eq() {
            return Promise.resolve({ data: [], error: null });
          },
          order() {
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
      insert() {
        return Promise.resolve({ error: null });
      },
    };
  }

  rpc(methodName: string, args: any) {
    if (methodName === 'release_ops_cancel_job') {
      const jobId = args.p_job_id;
      const job = this.jobs.get(jobId);
      if (job && ['queued', 'claimed', 'running'].includes(job.status)) {
        job.status = 'cancelled';
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: false, error: null });
    }
    return Promise.resolve({ data: null, error: new Error('Unknown RPC') });
  }
}
