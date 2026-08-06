// AppRelay Operational Data Provenance Mapping

export type ProvenanceSource =
  | 'google_play'
  | 'worker_live'
  | 'supabase_realtime'
  | 'artifact_storage'
  | 'manual_action';

export interface ProvenanceConfig {
  label: string;
  badgeStyle: string;
}

export const PROVENANCE_MAP: Record<ProvenanceSource, ProvenanceConfig> = {
  google_play: {
    label: 'Google Play',
    badgeStyle: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  worker_live: {
    label: 'Worker Live',
    badgeStyle: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  },
  supabase_realtime: {
    label: 'Supabase Realtime',
    badgeStyle: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  },
  artifact_storage: {
    label: 'Artifact Storage',
    badgeStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  manual_action: {
    label: 'Manual Action',
    badgeStyle: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  },
};
