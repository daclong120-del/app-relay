// AppRelay Jobs Status List Table Component

import React from 'react';
import { ReleaseOpsJobItem } from '../../../../types/release-ops';

export interface AppRelayJobTableProps {
  jobs: ReleaseOpsJobItem[];
  onSelectJob?: (jobId: string) => void;
  onCancelJob?: (jobId: string) => void;
  onRetryJob?: (jobId: string) => void;
}

export const AppRelayJobTable: React.FC<AppRelayJobTableProps> = ({
  jobs,
  onSelectJob,
  onCancelJob,
  onRetryJob,
}) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'queued':
        return <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-xs">Queued</span>;
      case 'claimed':
      case 'running':
        return <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded text-xs animate-pulse">Running</span>;
      case 'succeeded':
        return <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-xs">Succeeded</span>;
      case 'failed':
      case 'dead_letter':
        return <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded text-xs">Failed</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 bg-slate-500/10 text-slate-400 border border-slate-500/30 rounded text-xs">Cancelled</span>;
      default:
        return <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-xs">{status}</span>;
    }
  };

  if (!jobs || jobs.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 text-center text-slate-400 text-sm">
        No AppRelay APK pull jobs found. Use the form above to dispatch your first acquisition job.
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-xl backdrop-blur-md">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Acquisition Queue & History</h3>
        <span className="text-xs text-slate-400">{jobs.length} Jobs Total</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-950/60 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
              <th className="py-3 px-6">Package ID</th>
              <th className="py-3 px-6">Status</th>
              <th className="py-3 px-6">Attempts</th>
              <th className="py-3 px-6">Created At</th>
              <th className="py-3 px-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
            {jobs.map((job) => {
              const packageId = (job.payload as any)?.packageId || 'unknown';
              const isRunning = ['queued', 'claimed', 'running'].includes(job.status);
              const isFailed = ['failed', 'dead_letter'].includes(job.status);

              return (
                <tr key={job.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-6 font-mono text-slate-200">
                    <button
                      onClick={() => onSelectJob?.(job.id)}
                      className="hover:text-blue-400 underline decoration-slate-700 underline-offset-4"
                    >
                      {packageId}
                    </button>
                  </td>
                  <td className="py-3.5 px-6">{getStatusBadge(job.status)}</td>
                  <td className="py-3.5 px-6 font-mono text-slate-400">
                    {job.attemptCount}/{job.maxAttempts}
                  </td>
                  <td className="py-3.5 px-6 text-slate-400">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                  <td className="py-3.5 px-6 text-right space-x-2">
                    <button
                      onClick={() => onSelectJob?.(job.id)}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-all"
                    >
                      View
                    </button>

                    {isRunning && (
                      <button
                        onClick={() => onCancelJob?.(job.id)}
                        className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 border border-rose-500/30 rounded transition-all"
                      >
                        Cancel
                      </button>
                    )}

                    {isFailed && (
                      <button
                        onClick={() => onRetryJob?.(job.id)}
                        className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-500/30 rounded transition-all"
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
