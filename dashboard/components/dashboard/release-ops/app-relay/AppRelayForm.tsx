// AppRelay URL Submission Form Component (Lutech UI Style)

import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import { TextInput } from '../../ui/TextInput';
import { DropdownSelect } from '../../ui/DropdownSelect';
import { ProvenanceBadge } from '../../ui/ProvenanceBadge';

export interface AppRelayFormProps {
  onSubmit: (data: { playUrl: string; locale: string }) => Promise<void>;
  loading?: boolean;
}

export const AppRelayForm: React.FC<AppRelayFormProps> = ({ onSubmit, loading = false }) => {
  const [url, setUrl] = useState('');
  const [locale, setLocale] = useState('en');
  const [detectedPackageId, setDetectedPackageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const localeOptions = [
    { value: 'en', label: 'English (en)' },
    { value: 'vi', label: 'Vietnamese (vi)' },
    { value: 'ja', label: 'Japanese (ja)' },
  ];

  const handleUrlChange = (val: string) => {
    setUrl(val);
    setError(null);

    try {
      if (val.includes('play.google.com/store/apps/details')) {
        const u = new URL(val.trim());
        const pkg = u.searchParams.get('id');
        if (pkg) {
          setDetectedPackageId(pkg);
          const hl = u.searchParams.get('hl');
          if (hl) setLocale(hl);
          return;
        }
      }
    } catch {}
    setDetectedPackageId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('Please enter a valid Google Play Store URL.');
      return;
    }

    if (!url.includes('play.google.com/store/apps/details')) {
      setError('URL must be an official Google Play Store app details link.');
      return;
    }

    try {
      await onSubmit({ playUrl: url.trim(), locale });
      setUrl('');
      setDetectedPackageId(null);
    } catch (err: any) {
      setError(err.message || 'Failed to submit job.');
    }
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl backdrop-blur-xs mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-blue-400">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Extract APK Artifacts (Google Play)</h2>
            <p className="text-xs text-slate-400">
              Enter a Google Play Store URL to dispatch an ADB worker for full APK split & listing extraction.
            </p>
          </div>
        </div>

        <ProvenanceBadge source="google_play" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <TextInput
            label="Google Play Store App URL"
            type="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            placeholder="https://play.google.com/store/apps/details?id=com.example.app&hl=en"
            disabled={loading}
            mono={true}
            rightElement={
              detectedPackageId ? (
                <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] rounded font-mono font-medium">
                  ID: {detectedPackageId}
                </span>
              ) : undefined
            }
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-2">
          <div className="flex items-center gap-4 text-xs text-slate-400 min-w-[220px]">
            <DropdownSelect
              label="Extraction Locale"
              options={localeOptions}
              value={locale}
              onChange={(val) => setLocale(val)}
              size="sm"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !url.trim()}
            isLoading={loading}
            leftIcon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            }
          >
            Dispatch Acquisition Job
          </Button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-md flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}
      </form>
    </div>
  );
};
