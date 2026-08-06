// Next.js App Router Suspense Boundary Loading Route Segment (0ms instant transition)

import React from 'react';
import { Skeleton } from '../../../../../components/dashboard/ui/Skeleton';

export default function AppRelayLoading() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Top Animated Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-slate-900 z-50 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-orange-500 via-blue-500 to-emerald-500 animate-pulse w-full" />
      </div>

      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>

      {/* Nav Tabs Skeleton */}
      <div className="flex space-x-2 border-b border-slate-800 pb-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-32" />
      </div>

      {/* Summary Health Strip Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>

      {/* Main Submit Form Skeleton */}
      <Skeleton className="h-48 w-full rounded-lg" />

      {/* Job Table Skeleton */}
      <Skeleton className="h-80 w-full rounded-lg" />
    </div>
  );
}
