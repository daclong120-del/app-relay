// AppRelay Job Detail Page (API-Client Powered, Realtime Data, Lutech UI Design)

'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ReleaseOpsNavTabs } from '@/components/dashboard/release-ops/ReleaseOpsNavTabs';
import { AppRelayTimeline } from '@/components/dashboard/release-ops/app-relay/AppRelayTimeline';
import { AppRelayArtifactCard } from '@/components/dashboard/release-ops/app-relay/AppRelayArtifactCard';
import { WorkerDevicePanel } from '@/components/dashboard/release-ops/app-relay/WorkerDevicePanel';
import { Button } from '@/components/dashboard/ui/Button';
import { StatusBadge } from '@/components/dashboard/ui/StatusBadge';
import { AppRelayApiClient } from '@/lib/api-client/app-relay-api-client';
import { ReleaseOpsJobItem, AppRelayJobEvent, AppRelayArtifact, ReleaseOpsWorkerItem } from '@/types/release-ops';

export default function AppRelayJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();

  const [job, setJob] = useState<ReleaseOpsJobItem | null>(null);
  const [events, setEvents] = useState<AppRelayJobEvent[]>([]);
  const [artifact, setArtifact] = useState<AppRelayArtifact | null>(null);
  const [worker, setWorker] = useState<ReleaseOpsWorkerItem | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const client = new AppRelayApiClient();

  const fetchJobDetails = async () => {
    if (!jobId) return;
    try {
      const res = await client.getJobDetail(jobId);
      if (res.job) setJob(res.job);
      if (res.events) setEvents(res.events);
      if (res.artifact !== undefined) setArtifact(res.artifact);
      if (res.worker !== undefined) setWorker(res.worker);
      setError(null);
    } catch (err: any) {
      setError(err.message || `Failed to load details for job #${jobId}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobDetails();

    // Auto-poll every 3 seconds if job is active/running
    const interval = setInterval(() => {
      if (job && ['queued', 'claimed', 'running'].includes(job.status)) {
        fetchJobDetails();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const handleDownload = async () => {
    if (!jobId) return;
    try {
      const handoff = await client.getArtifactDownloadUrl(jobId);
      if (handoff && handoff.downloadUrl) {
        // Trigger browser download
        const link = document.createElement('a');
        link.href = handoff.downloadUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        if (artifact?.fileName) {
          link.download = artifact.fileName;
        }
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        alert('Could not generate download URL for artifact.');
      }
    } catch (err: any) {
      alert(`Download failed: ${err.message || 'Unknown error'}`);
    }
  };

  const handleDeleteArtifact = async () => {
    if (!artifact?.id) return;
    try {
      await client.deleteArtifact(artifact.id);
      setArtifact((prev) => (prev ? { ...prev, deletedAt: new Date().toISOString() } : null));
      fetchJobDetails();
    } catch (err: any) {
      alert(`Delete artifact failed: ${err.message || 'Unknown error'}`);
    }
  };

  const packageId = (job?.payload as any)?.packageId || job?.idempotencyKey?.split(':')[1] || jobId;
  const playUrl = (job?.payload as any)?.playUrl;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header & Breadcrumb */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2 text-xs text-slate-400 mb-1 font-mono">
            <span>Release Ops</span>
            <span>/</span>
            <a href="/dash/release-ops/app-relay" className="hover:text-orange-400">
              AppRelay
            </a>
            <span>/</span>
            <span className="text-slate-200">{packageId}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
            <span className="font-mono">{packageId}</span>
            {job && <StatusBadge status={job.status} />}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Job ID: <span className="font-mono text-slate-300">{jobId}</span>
            {playUrl && (
              <>
                {' • '}
                <a href={playUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  Google Play Listing ↗
                </a>
              </>
            )}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.location.href = '/dash/release-ops/app-relay';
          }}
          leftIcon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          }
        >
          Back to AppRelay List
        </Button>
      </header>

      {/* Top Navigation */}
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

      {/* Loading Skeleton */}
      {loading && !job && (
        <div className="p-12 text-center text-slate-400 text-sm font-mono animate-pulse">
          Loading job execution telemetry and event trace...
        </div>
      )}

      {/* Main 2-Column Grid */}
      {job && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Timeline */}
          <div className="lg:col-span-2 space-y-6">
            <AppRelayTimeline events={events} />

            {/* Error Message Panel if job failed */}
            {job.errorMessage && (
              <div className="bg-red-950/40 border border-red-900/60 rounded-lg p-5 space-y-2">
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider font-mono">Job Failure Trace</h4>
                <pre className="text-xs text-red-200 font-mono whitespace-pre-wrap bg-slate-950 p-3 rounded border border-red-900/30">
                  {job.errorMessage}
                </pre>
              </div>
            )}
          </div>

          {/* Right Column: Worker Diagnostics & Download Artifact Card */}
          <div className="space-y-6">
            <WorkerDevicePanel
              worker={worker}
              deviceProfile={(job.result as any)?.deviceProfile || null}
            />
            <AppRelayArtifactCard
              artifact={artifact}
              result={job.result}
              onDownload={handleDownload}
              onDelete={handleDeleteArtifact}
            />
          </div>
        </div>
      )}
    </div>
  );
}
