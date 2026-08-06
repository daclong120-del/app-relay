// AppRelay URL Submission Form Component

import React, { useState } from 'react';

export interface AppRelayFormProps {
  onSubmit: (data: { playUrl: string; locale: string }) => Promise<void>;
  loading?: boolean;
}

export const AppRelayForm: React.FC<AppRelayFormProps> = ({ onSubmit, loading = false }) => {
  const [url, setUrl] = useState('');
  const [locale, setLocale] = useState('en');
  const [detectedPackageId, setDetectedPackageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md mb-8">
      <div className="flex items-center space-x-3 mb-4">
        <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
          ⚡
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Extract APK Artifacts (Google Play)</h2>
          <p className="text-xs text-slate-400">
            Enter a Google Play Store URL to dispatch an ADB worker for full APK split & listing extraction.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Google Play Store App URL
          </label>
          <div className="relative">
            <input
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://play.google.com/store/apps/details?id=com.example.app&hl=en"
              disabled={loading}
              className="w-full bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none transition-all"
            />
            {detectedPackageId && (
              <span className="absolute right-3 top-2.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded font-mono">
                ID: {detectedPackageId}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center space-x-4 text-xs text-slate-400">
            <span>
              Source Policy: <strong className="text-slate-200">Google Play Official</strong>
            </span>
            <span>
              Locale:{' '}
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 rounded px-2 py-1 text-xs"
              >
                <option value="en">English (en)</option>
                <option value="vi">Vietnamese (vi)</option>
                <option value="ja">Japanese (ja)</option>
              </select>
            </span>
          </div>

          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg shadow-lg shadow-blue-600/20 transition-all flex items-center space-x-2"
          >
            {loading ? <span>Dispatching...</span> : <span>Dispatch Acquisition Job</span>}
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-lg">
            ⚠️ {error}
          </div>
        )}
      </form>
    </div>
  );
};
