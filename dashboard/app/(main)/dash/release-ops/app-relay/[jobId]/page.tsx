// AppRelay Job Detail Page (Lutech UI Redesign)

'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { ReleaseOpsNavTabs } from '@/components/dashboard/release-ops/ReleaseOpsNavTabs';
import { AppRelayTimeline } from '@/components/dashboard/release-ops/app-relay/AppRelayTimeline';
import { AppRelayArtifactCard } from '@/components/dashboard/release-ops/app-relay/AppRelayArtifactCard';
import { WorkerDevicePanel } from '@/components/dashboard/release-ops/app-relay/WorkerDevicePanel';
import { Button } from '@/components/dashboard/ui/Button';
import { StatusBadge } from '@/components/dashboard/ui/StatusBadge';
import { AppRelayJobEvent, AppRelayArtifact } from '@/types/release-ops';

export default function AppRelayJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [artifact, setArtifact] = useState<AppRelayArtifact | null>({
    id: 'art-88273619',
    jobId: jobId,
    fileName: 'com.sinomedia.app_v1.2.4_archive.zip',
    checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    storagePath: 'app-relay/artifacts/com.sinomedia.app_v1.2.4.zip',
    artifactType: 'zip_split_apk',
    contentType: 'application/zip',
    sizeBytes: 42800000,
    expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  });

  const events: AppRelayJobEvent[] = [
    {
      id: 'ev-1',
      jobId: jobId,
      level: 'info',
      stage: 'scraping_listing',
      message: 'Successfully scraped Google Play Store app metadata & APK package signatures.',
      progress: 15,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'ev-2',
      jobId: jobId,
      level: 'info',
      stage: 'preparing_device',
      message: 'ADB device profile initialized. Connected to primary worker arm64-v8a.',
      progress: 35,
      createdAt: new Date(Date.now() - 3000000).toISOString(),
    },
    {
      id: 'ev-3',
      jobId: jobId,
      level: 'info',
      stage: 'pulling_apks',
      message: 'Extracted base.apk and 4 split APK packages from target device.',
      progress: 70,
      createdAt: new Date(Date.now() - 2400000).toISOString(),
    },
    {
      id: 'ev-4',
      jobId: jobId,
      level: 'info',
      stage: 'uploading_artifact',
      message: 'ZIP archive uploaded to private Supabase Storage bucket. SHA-256 verified.',
      progress: 100,
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
  ];

  const handleDownload = async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    alert(`Generating signed download link for artifact ${artifact?.fileName}...`);
  };

  const handleDelete = async () => {
    setArtifact((prev) => (prev ? { ...prev, deletedAt: new Date().toISOString() } : null));
  };

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
            <span className="text-slate-200">Job #{jobId}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-3">
            <span>Job Spec #{jobId}</span>
            <StatusBadge status="succeeded" />
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            AppRelay APK Acquisition Job Spec & Live Timeline Trace
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

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <AppRelayTimeline events={events} />
        </div>

        {/* Right Column: Worker Diagnostics & Download Artifact Card */}
        <div className="space-y-6">
          <WorkerDevicePanel />
          <AppRelayArtifactCard
            artifact={artifact}
            result={{
              schemaVersion: 1,
              versionName: '1.2.4',
              versionCode: 10204,
              baseSizeBytes: 18400000,
              splitCount: 4,
              screenshotCount: 8,
              archiveArtifactId: artifact?.id || '',
              archiveSha256: artifact?.checksum || '',
              archiveSizeBytes: artifact?.sizeBytes || 0,
            }}
            onDownload={handleDownload}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
}
