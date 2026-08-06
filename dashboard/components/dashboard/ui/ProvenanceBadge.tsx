// SinoMedia Dashboard — ProvenanceBadge UI Primitive (Lutech Style)

import React from 'react';
import { ProvenanceSource, PROVENANCE_MAP } from '../../../lib/ui/provenance-map';

export interface ProvenanceBadgeProps {
  source: ProvenanceSource;
  customLabel?: string;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({ source, customLabel }) => {
  const config = PROVENANCE_MAP[source] || {
    label: source,
    badgeStyle: 'bg-slate-800 text-slate-400 border-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-xs text-[10px] font-mono uppercase tracking-wider border ${config.badgeStyle}`}
    >
      {customLabel || config.label}
    </span>
  );
};
