// SinoMedia Dashboard — Skeleton UI Primitive (Lutech Style)

import React from 'react';

export interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return <div className={`bg-slate-800/60 animate-pulse rounded-md ${className}`} />;
};
