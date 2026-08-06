// AppRelay Job Progress Event Timeline Component (Lutech UI Style)

import React from 'react';
import { AppRelayJobEvent } from '../../../../types/release-ops';
import { APP_RELAY_STAGE_MAP } from '../../../../lib/ui/status-map';
import { ProvenanceBadge } from '../../ui/ProvenanceBadge';

export interface AppRelayTimelineProps {
  events: AppRelayJobEvent[];
}

export const AppRelayTimeline: React.FC<AppRelayTimelineProps> = ({ events }) => {
  const getStageLabel = (stage: string) => {
    return APP_RELAY_STAGE_MAP[stage]?.label || stage.replace(/_/g, ' ');
  };

  const getLevelStyle = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
      case 'warn':
        return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      case 'info':
      default:
        return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
    }
  };

  if (!events || events.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 text-center text-slate-400 text-xs">
        No progress events recorded for this job yet.
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-6 shadow-xl backdrop-blur-xs space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
          Execution Timeline & Event Trace
        </h3>
        <ProvenanceBadge source="supabase_realtime" customLabel="API Polling" />
      </div>

      <div className="space-y-4 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
        {events.map((ev, i) => (
          <div key={ev.id || i} className="relative flex items-start space-x-4 pl-10">
            <div className={`absolute left-2 top-1 w-5 h-5 -translate-x-1/2 rounded-full border flex items-center justify-center text-[10px] ${getLevelStyle(ev.level)}`}>
              •
            </div>

            <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded-md p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-blue-400 capitalize">
                  {getStageLabel(ev.stage)}
                </span>
                <span className="text-slate-500 font-mono text-[11px]">
                  {new Date(ev.createdAt).toLocaleTimeString()}
                </span>
              </div>

              <p className="text-xs text-slate-200">{ev.message}</p>

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
