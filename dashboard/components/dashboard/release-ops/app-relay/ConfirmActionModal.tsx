// AppRelay Safety-Gated Confirm Action Modal Component (Lutech UI Style)

import React, { useState } from 'react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';

export interface ConfirmActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  actionType: 'cancel' | 'retry' | 'delete';
  targetId: string;
  onConfirm: () => Promise<void>;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  actionType,
  targetId,
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to complete action.');
    } finally {
      setLoading(false);
    }
  };

  const getButtonVariant = () => {
    switch (actionType) {
      case 'cancel':
      case 'delete':
        return 'danger';
      case 'retry':
        return 'primary';
      default:
        return 'primary';
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle || `Target Identifier: #${targetId}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={getButtonVariant()} onClick={handleConfirm} isLoading={loading}>
            Confirm Action
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-md font-mono text-[11px] text-slate-300">
          <span className="text-slate-500 block mb-1">Target ID</span>
          <span className="text-slate-100 font-bold">{targetId}</span>
        </div>

        {actionType === 'delete' && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-md">
            ⚠️ <strong>Irreversible Action</strong>: Deleting this artifact will immediately invalidate the Storage object and clear associated signed download links.
          </div>
        )}

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-md">
            ⚠️ {error}
          </div>
        )}
      </div>
    </Modal>
  );
};
