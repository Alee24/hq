import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rect' | 'circle' | 'card' | 'table';
  count?: number;
}

export const SkeletonLoader: React.FC<SkeletonProps> = ({
  variant = 'rect',
  count = 1,
  className = '',
  ...props
}) => {
  const baseClasses = 'animate-pulse bg-slate-800/80 rounded';

  if (variant === 'table') {
    return (
      <div className="space-y-3 w-full" role="status" aria-label="Loading data">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between p-3.5 rounded-lg border border-slate-800 bg-slate-900/60 gap-4"
          >
            <div className="h-4 w-1/4 bg-slate-800 rounded animate-pulse" />
            <div className="h-4 w-1/6 bg-slate-800 rounded animate-pulse hidden sm:block" />
            <div className="h-4 w-1/5 bg-slate-800 rounded animate-pulse hidden md:block" />
            <div className="h-4 w-16 bg-slate-800 rounded animate-pulse" />
          </div>
        ))}
        <span className="sr-only">Loading table content...</span>
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 space-y-4"
        role="status"
        aria-label="Loading card"
      >
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-slate-800 rounded animate-pulse" />
          <div className="h-6 w-14 bg-slate-800 rounded-full animate-pulse" />
        </div>
        <div className="h-8 w-24 bg-slate-800 rounded animate-pulse" />
        <div className="h-3 w-48 bg-slate-800/60 rounded animate-pulse" />
        <span className="sr-only">Loading card content...</span>
      </div>
    );
  }

  if (variant === 'circle') {
    return (
      <div
        className={`rounded-full animate-pulse bg-slate-800 ${className}`}
        role="status"
        {...props}
      >
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (variant === 'text') {
    return (
      <div className="space-y-2" role="status">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className={`h-3.5 bg-slate-800 rounded animate-pulse ${
              i === count - 1 ? 'w-2/3' : 'w-full'
            } ${className}`}
          />
        ))}
        <span className="sr-only">Loading text...</span>
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} ${className}`}
      role="status"
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};
