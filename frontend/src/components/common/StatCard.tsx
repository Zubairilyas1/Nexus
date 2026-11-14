'use client';

import * as React from 'react';
import { TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

type Tone = 'default' | 'success' | 'warning' | 'destructive' | 'primary';

const toneClasses: Record<Tone, string> = {
  default: 'text-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

const iconToneClasses: Record<Tone, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
};

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  /** Signed percentage change; positive renders green-up, negative red-down. */
  delta?: number | null;
  loading?: boolean;
  tone?: Tone;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  loading = false,
  tone = 'default',
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-5 shadow-elevation-2 transition-shadow duration-300 hover:shadow-elevation-3',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon ? (
          <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', iconToneClasses[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <p className={cn('text-heading-md font-bold tabular-nums', toneClasses[tone])}>{value}</p>
        )}
        {delta != null && !loading ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
              delta >= 0 ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'
            )}
          >
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}%
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-1 text-caption text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
