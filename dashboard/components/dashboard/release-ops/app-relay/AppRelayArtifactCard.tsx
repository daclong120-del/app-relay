// AppRelay Downloadable Artifact Card Component (Lutech UI Style)

import React, { useState } from 'react';
import { AppRelayArtifact, PullApkJobResultV1 } from '../../../../types/release-ops';
import { Button } from '../../ui/Button';
import { ProvenanceBadge } from '../../ui/ProvenanceBadge';
import { ConfirmActionModal } from './ConfirmActionModal';

export interface AppRelayArtifactCardProps {
  artifact?: AppRelayArtifact | null;
  result?: PullApkJobResultV1 | Record<string, unknown> | null;
  onDownload?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}

export const AppRelayArtifactCard: React.FC<AppRelayArtifactCardProps> = ({
  artifact,
  result,
  onDownload,
  onDelete,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [copiedChecksum, setCopiedChecksum] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  if (!artifact) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 text-center text-slate-400 text-xs">
        No storage artifact generated for this job yet.
      </div>
    );
  }

  const isExpired = artifact.expiresAt ? new Date(artifact.expiresAt) < new Date() : false;
  const isDeleted = Boolean(artifact.deletedAt);
  const sizeMb = (artifact.sizeBytes / (1024 * 1024)).toFixed(2);
  const typedResult = result as PullApkJobResultV1;
  const checksum = artifact.checksum || typedResult?.archiveSha256 || 'N/A';

  const handleDownload = async () => {
    if (!onDownload || downloading || isExpired || isDeleted) return;
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  };

  const handleCopyChecksum = () => {
    if (checksum !== 'N/A') {
      navigator.clipboard.writeText(checksum);
      setCopiedChecksum(true);
      setTimeout(() => setCopiedChecksum(false), 2000);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl backdrop-blur-xs space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">{artifact.fileName}</h3>
            <p className="text-xs text-slate-400">Private Supabase Storage Archive</p>
          </div>
        </div>

        <ProvenanceBadge source="artifact_storage" />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950/80 border border-slate-800 p-4 rounded-md font-mono">
        <div>
          <span className="text-slate-500 block text-[11px]">Archive Size</span>
          <span className="text-slate-200 font-semibold">{sizeMb} MB</span>
        </div>

        <div>
          <span className="text-slate-500 block text-[11px]">Split Count</span>
          <span className="text-slate-200 font-semibold">{typedResult?.splitCount ?? 0} Splits</span>
        </div>

        <div className="col-span-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 text-[11px]">SHA-256 Checksum</span>
            <button
              onClick={handleCopyChecksum}
              className="text-[10px] text-blue-400 hover:underline cursor-pointer"
            >
              {copiedChecksum ? 'Copied!' : 'Copy SHA-256'}
            </button>
          </div>
          <span className="text-slate-300 font-mono text-[11px] break-all block">
            {checksum}
          </span>
        </div>

        {artifact.expiresAt && (
          <div className="col-span-2">
            <span className="text-slate-500 block text-[11px]">Expires At</span>
            <span className="text-slate-400 text-xs">
              {new Date(artifact.expiresAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        {!isDeleted && onDelete && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setIsDeleteModalOpen(true)}
          >
            Delete Artifact
          </Button>
        )}

        <Button
          variant="primary"
          size="md"
          onClick={handleDownload}
          disabled={downloading || isExpired || isDeleted}
          isLoading={downloading}
          leftIcon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          }
        >
          Download Artifact (ZIP)
        </Button>
      </div>

      {/* Delete Confirmation Modal */}
      {onDelete && (
        <ConfirmActionModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          title="Delete Artifact File"
          subtitle={`Permanently remove storage archive: ${artifact.fileName}`}
          actionType="delete"
          targetId={artifact.id}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
};
