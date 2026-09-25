'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import Link from 'next/link';
import {
  BarChart3,
  MapPin,
  Route,
  Brain,
  TrendingUp,
  Activity,
  Car,
  RefreshCw,
  Box,
  Flame,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, StatCard, EmptyState, ErrorState } from '@/components/common';
import { fetchJson } from '@/lib/api';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';

interface AnalyticsSummary {
  total_vehicles_24h: number;
  active_zones: number;
  total_zones: number;
  avg_congestion: number;
  top_zones: { zone_id: string; event_count: number }[];
  hourly_trend: { hour: string; count: number }[];
}

const SUB_PAGES = [
  {
    href: '/analytics/heatmap',
    title: 'Heatmap',
    description: 'Spatial density of traffic events per zone',
    icon: Flame,
  },
  {
    href: '/analytics/trajectories',
    title: 'Trajectories',
    description: 'Vehicle paths and travel patterns',
    icon: Route,
  },
  {
    href: '/analytics/od-matrix',
    title: 'O-D Matrix',
    description: 'Origin-destination flow analysis',
    icon: Box,
  },
  {
    href: '/analytics/predictions',
    title: 'Predictions',
    description: 'Congestion forecasting per zone',
    icon: Brain,
  },
  {
    href: '/analytics/3d',
    title: '3D View',
    description: 'Spatial visualization of zones and traffic',
    icon: TrendingUp,
  },
];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm shadow-elevation-3">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-muted-foreground tabular-nums">{payload[0]?.value.toLocaleString()} events</p>
    </div>
  );
}

export default function AnalyticsPage() {
  const [summary, setSummary] = React.useState<AnalyticsSummary | null>(null);
  const [zoneLabels, setZoneLabels] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchSummary = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchJson<AnalyticsSummary>('/api/analytics/summary');
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics summary');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  React.useEffect(() => {
    fetchJson<{ zone_id: string; label: string }[]>('/api/zones')
      .then((zones) => {
        const map: Record<string, string> = {};
        for (const z of zones) map[z.zone_id] = z.label;
        setZoneLabels(map);
      })
      .catch(() => {
        // cosmetic fallback: zone ids render
      });
  }, []);

  const label = (id: string) => zoneLabels[id] || id;
  const hasEvents = (summary?.total_vehicles_24h ?? 0) > 0;
  const maxZoneCount = summary?.top_zones?.[0]?.event_count ?? 1;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Analytics"
          description="Traffic analytics across all zones — last 24 hours"
          actions={
            <Button variant="outline" size="sm" onClick={fetchSummary} disabled={isLoading}>
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          }
        />

        {error ? (
          <Card>
            <ErrorState title="Could not load analytics" description={error} onRetry={fetchSummary} />
          </Card>
        ) : (
          <>
            {/* Metric cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Vehicles (24h)"
                value={summary ? summary.total_vehicles_24h.toLocaleString() : '—'}
                icon={Car}
                tone="primary"
                loading={isLoading}
                hint="Distinct traffic events recorded"
              />
              <StatCard
                label="Active Zones"
                value={summary ? `${summary.active_zones} / ${summary.total_zones}` : '—'}
                icon={MapPin}
                tone="success"
                loading={isLoading}
                hint="Zones with events in the last 24h"
              />
              <StatCard
                label="Avg Congestion"
                value={summary ? `${Math.round(summary.avg_congestion * 100)}%` : '—'}
                icon={Activity}
                tone={(summary?.avg_congestion ?? 0) > 0.7 ? 'destructive' : 'warning'}
                loading={isLoading}
                hint="Mean across top zones"
              />
              <StatCard
                label="Zones Monitored"
                value={summary ? summary.total_zones.toLocaleString() : '—'}
                icon={BarChart3}
                loading={isLoading}
                hint="Total configured zones"
              />
            </div>

            {/* Hourly trend */}
            <Card>
              <CardHeader>
                <CardTitle>Hourly Trend</CardTitle>
                <CardDescription>Traffic events per hour, last 24 hours</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-64 animate-pulse rounded-lg bg-muted/40" />
                ) : !hasEvents ? (
                  <EmptyState
                    icon={Activity}
                    title="No events recorded yet"
                    description="Analytics populate as vehicles are detected in your zones. Start a stream with a loaded detection model to begin."
                  />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={summary?.hourly_trend ?? []} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                        <defs>
                          <linearGradient id="hourlyFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                          dataKey="hour"
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                          axisLine={{ stroke: 'hsl(var(--border))' }}
                          tickLine={false}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <RechartsTooltip content={<ChartTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          fill="url(#hourlyFill)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Top zones */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Zones</CardTitle>
                  <CardDescription>Highest event volume in the last 24 hours</CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />
                      ))}
                    </div>
                  ) : !summary || summary.top_zones.length === 0 ? (
                    <EmptyState
                      icon={MapPin}
                      title="No zone activity"
                      description="Once events are recorded, the busiest zones appear here."
                    />
                  ) : (
                    <div className="space-y-3">
                      {summary.top_zones.map((zone) => {
                        const ratio = zone.event_count / Math.max(maxZoneCount, 1);
                        return (
                          <div key={zone.zone_id} className="flex items-center gap-3">
                            <span className="w-32 truncate text-sm font-medium">{label(zone.zone_id)}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(ratio * 100, 2)}%` }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                className="h-full rounded-full bg-primary"
                              />
                            </div>
                            <span className="w-14 text-right text-sm tabular-nums text-muted-foreground">
                              {zone.event_count.toLocaleString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Sub-page navigation */}
              <Card>
                <CardHeader>
                  <CardTitle>Explore</CardTitle>
                  <CardDescription>Deep-dive into specific analytics views</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {SUB_PAGES.map((page) => {
                    const Icon = page.icon;
                    return (
                      <Link
                        key={page.href}
                        href={page.href}
                        className="group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/50"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{page.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{page.description}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
