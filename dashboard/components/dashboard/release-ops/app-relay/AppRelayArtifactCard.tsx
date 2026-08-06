// AppRelay Downloadable Artifact Card Component

import React, { useState } from 'react';
import { AppRelayArtifact, PullApkJobResultV1 } from '../../../../types/release-ops';

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
  const [deleting, setDeleting] = useState(false);

  if (!artifact) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center text-slate-400 text-xs">
        No storage artifact generated for this job yet.
      </div>
    );
  }

  const isExpired = artifact.expiresAt ? new Date(artifact.expiresAt) < new Date() : false;
  const isDeleted = Boolean(artifact.deletedAt);
  const sizeMb = (artifact.sizeBytes / (1024 * 1024)).toFixed(2);
  const typedResult = result as PullApkJobResultV1;

  const handleDownload = async () => {
    if (!onDownload || downloading || isExpired || isDeleted) return;
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || deleting || isDeleted) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            📦
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{artifact.fileName}</h3>
            <p className="text-xs text-slate-400">Private Supabase Storage Archive</p>
          </div>
        </div>

        {isDeleted ? (
          <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded text-xs">Deleted</span>
        ) : isExpired ? (
          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-xs">Expired</span>
        ) : (
          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-xs">Available</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 text-xs bg-slate-950/60 border border-slate-800 p-4 rounded-lg mb-4">
        <div>
          <span className="text-slate-500 block">Archive Size</span>
          <span className="text-slate-200 font-mono font-medium">{sizeMb} MB</span>
        </div>

        <div>
          <span className="text-slate-500 block">Split Count</span>
          <span className="text-slate-200 font-mono font-medium">{typedResult?.splitCount ?? 0} Splits</span>
        </div>

        <div className="col-span-2">
          <span className="text-slate-500 block">SHA-256 Checksum</span>
          <span className="text-slate-300 font-mono text-[11px] break-all">
            {artifact.checksum || typedResult?.archiveSha256 || 'N/A'}
          </span>
        </div>

        {artifact.expiresAt && (
          <div className="col-span-2">
            <span className="text-slate-500 block">Expires At</span>
            <span className="text-slate-400 font-mono text-xs">
              {new Date(artifact.expiresAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end space-x-3">
        {!isDeleted && onDelete && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/40 border border-rose-500/30 text-rose-400 text-xs font-medium rounded-lg transition-all"
          >
            {deleting ? 'Deleting...' : 'Delete Artifact'}
          </button>
        )}

        <button
          onClick={handleDownload}
          disabled={downloading || isExpired || isDeleted}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow-lg shadow-emerald-600/20 transition-all flex items-center space-x-2"
        >
          <span>⬇️</span>
          <span>{downloading ? 'Generating Signed Link...' : 'Download Artifact (ZIP)'}</span>
        </button>
      </div>
    </div>
  );
};
