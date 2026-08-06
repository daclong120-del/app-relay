// SinoMedia Dashboard — StatusBadge UI Primitive (Lutech Style)

import React from 'react';
import { ReleaseOpsJobStatus } from '../../../types/release-ops';
import { APP_RELAY_STATUS_MAP } from '../../../lib/ui/status-map';

export interface StatusBadgeProps {
  status: ReleaseOpsJobStatus;
  customLabel?: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, customLabel, size = 'md' }) => {
  const config = APP_RELAY_STATUS_MAP[status] || {
    label: status,
    badgeStyle: 'bg-slate-800 text-slate-300 border-slate-700',
    dotColor: 'bg-slate-400',
    tone: 'slate',
  };

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-xs border ${config.badgeStyle} ${sizeClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor} ${config.pulse ? 'animate-ping' : ''}`} />
      <span>{customLabel || config.label}</span>
    </span>
  );
};
