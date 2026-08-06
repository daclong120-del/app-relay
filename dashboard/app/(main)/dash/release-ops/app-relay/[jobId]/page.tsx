// AppRelay Job Detail Page

import React from 'react';
import { AppRelayArtifactCard } from '../../../../../../components/dashboard/release-ops/app-relay/AppRelayArtifactCard';
import { AppRelayTimeline } from '../../../../../../components/dashboard/release-ops/app-relay/AppRelayTimeline';
import { ReleaseOpsNavTabs } from '../../../../../../components/dashboard/release-ops/ReleaseOpsNavTabs';

export default function AppRelayJobDetailPage({ params }: { params: { jobId: string } }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">Job Detail #{params.jobId}</h1>
              <p className="text-sm text-slate-400">
                AppRelay APK Acquisition Job Spec & Live Timeline
              </p>
            </div>
            <a
              href="/dash/release-ops/app-relay"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-all"
            >
              ← Back to AppRelay List
            </a>
          </div>
        </header>

        <ReleaseOpsNavTabs activeTab="app-relay" />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <AppRelayTimeline events={[]} />
          </div>

          <div className="space-y-8">
            <AppRelayArtifactCard artifact={null} result={null} />
          </div>
        </div>
      </div>
    </div>
  );
}
