// Release Ops Top Navigation Tabs Component

import React from 'react';

export interface ReleaseOpsNavTabsProps {
  activeTab: 'overview' | 'app-relay' | 'releases' | 'workers' | 'audits';
  onTabChange?: (tab: string) => void;
}

export const ReleaseOpsNavTabs: React.FC<ReleaseOpsNavTabsProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'app-relay', label: 'AppRelay (APK Extractor)', icon: '📦' },
    { id: 'releases', label: 'Releases', icon: '🚀' },
    { id: 'workers', label: 'Worker Fleet', icon: '🤖' },
    { id: 'audits', label: 'Audit Logs', icon: '📜' },
  ];

  return (
    <nav className="flex space-x-2 border-b border-slate-700/60 pb-3 mb-6">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange?.(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              isActive
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
