// AppRelay Dashboard Main Management Page

import React from 'react';
import { ReleaseOpsNavTabs } from '../../../../../components/dashboard/release-ops/ReleaseOpsNavTabs';
import { AppRelayForm } from '../../../../../components/dashboard/release-ops/app-relay/AppRelayForm';
import { AppRelayJobTable } from '../../../../../components/dashboard/release-ops/app-relay/AppRelayJobTable';

export default function AppRelayDashboardPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">Release Ops Control Plane</h1>
              <p className="text-sm text-slate-400">
                SinoMedia Release Operations — AppRelay APK & Store Artifact Acquisition
              </p>
            </div>
            <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-full text-xs font-mono">
              AppRelay v1.0.0
            </span>
          </div>
        </header>

        <ReleaseOpsNavTabs activeTab="app-relay" />

        <AppRelayForm
          onSubmit={async (data) => {
            console.log('Dispatching AppRelay Job:', data);
          }}
        />

        <AppRelayJobTable jobs={[]} />
      </div>
    </div>
  );
}
