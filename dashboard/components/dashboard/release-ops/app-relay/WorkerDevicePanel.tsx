// AppRelay Worker & ADB Device Diagnostics Panel Component (Lutech UI Style)

import React from 'react';
import { ReleaseOpsWorkerItem, AppRelayDeviceProfile } from '../../../../types/release-ops';
import { ProvenanceBadge } from '../../ui/ProvenanceBadge';

export interface WorkerDevicePanelProps {
  worker?: ReleaseOpsWorkerItem | null;
  deviceProfile?: AppRelayDeviceProfile | null;
}

export const WorkerDevicePanel: React.FC<WorkerDevicePanelProps> = ({ worker, deviceProfile }) => {
  const hasWorker = worker !== null && worker !== undefined;
  const hasDevice = deviceProfile !== null && deviceProfile !== undefined;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl backdrop-blur-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className={`p-2.5 border rounded-md ${hasWorker ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-slate-800/50 border-slate-700 text-slate-500'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Worker & ADB Device</h3>
            <p className="text-xs text-slate-400">
              {hasWorker ? 'Runtime environment & hardware capability' : 'No worker has been assigned to this job'}
            </p>
          </div>
        </div>

        {hasWorker ? (
          <ProvenanceBadge source="worker_live" />
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs text-[10px] font-mono uppercase tracking-wider border bg-slate-800/50 text-slate-500 border-slate-700">
            Offline
          </span>
        )}
      </div>

      {hasWorker ? (
        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/80 border border-slate-800 p-4 rounded-md font-mono">
          <div>
            <span className="text-slate-500 block text-[11px]">Worker Name</span>
            <span className="text-slate-200 font-semibold">{worker.workerName}</span>
          </div>

          <div>
            <span className="text-slate-500 block text-[11px]">Status</span>
            <span className={`font-semibold ${worker.status === 'active' || worker.status === 'online' ? 'text-emerald-400' : 'text-slate-400'}`}>
              {worker.status}
            </span>
          </div>

          {hasDevice && (
            <>
              <div>
                <span className="text-slate-500 block text-[11px]">Android SDK</span>
                <span className="text-slate-200">{deviceProfile.sdk ? `API ${deviceProfile.sdk}` : '—'}</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Target ABI</span>
                <span className="text-slate-200">{deviceProfile.abi || '—'}</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Screen Density</span>
                <span className="text-slate-200">{deviceProfile.density ? `${deviceProfile.density} dpi` : '—'}</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Device Locale</span>
                <span className="text-slate-200">{deviceProfile.locale || '—'}</span>
              </div>
            </>
          )}

          {!hasDevice && (
            <div className="col-span-2 text-slate-500 text-[11px]">
              No device profile available for this worker.
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 bg-slate-950/60 border border-dashed border-slate-800 rounded-md text-center text-xs text-slate-500 font-mono">
          Waiting for a worker node to claim and execute this job...
        </div>
      )}
    </div>
  );
};
