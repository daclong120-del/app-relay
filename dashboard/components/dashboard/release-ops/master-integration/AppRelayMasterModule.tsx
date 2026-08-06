// AppRelay Master Dashboard Module (Embedded Client Component for SinoMedia Master UI)

'use client';

import React, { useEffect, useState } from 'react';
import { AppRelayApiClient, AppRelayOverview } from '@/lib/api-client/app-relay-api-client';
import { ReleaseOpsJobItem } from '@/types/release-ops';

export interface AppRelayMasterModuleProps {
  apiBaseUrl?: string;
  userToken?: string;
  csrfToken?: string;
}

export function AppRelayMasterModule({
  apiBaseUrl,
  userToken,
  csrfToken,
}: AppRelayMasterModuleProps) {
  const [overview, setOverview] = useState<AppRelayOverview | null>(null);
  const [recentJobs, setRecentJobs] = useState<ReleaseOpsJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const client = new AppRelayApiClient(apiBaseUrl);

  const loadMasterModuleData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewData, jobsData] = await Promise.all([
        client.getOverview(userToken),
        client.getJobs({ pageSize: 10 }, userToken),
      ]);
      setOverview(overviewData);
      setRecentJobs(jobsData.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load AppRelay module data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMasterModuleData();
  }, [apiBaseUrl, userToken]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">AppRelay APK Acquisition</h3>
            <p className="text-xs text-slate-400">SinoMedia Master Embedded Module — API Integration</p>
          </div>
        </div>
        <button
          onClick={loadMasterModuleData}
          disabled={loading}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-mono rounded text-slate-300 transition"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800/40 text-red-300 rounded text-xs">
          {error}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg">
          <div className="text-xs text-slate-400">Active Jobs</div>
          <div className="text-xl font-bold text-orange-400 mt-1">{overview ? overview.activeJobs : '—'}</div>
        </div>
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg">
          <div className="text-xs text-slate-400">Queued Jobs</div>
          <div className="text-xl font-bold text-amber-400 mt-1">{overview ? overview.queuedJobs : '—'}</div>
        </div>
        <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg">
          <div className="text-xs text-slate-400">Online Workers</div>
          <div className="text-xl font-bold text-emerald-400 mt-1">{overview ? overview.onlineWorkers : '—'}</div>
        </div>
      </div>

      {/* Recent Jobs Table */}
      <div>
        <h4 className="text-xs font-mono text-slate-400 uppercase tracking-wider mb-3">Recent Acquisition Jobs</h4>
        {recentJobs.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-500 border border-dashed border-slate-800 rounded-lg">
            No recent AppRelay jobs found.
          </div>
        ) : (
          <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
            {recentJobs.slice(0, 5).map((job) => (
              <div key={job.id} className="p-3 bg-slate-950/40 flex items-center justify-between text-xs">
                <div>
                  <div className="font-mono text-slate-200 font-medium">{job.id}</div>
                  <div className="text-slate-500 font-mono text-[11px]">
                    {(job.payload as any)?.packageId || 'pull_apk'}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                  job.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                  job.status === 'running' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' :
                  job.status === 'queued' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                  'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}>
                  {job.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
