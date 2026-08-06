// SinoMedia Dashboard — MetricCard UI Primitive (Lutech Style)

import React from 'react';
import { ProvenanceSource } from '../../../lib/ui/provenance-map';
import { ProvenanceBadge } from './ProvenanceBadge';

export interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  provenance?: ProvenanceSource;
  trend?: string;
  tone?: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'slate';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  provenance,
  trend,
  tone = 'blue',
}) => {
  const toneStyles = {
    blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
    rose: 'border-rose-500/20 bg-rose-500/5 text-rose-400',
    purple: 'border-purple-500/20 bg-purple-500/5 text-purple-400',
    slate: 'border-slate-700 bg-slate-800/20 text-slate-300',
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-4 shadow-md backdrop-blur-xs flex flex-col justify-between space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
        {provenance && <ProvenanceBadge source={provenance} />}
      </div>

      <div className="flex items-baseline justify-between">
        <div className="flex items-center space-x-3">
          {icon && <div className={`p-2 rounded-md border ${toneStyles[tone]}`}>{icon}</div>}
          <span className="text-2xl font-bold font-mono text-slate-100 tracking-tight">{value}</span>
        </div>

        {trend && <span className="text-xs font-medium text-slate-400 font-mono">{trend}</span>}
      </div>

      {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
    </div>
  );
};
