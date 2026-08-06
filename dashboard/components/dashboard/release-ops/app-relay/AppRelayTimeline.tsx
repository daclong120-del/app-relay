// AppRelay Job Progress Event Timeline Component

import React from 'react';
import { AppRelayJobEvent } from '../../../../types/release-ops';

export interface AppRelayTimelineProps {
  events: AppRelayJobEvent[];
}

export const AppRelayTimeline: React.FC<AppRelayTimelineProps> = ({ events }) => {
  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'scraping_listing':
        return '🔍';
      case 'preparing_device':
        return '📱';
      case 'installing_app':
        return '📥';
      case 'pulling_apks':
        return '⚡';
      case 'validating_apks':
        return '🛡️';
      case 'packaging_zip':
        return '📦';
      case 'uploading_artifact':
        return '☁️';
      case 'cleaning_up':
        return '🧹';
      default:
        return '📌';
    }
  };

  if (!events || events.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center text-slate-400 text-xs">
        No progress events recorded yet.
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 shadow-xl backdrop-blur-md">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Execution Progress & Timeline</h3>

      <div className="space-y-4 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
        {events.map((ev, i) => (
          <div key={ev.id || i} className="relative flex items-start space-x-4 pl-10">
            <div className="absolute left-2 top-0.5 w-5 h-5 -translate-x-1/2 rounded-full bg-slate-950 border border-slate-700 flex items-center justify-center text-xs">
              {getStageIcon(ev.stage)}
            </div>

            <div className="flex-1 bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-mono text-blue-400 font-medium capitalize">
                  {ev.stage.replace(/_/g, ' ')}
                </span>
                <span className="text-slate-500 font-mono">
                  {new Date(ev.createdAt).toLocaleTimeString()}
                </span>
              </div>

              <p className="text-xs text-slate-300 mb-2">{ev.message}</p>

              {ev.progress > 0 && (
                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, ev.progress)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
