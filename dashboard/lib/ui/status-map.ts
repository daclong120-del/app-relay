// AppRelay Status & Stage Semantic UI Mapping

import { ReleaseOpsJobStatus } from '../../types/release-ops';

export interface StatusConfig {
  label: string;
  badgeStyle: string; // Tailwind classes
  dotColor: string;
  tone: 'emerald' | 'amber' | 'rose' | 'purple' | 'blue' | 'slate';
  pulse?: boolean;
}

export const APP_RELAY_STATUS_MAP: Record<ReleaseOpsJobStatus, StatusConfig> = {
  queued: {
    label: 'Queued',
    badgeStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    dotColor: 'bg-amber-400',
    tone: 'amber',
  },
  claimed: {
    label: 'Assigned',
    badgeStyle: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    dotColor: 'bg-blue-400',
    tone: 'blue',
  },
  running: {
    label: 'Running',
    badgeStyle: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    dotColor: 'bg-blue-400',
    tone: 'blue',
    pulse: true,
  },
  succeeded: {
    label: 'Completed',
    badgeStyle: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    dotColor: 'bg-emerald-400',
    tone: 'emerald',
  },
  failed: {
    label: 'Failed',
    badgeStyle: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    dotColor: 'bg-rose-400',
    tone: 'rose',
  },
  retrying: {
    label: 'Retrying',
    badgeStyle: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    dotColor: 'bg-purple-400',
    tone: 'purple',
    pulse: true,
  },
  dead_letter: {
    label: 'Dead Letter',
    badgeStyle: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    dotColor: 'bg-rose-400',
    tone: 'rose',
  },
  cancelled: {
    label: 'Cancelled',
    badgeStyle: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    dotColor: 'bg-slate-400',
    tone: 'slate',
  },
  expired: {
    label: 'Expired',
    badgeStyle: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
    dotColor: 'bg-slate-400',
    tone: 'slate',
  },
};

export interface StageConfig {
  label: string;
  iconName: string;
  tone: 'blue' | 'purple' | 'emerald' | 'amber' | 'slate';
}

export const APP_RELAY_STAGE_MAP: Record<string, StageConfig> = {
  scraping_listing: {
    label: 'Scraping Google Play Listing',
    iconName: 'search',
    tone: 'blue',
  },
  preparing_device: {
    label: 'Preparing ADB Device Profile',
    iconName: 'smartphone',
    tone: 'purple',
  },
  installing_app: {
    label: 'Installing App Package',
    iconName: 'download',
    tone: 'blue',
  },
  pulling_apks: {
    label: 'Extracting Split APKs',
    iconName: 'zap',
    tone: 'blue',
  },
  validating_apks: {
    label: 'Validating Checksum & Manifest',
    iconName: 'shield-check',
    tone: 'purple',
  },
  packaging_zip: {
    label: 'Packaging ZIP Archive',
    iconName: 'archive',
    tone: 'purple',
  },
  uploading_artifact: {
    label: 'Uploading to Storage',
    iconName: 'cloud-upload',
    tone: 'emerald',
  },
  cleaning_up: {
    label: 'Cleaning Worker Workdir',
    iconName: 'trash',
    tone: 'slate',
  },
};
