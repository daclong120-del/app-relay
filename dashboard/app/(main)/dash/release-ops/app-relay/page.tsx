// AppRelay Dashboard Main Management Page (Lutech UI Redesign)

'use client';

import React, { useState } from 'react';
import { ReleaseOpsNavTabs } from '@/components/dashboard/release-ops/ReleaseOpsNavTabs';
import { AppRelayForm } from '@/components/dashboard/release-ops/app-relay/AppRelayForm';
import { AppRelayJobTable } from '@/components/dashboard/release-ops/app-relay/AppRelayJobTable';
import { MetricCard } from '@/components/dashboard/ui/MetricCard';
import { ReleaseOpsJobItem } from '@/types/release-ops';

export default function AppRelayDashboardPage() {
  const [jobs, setJobs] = useState<ReleaseOpsJobItem[]>([
    {
      id: 'job-98a1b2c3',
      jobType: 'pull_apk',
      status: 'succeeded',
      priority: 1,
      attemptCount: 1,
      maxAttempts: 3,
      payload: {
        schemaVersion: 1,
        playUrl: 'https://play.google.com/store/apps/details?id=com.sinomedia.app',
        packageId: 'com.sinomedia.app',
        locale: 'en',
      },
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: 'job-45d6e7f8',
      jobType: 'pull_apk',
      status: 'running',
      priority: 2,
      attemptCount: 1,
      maxAttempts: 3,
      payload: {
        schemaVersion: 1,
        playUrl: 'https://play.google.com/store/apps/details?id=com.sinomedia.crawler',
        packageId: 'com.sinomedia.crawler',
        locale: 'vi',
      },
      createdAt: new Date(Date.now() - 600000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const handleCreateJob = async (data: { playUrl: string; locale: string }) => {
    setSubmitting(true);
    try {
      // Simulate creating job
      await new Promise((resolve) => setTimeout(resolve, 800));
      const u = new URL(data.playUrl);
      const pkg = u.searchParams.get('id') || 'com.example.app';

      const newJob: ReleaseOpsJobItem = {
        id: `job-${Math.random().toString(36).substring(2, 10)}`,
        jobType: 'pull_apk',
        status: 'queued',
        priority: 1,
        attemptCount: 0,
        maxAttempts: 3,
        payload: {
          schemaVersion: 1,
          playUrl: data.playUrl,
          packageId: pkg,
          locale: data.locale,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setJobs((prev) => [newJob, ...prev]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: 'cancelled' as const } : j))
    );
  };

  const handleRetryJob = async (jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: 'queued' as const, attemptCount: j.attemptCount + 1 } : j))
    );
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
            <span className="px-2.5 py-0.5 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-full text-xs font-mono">
              v1.0.0
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            SinoMedia Release Operations — Google Play Store APK & Split Artifact Acquisition
          </p>
        </div>
      </header>

      {/* Release Ops Top Navigation */}
      <ReleaseOpsNavTabs activeTab="app-relay" />

      {/* Summary Health Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Worker Fleet"
          value="4 / 4 Live"
          subtitle="All ADB workers healthy"
          provenance="worker_live"
          tone="emerald"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
        <MetricCard
          title="Queue Depth"
          value={jobs.filter((j) => ['queued', 'claimed'].includes(j.status)).length}
          subtitle="Pending acquisition jobs"
          provenance="supabase_realtime"
          tone="amber"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
        <MetricCard
          title="Running Jobs"
          value={jobs.filter((j) => j.status === 'running').length}
          subtitle="Active ADB extractions"
          provenance="worker_live"
          tone="blue"
          icon={
            <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <MetricCard
          title="Success Rate (24h)"
          value="98.4%"
          subtitle="124 completed, 2 retried"
          provenance="artifact_storage"
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
