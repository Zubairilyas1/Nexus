'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, variant = 'text', width, height, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse-slow rounded bg-muted',
        variant === 'circular' && 'rounded-full',
        variant === 'rectangular' && 'rounded-lg',
        className
      )}
      style={{ width, height, ...(props as any).style }}
    />
  );
}

export function SkeletonText({ lines = 3, className, ...props }: { lines?: number; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" width={i === lines - 1 ? '60%' : '100%'} height="1rem" />
      ))}
    </div>
  );
}

export function SkeletonCard({ className, ...props }: { className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card space-y-4 p-4', className)} {...props}>
      <Skeleton variant="rectangular" width="40%" height="1.5rem" />
      <Skeleton variant="rectangular" width="100%" height="4rem" />
      <Skeleton variant="rectangular" width="80%" height="1rem" />
      <Skeleton variant="rectangular" width="60%" height="1rem" />
    </div>
  );
}

export function SkeletonStatCard({ className, ...props }: { className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card p-4 space-y-2', className)} {...props}>
      <Skeleton variant="text" width="50%" height="0.75rem" />
      <Skeleton variant="text" width="30%" height="2rem" />
      <Skeleton variant="text" width="40%" height="0.75rem" />
    </div>
  );
}

export function SkeletonChart({ className, height = 300, ...props }: { className?: string; height?: number } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card p-4', className)} style={{ height }} {...props}>
      <Skeleton variant="text" width="30%" height="1.5rem" />
      <Skeleton variant="rectangular" width="100%" height={height - 60} />
    </div>
  );
}

export function SkeletonZoneList({ count = 5, className, ...props }: { count?: number; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-3 rounded-lg border border-border space-y-2 animate-pulse-slow">
          <Skeleton variant="circular" width="1rem" height="1rem" />
          <Skeleton variant="text" width="60%" height="1rem" />
          <Skeleton variant="text" width="40%" height="0.75rem" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, className, ...props }: { rows?: number; columns?: number; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('w-full overflow-x-auto', className)} {...props}>
      <table className="w-full">
        <thead>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="p-3 text-left">
                <Skeleton variant="text" width="80%" height="1rem" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, row) => (
            <tr key={row}>
              {Array.from({ length: columns }).map((_, col) => (
                <td key={col} className="p-3">
                  <Skeleton variant="text" width="100%" height="1rem" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}