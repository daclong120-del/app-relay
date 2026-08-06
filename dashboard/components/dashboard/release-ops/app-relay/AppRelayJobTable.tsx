// AppRelay Jobs Status List Table Component (Lutech UI Style)

import React, { useState } from 'react';
import { ReleaseOpsJobItem, ReleaseOpsJobStatus } from '../../../../types/release-ops';
import { StatusBadge } from '../../ui/StatusBadge';
import { Button } from '../../ui/Button';
import { TextInput } from '../../ui/TextInput';
import { DropdownSelect } from '../../ui/DropdownSelect';
import { ProvenanceBadge } from '../../ui/ProvenanceBadge';
import { ConfirmActionModal } from './ConfirmActionModal';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [confirmModalState, setConfirmModalState] = useState<{
    isOpen: boolean;
    actionType: 'cancel' | 'retry';
    jobId: string;
  }>({ isOpen: false, actionType: 'cancel', jobId: '' });

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'queued', label: 'Queued' },
    { value: 'running', label: 'Running' },
    { value: 'succeeded', label: 'Completed' },
    { value: 'failed', label: 'Failed' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const filteredJobs = (jobs || []).filter((job) => {
    const packageId = ((job.payload as any)?.packageId || '').toLowerCase();
    const jobId = job.id.toLowerCase();
    const q = searchQuery.toLowerCase().trim();

    const matchesSearch = !q || packageId.includes(q) || jobId.includes(q);
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handleOpenConfirm = (actionType: 'cancel' | 'retry', jobId: string) => {
    setConfirmModalState({ isOpen: true, actionType, jobId });
  };

  const handleExecuteAction = async () => {
    const { actionType, jobId } = confirmModalState;
    if (actionType === 'cancel' && onCancelJob) {
      await onCancelJob(jobId);
    } else if (actionType === 'retry' && onRetryJob) {
      await onRetryJob(jobId);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg overflow-hidden shadow-xl backdrop-blur-xs space-y-0">
      {/* Control & Multi-Filter Bar */}
      <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/40">
        <div className="flex items-center space-x-3">
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            Acquisition Queue & History
          </h3>
          <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
            {filteredJobs.length} / {jobs?.length || 0} Total
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:w-64">
            <TextInput
              placeholder="Filter by package ID or Job ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              mono={true}
            />
          </div>

          <div className="w-full sm:w-44">
            <DropdownSelect
              options={statusOptions}
              value={statusFilter}
              onChange={(val) => setStatusFilter(val)}
              size="sm"
            />
          </div>
        </div>
      </div>

      {/* Table Body */}
      {filteredJobs.length === 0 ? (
        <div className="p-12 text-center text-slate-400 text-xs">
          No AppRelay APK pull jobs match the active filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800">
                <th className="py-3 px-4 font-semibold">Package ID</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Attempts</th>
                <th className="py-3 px-4 font-semibold">Created At</th>
                <th className="py-3 px-4 font-semibold">Provenance</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
              {filteredJobs.map((job) => {
                const packageId = (job.payload as any)?.packageId || 'unknown';
                const isRunning = ['queued', 'claimed', 'running'].includes(job.status);
                const isFailed = ['failed', 'dead_letter'].includes(job.status);

                return (
                  <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-slate-200">
                      <button
                        onClick={() => onSelectJob?.(job.id)}
                        className="hover:text-blue-400 underline decoration-slate-700 underline-offset-4 cursor-pointer"
                      >
                        {packageId}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={job.status as ReleaseOpsJobStatus} />
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {job.attemptCount}/{job.maxAttempts}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <ProvenanceBadge source="supabase_realtime" />
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => onSelectJob?.(job.id)}>
                        Inspect
                      </Button>

                      {isRunning && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleOpenConfirm('cancel', job.id)}
                        >
                          Cancel
                        </Button>
                      )}

                      {isFailed && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenConfirm('retry', job.id)}
                        >
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Safety Gate Confirmation Modal */}
      <ConfirmActionModal
        isOpen={confirmModalState.isOpen}
        onClose={() => setConfirmModalState((prev) => ({ ...prev, isOpen: false }))}
        title={confirmModalState.actionType === 'cancel' ? 'Cancel Job Execution' : 'Retry Job Execution'}
        subtitle={`Confirm ${confirmModalState.actionType} action for target job.`}
        actionType={confirmModalState.actionType}
        targetId={confirmModalState.jobId}
        onConfirm={handleExecuteAction}
      />
    </div>
  );
};
