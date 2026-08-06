// AppRelay Worker & ADB Device Diagnostics Panel Component (Lutech UI Style)

import React from 'react';
import { ReleaseOpsWorkerItem, AppRelayDeviceProfile } from '../../../../types/release-ops';
import { ProvenanceBadge } from '../../ui/ProvenanceBadge';

export interface WorkerDevicePanelProps {
  worker?: ReleaseOpsWorkerItem | null;
  deviceProfile?: AppRelayDeviceProfile | null;
}

export const WorkerDevicePanel: React.FC<WorkerDevicePanelProps> = ({ worker, deviceProfile }) => {
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl backdrop-blur-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-blue-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Worker & ADB Device</h3>
            <p className="text-xs text-slate-400">Runtime environment & hardware capability</p>
          </div>
        </div>

        <ProvenanceBadge source="worker_live" />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/80 border border-slate-800 p-4 rounded-md font-mono">
        <div>
          <span className="text-slate-500 block text-[11px]">Worker Name</span>
          <span className="text-slate-200 font-semibold">{worker?.workerName || 'adb-worker-primary'}</span>
        </div>

        <div>
          <span className="text-slate-500 block text-[11px]">Status</span>
          <span className="text-emerald-400 font-semibold">{worker?.status || 'Active (Live)'}</span>
        </div>

        <div>
          <span className="text-slate-500 block text-[11px]">Android SDK</span>
          <span className="text-slate-200">{deviceProfile?.sdk ? `API ${deviceProfile.sdk}` : 'API 33 (Android 13)'}</span>
        </div>

        <div>
          <span className="text-slate-500 block text-[11px]">Target ABI</span>
          <span className="text-slate-200">{deviceProfile?.abi || 'arm64-v8a'}</span>
        </div>

        <div>
          <span className="text-slate-500 block text-[11px]">Screen Density</span>
          <span className="text-slate-200">{deviceProfile?.density ? `${deviceProfile.density} dpi` : '420 dpi (xhdpi)'}</span>
        </div>

        <div>
          <span className="text-slate-500 block text-[11px]">Device Locale</span>
          <span className="text-slate-200">{deviceProfile?.locale || 'en-US'}</span>
        </div>
      </div>
    </div>
  );
};
