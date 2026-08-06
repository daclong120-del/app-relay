// Integration Test Suite for AppRelay Dashboard Server Actions (Phase 9)

import {
  cancelAppRelayJobAction,
  createAppRelayJobAction,
  deleteAppRelayArtifactAction,
  getAppRelayDownloadUrlAction,
  getAppRelayJobDetailAction,
  getAppRelayJobsAction,
  retryAppRelayJobAction,
} from '../app/actions/app-relay.actions';

class MockDbClient {
  public jobs: Map<string, any> = new Map();
  public events: any[] = [];
  public artifacts: Map<string, any> = new Map();
  public audits: any[] = [];

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
                        return Promise.resolve({ data: rows, error: null });
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
                  return Promise.resolve({ data: rows, error: null });
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
                    id: 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
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

    if (tableName === 'release_ops_audits') {
      return {
        insert(data: any) {
          self.audits.push(data);
          return Promise.resolve({ error: null });
        },
      };
    }

    if (tableName === 'release_ops_job_events') {
      return {
        select() {
          return {
            eq(field: string, value: any) {
              return {
                order() {
                  const rows = self.events.filter((e) => e.job_id === value);
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
              if (field === 'id') {
                return {
                  single() {
                    const row = self.artifacts.get(value);
                    return Promise.resolve({ data: row || null, error: row ? null : new Error('Not found') });
                  },
                };
              }
              if (field === 'job_id') {
                return {
                  is(isField: string, isVal: any) {
                    return {
                      order() {
                        return {
                          limit() {
                            return {
                              maybeSingle() {
                                const row = Array.from(self.artifacts.values()).find(
                                  (a) => a.job_id === value && a.deleted_at === null
                                );
                                return Promise.resolve({ data: row || null, error: null });
                              },
                            };
                          },
                        };
                      },
                    };
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
              const art = self.artifacts.get(value);
              if (art) {
                Object.assign(art, updateData);
                return Promise.resolve({ error: null });
              }
              return Promise.resolve({ error: new Error('Artifact not found') });
            },
          };
        },
      };
    }

    return { select: () => this, eq: () => this };
  }

  async rpc(procedureName: string, params: any) {
    if (procedureName === 'release_ops_cancel_job') {
      const job = this.jobs.get(params.p_job_id);
      if (job && ['queued', 'claimed', 'running'].includes(job.status)) {
        job.status = 'cancelled';
        return { data: true, error: null };
      }
      return { data: false, error: null };
    }
    return { data: null, error: new Error(`Unknown RPC: ${procedureName}`) };
  }
}

async function runDashboardActionsTests() {
  console.log('--- STARTING DASHBOARD SERVER ACTIONS TESTS (PHASE 9) ---');

  const db = new MockDbClient();
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Test Create AppRelay Job Action - Invalid Host
  const res1 = await createAppRelayJobAction(db as any, { playUrl: 'https://malicious.example.com/store/apps/details?id=com.app' });
  assert(res1.success === false && res1.error?.includes('INVALID_URL'), 'Rejects non-Google Play URLs');

  // 2. Test Create AppRelay Job Action - Valid Play Store URL
  const res2 = await createAppRelayJobAction(db as any, {
    playUrl: 'https://play.google.com/store/apps/details?id=com.sinomedia.appdash&hl=en',
  });
  assert(res2.success === true && res2.data !== undefined, 'Creates pull_apk job for valid Play Store URL');
  const jobId = res2.data!.id;
  assert(res2.data!.jobType === 'pull_apk', 'Created job has jobType = pull_apk');

  // 3. Test Query AppRelay Jobs Action
  const res3 = await getAppRelayJobsAction(db as any);
  assert(res3.success === true && res3.data!.length === 1, 'Queries list of AppRelay jobs');

  // 4. Test Query Job Detail Action
  const res4 = await getAppRelayJobDetailAction(db as any, jobId);
  assert(res4.success === true && res4.data!.job.id === jobId, 'Queries job detail');

  // 5. Test Cancel Job Action
  const res5 = await cancelAppRelayJobAction(db as any, jobId);
  assert(res5.success === true && res5.data === true, 'Cancels queued job via RPC');

  // Seed a failed job for retry test
  const failedJobId = 'job_failed_99';
  db.jobs.set(failedJobId, {
    id: failedJobId,
    job_type: 'pull_apk',
    status: 'failed',
    priority: 10,
    attempt_count: 1,
    max_attempts: 3,
    payload: { packageId: 'com.fail.app' },
  });

  // 6. Test Retry Job Action
  const res6 = await retryAppRelayJobAction(db as any, failedJobId);
  assert(res6.success === true && res6.data === true, 'Requeues failed job');
  assert(db.jobs.get(failedJobId).status === 'queued', 'Status updated to queued');

  // Seed an artifact in mock DB
  const artId = 'art_1001';
  db.artifacts.set(artId, {
    id: artId,
    job_id: jobId,
    file_name: 'com.sinomedia.appdash-v100.zip',
    storage_path: 'app-relay/2026/08/' + jobId + '/com.sinomedia.appdash-v100.zip',
    artifact_type: 'apk_zip',
    content_type: 'application/zip',
    size_bytes: 14200000,
    expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
    deleted_at: null,
  });

  // 7. Test Get Download URL Action
  const res7 = await getAppRelayDownloadUrlAction(db as any, jobId);
  assert(res7.success === true && res7.data!.downloadUrl.length > 0, 'Generates signed download URL');

  // 8. Test Delete Artifact Action
  const res8 = await deleteAppRelayArtifactAction(db as any, artId);
  assert(res8.success === true && res8.data === true, 'Marks artifact as deleted');
  assert(db.artifacts.get(artId).deleted_at !== null, 'deleted_at timestamp set');

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runDashboardActionsTests().catch((err) => {
  console.error('Fatal error in dashboard actions test:', err);
  process.exit(1);
});
