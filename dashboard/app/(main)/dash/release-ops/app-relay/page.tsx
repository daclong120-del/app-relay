// AppRelay Dashboard Main Management Page (API-Client Powered, Lutech UI Redesign)

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ReleaseOpsNavTabs } from '@/components/dashboard/release-ops/ReleaseOpsNavTabs';
import { AppRelayForm } from '@/components/dashboard/release-ops/app-relay/AppRelayForm';
import { AppRelayJobTable } from '@/components/dashboard/release-ops/app-relay/AppRelayJobTable';
import { MetricCard } from '@/components/dashboard/ui/MetricCard';
import { AppRelayApiClient, AppRelayOverview } from '@/lib/api-client/app-relay-api-client';
import { ReleaseOpsJobItem } from '@/types/release-ops';

const POLL_INTERVAL_MS = 8000;

export default function AppRelayDashboardPage() {
  const [jobs, setJobs] = useState<ReleaseOpsJobItem[]>([]);
  const [overview, setOverview] = useState<AppRelayOverview>({
    totalJobs: 0,
    activeJobs: 0,
    queuedJobs: 0,
    succeededJobs: 0,
    failedJobs: 0,
    onlineWorkers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const client = new AppRelayApiClient();

  const fetchDashboardData = useCallback(async () => {
    try {
      const [overviewRes, jobsRes] = await Promise.all([
        client.getOverview().catch(() => null),
        client.getJobs({ pageSize: 50 }).catch(() => null),
      ]);

      if (overviewRes) setOverview(overviewRes);
      if (jobsRes && jobsRes.data) setJobs(jobsRes.data);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to connect to AppRelay Public API');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + auto-polling (M3 fix)
  useEffect(() => {
    fetchDashboardData();

    const interval = setInterval(() => {
      fetchDashboardData();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  const handleCreateJob = async (data: { playUrl: string; locale: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await client.createJob({
        playUrl: data.playUrl,
        locale: data.locale,
      });

      if (res && res.job) {
        setJobs((prev) => [res.job, ...prev.filter((j) => j.id !== res.job.id)]);
        fetchDashboardData();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit APK acquisition job');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      await client.cancelJob(jobId);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'cancelled' as const } : j))
      );
      fetchDashboardData();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel job');
    }
  };

  const handleRetryJob = async (jobId: string) => {
    try {
      await client.retryJob(jobId);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: 'queued' as const } : j))
      );
      fetchDashboardData();
    } catch (err: any) {
      setError(err.message || 'Failed to retry job');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Page Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 mb-1 font-mono">
            <span>Release Ops</span>
            <span>/</span>
            <span className="text-orange-500 font-semibold">AppRelay</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
            <span>AppRelay Control Plane</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            SinoMedia Release Operations — Google Play Store APK & Split Artifact Acquisition
            {lastRefreshed && (
              <span className="ml-2 text-slate-600">
                • Updated {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>

        <button
          onClick={() => fetchDashboardData()}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-mono rounded text-slate-300 transition border border-slate-700"
        >
          {loading ? 'Refreshing...' : '↻ Refresh'}
        </button>
      </header>

      {/* Release Ops Top Navigation */}
      <ReleaseOpsNavTabs activeTab="app-relay" />

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-950/50 border border-red-800/50 text-red-300 rounded-lg text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-mono underline hover:text-red-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Summary Health Strip — H4 fix: removed misleading provenance labels */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Worker Fleet"
          value={`${overview.onlineWorkers} Live`}
          subtitle="Registered ADB worker nodes"
          tone="emerald"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
        <MetricCard
          title="Queue Depth"
          value={overview.queuedJobs}
          subtitle="Pending acquisition jobs"
          tone="amber"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
        <MetricCard
          title="Running Jobs"
          value={overview.activeJobs}
          subtitle="Active ADB extractions"
          tone="blue"
          icon={
            // M2 fix: Only animate pulse when there are active jobs
            <svg className={`w-5 h-5 ${overview.activeJobs > 0 ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <MetricCard
          title="Total Succeeded"
          value={overview.succeededJobs}
          subtitle={`${overview.failedJobs} failed`}
          tone="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Main Submit Panel */}
      <AppRelayForm onSubmit={handleCreateJob} loading={submitting} />

      {/* Queue & Job History Table */}
      <AppRelayJobTable
        jobs={jobs}
        onSelectJob={(id) => {
          window.location.href = `/dash/release-ops/app-relay/${id}`;
        }}
        onCancelJob={handleCancelJob}
        onRetryJob={handleRetryJob}
      />
    </div>
  );
}
