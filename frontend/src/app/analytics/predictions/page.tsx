'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, StatCard, EmptyState, ErrorState } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Skeleton, SkeletonChart } from '@/components/ui/Skeleton';
import { fetchJson, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  AlertTriangle,
  Clock,
  Activity,
  RefreshCw,
  Zap,
  TrendingUp,
} from 'lucide-react';

interface CongestionPrediction {
  zone_id: string;
  timestamp: string;
  congestion_level: number;
  confidence: number;
  expected_vehicles: number;
}

interface PredictionsResponse {
  zone_id: string;
  horizon_minutes: number;
  predictions: CongestionPrediction[];
  model_version: string;
}

interface ChartEntry {
  time: string;
  timestamp: number;
  [key: string]: number | string;
}

const CONGESTION_COLORS = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

function getCongestionColor(level: number): string {
  if (level < 0.3) return CONGESTION_COLORS.low;
  if (level < 0.6) return CONGESTION_COLORS.medium;
  if (level < 0.8) return CONGESTION_COLORS.high;
  return CONGESTION_COLORS.critical;
}

function getCongestionLabel(level: number): string {
  if (level < 0.3) return 'Low';
  if (level < 0.6) return 'Medium';
  if (level < 0.8) return 'High';
  return 'Critical';
}

export default function PredictionsPage() {
  const [predictions, setPredictions] = React.useState<PredictionsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [horizon, setHorizon] = React.useState('60');
  const [zoneFilter, setZoneFilter] = React.useState('all');
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const fetchPredictions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ horizon });
      if (zoneFilter !== 'all') params.set('zone_id', zoneFilter);
      const data = await fetchJson<PredictionsResponse>(`/api/analytics/predictions/congestion?${params}`);
      setPredictions(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch predictions');
    } finally {
      setLoading(false);
    }
  }, [horizon, zoneFilter]);

  React.useEffect(() => {
    void fetchPredictions();
  }, [fetchPredictions]);

  const chartData = React.useMemo<ChartEntry[]>(() => {
    const all = predictions?.predictions;
    if (!all || all.length === 0) return [];
    const grouped = new Map<string, CongestionPrediction[]>();
    all.forEach((p) => {
      const key = p.zone_id;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)?.push(p);
    });
    const times = all
      .map((p) => new Date(p.timestamp).getTime())
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => a - b);

    return times.map((ts) => {
      const time = new Date(ts);
      const label = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
      const entry: ChartEntry = { time: label, timestamp: ts };
      for (const [zoneId, preds] of grouped) {
        const match = preds.find((p) => new Date(p.timestamp).getTime() === ts);
        if (match) {
          entry[`${zoneId}_level`] = match.congestion_level;
        }
      }
      return entry;
    });
  }, [predictions]);

  const zoneIds = React.useMemo(() => {
    if (!predictions?.predictions) return [];
    return [...new Set(predictions.predictions.map((p) => p.zone_id))];
  }, [predictions]);

  const upcomingAlerts = React.useMemo(() => {
    if (!predictions?.predictions) return [];
    return predictions.predictions
      .filter((p) => p.congestion_level >= 0.7)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(0, 5);
  }, [predictions]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Congestion Predictions"
          description="AI-powered traffic forecasting with configurable time horizons."
          actions={
            <>
              {lastUpdated ? (
                <span className="text-caption text-muted-foreground">Updated {lastUpdated.toLocaleTimeString()}</span>
              ) : null}
              <Button variant="outline" onClick={() => void fetchPredictions()} disabled={loading} className="gap-2">
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
                Refresh
              </Button>
            </>
          }
        />

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted-foreground">Horizon:</span>
            <Select value={horizon} onValueChange={setHorizon}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutes</SelectItem>
                <SelectItem value="30">30 minutes</SelectItem>
                <SelectItem value="60">1 hour</SelectItem>
                <SelectItem value="120">2 hours</SelectItem>
                <SelectItem value="240">4 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted-foreground">Zone:</span>
            <Select value={zoneFilter} onValueChange={setZoneFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Zones</SelectItem>
                {zoneIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {predictions?.model_version ? (
            <Badge variant="outline" className="gap-1.5">
              <Zap className="h-3 w-3" aria-hidden="true" />
              Model: {predictions.model_version}
            </Badge>
          ) : null}
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            <SkeletonChart height={400} />
            <SkeletonChart height={300} />
          </div>
        ) : error ? (
          <Card>
            <ErrorState title="Failed to load predictions" description={error} onRetry={() => void fetchPredictions()} />
          </Card>
        ) : zoneIds.length === 0 ? (
          <Card>
            <EmptyState
              icon={TrendingUp}
              title="No predictions available"
              description="Forecasts are generated from recorded traffic events. Start detection to accumulate data."
            />
          </Card>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <StatCard label="Prediction Horizon" value={`${predictions?.horizon_minutes ?? 0} min`} icon={Clock} tone="primary" />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
                <StatCard label="Zones Monitored" value={zoneIds.length} icon={Activity} tone="success" />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
                <StatCard
                  label="Upcoming Alerts"
                  value={upcomingAlerts.length}
                  icon={AlertTriangle}
                  tone={upcomingAlerts.length > 0 ? 'warning' : 'default'}
                />
              </motion.div>
            </div>

            {/* Congestion timeline chart */}
            {chartData.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card>
                  <CardHeader>
                    <CardTitle>Congestion Forecast Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={400}>
                      <AreaChart data={chartData}>
                        <defs>
                          {zoneIds.map((zoneId, i) => (
                            <linearGradient key={zoneId} id={`grad_${zoneId}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={`hsl(${200 + i * 40}, 85%, 55%)`} stopOpacity={0.3} />
                              <stop offset="95%" stopColor={`hsl(${200 + i * 40}, 85%, 55%)`} stopOpacity={0} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={11}
                          tickLine={false}
                          domain={[0, 1]}
                          tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                        />
                        <RechartsTooltip
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                          }}
                          formatter={(value: number | string, name: unknown) => {
                            const zoneId = String(name).replace('_level', '');
                            return [`${((value as number) * 100).toFixed(1)}%`, `${zoneId} congestion`];
                          }}
                        />
                        <Legend />
                        <ReferenceLine y={0.7} stroke="hsl(var(--destructive))" strokeDasharray="5 5" label="Alert Threshold" />
                        {zoneIds.map((zoneId, i) => (
                          <Area
                            key={zoneId}
                            type="monotone"
                            dataKey={`${zoneId}_level`}
                            name={zoneId}
                            stroke={`hsl(${200 + i * 40}, 85%, 55%)`}
                            fill={`url(#grad_${zoneId})`}
                            strokeWidth={2}
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            ) : null}

            {/* Upcoming alerts */}
            {upcomingAlerts.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
                      Upcoming Congestion Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {upcomingAlerts.map((alert, i) => {
                        const time = new Date(alert.timestamp);
                        const minutesAway = Math.round((time.getTime() - Date.now()) / 60000);
                        return (
                          <div key={`${alert.zone_id}-${i}`} className="flex items-center justify-between rounded-lg border border-border bg-background/50 p-3">
                            <div className="flex items-center gap-3">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: getCongestionColor(alert.congestion_level) }}
                              />
                              <div>
                                <p className="text-body-sm font-medium">{alert.zone_id}</p>
                                <p className="text-caption text-muted-foreground">
                                  {time.toLocaleTimeString()} ({minutesAway > 0 ? `in ${minutesAway}m` : 'now'})
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="text-body-sm font-bold" style={{ color: getCongestionColor(alert.congestion_level) }}>
                                  {(alert.congestion_level * 100).toFixed(0)}%
                                </p>
                                <p className="text-caption text-muted-foreground">{alert.expected_vehicles} vehicles</p>
                              </div>
                              <Badge variant={alert.congestion_level >= 0.8 ? 'destructive' : 'warning'}>
                                {getCongestionLabel(alert.congestion_level)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : null}

            {/* Zone predictions table */}
            {zoneIds.length > 0 ? (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Card>
                  <CardHeader>
                    <CardTitle>Zone Predictions Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="p-3 text-left text-caption font-medium text-muted-foreground">Zone</th>
                            <th className="p-3 text-left text-caption font-medium text-muted-foreground">Current</th>
                            <th className="p-3 text-left text-caption font-medium text-muted-foreground">Peak</th>
                            <th className="p-3 text-left text-caption font-medium text-muted-foreground">Peak Time</th>
                            <th className="p-3 text-left text-caption font-medium text-muted-foreground">Avg Confidence</th>
                            <th className="p-3 text-left text-caption font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {zoneIds.map((zoneId) => {
                            const zonePreds = predictions?.predictions.filter((p) => p.zone_id === zoneId) ?? [];
                            const current = zonePreds[0];
                            const peak = zonePreds.reduce<CongestionPrediction | null>(
                              (max, p) => (!max || p.congestion_level > max.congestion_level ? p : max),
                              null
                            );
                            const avgConfidence =
                              zonePreds.length > 0 ? zonePreds.reduce((sum, p) => sum + p.confidence, 0) / zonePreds.length : 0;
                            const peakTime = peak ? new Date(peak.timestamp) : null;

                            return (
                              <tr key={zoneId} className="border-b border-border hover:bg-muted/50">
                                <td className="p-3 font-medium">{zoneId}</td>
                                <td className="p-3">
                                  <span style={{ color: getCongestionColor(current?.congestion_level ?? 0) }}>
                                    {((current?.congestion_level ?? 0) * 100).toFixed(1)}%
                                  </span>
                                </td>
                                <td className="p-3">
                                  <span style={{ color: getCongestionColor(peak?.congestion_level ?? 0) }}>
                                    {((peak?.congestion_level ?? 0) * 100).toFixed(1)}%
                                  </span>
                                </td>
                                <td className="p-3 text-muted-foreground">{peakTime ? peakTime.toLocaleTimeString() : '—'}</td>
                                <td className="p-3">
                                  <Badge variant={avgConfidence > 0.8 ? 'success' : 'warning'}>
                                    {(avgConfidence * 100).toFixed(0)}%
                                  </Badge>
                                </td>
                                <td className="p-3">
                                  <Badge
                                    variant={
                                      (peak?.congestion_level ?? 0) >= 0.8
                                        ? 'destructive'
                                        : (peak?.congestion_level ?? 0) >= 0.5
                                          ? 'warning'
                                          : 'success'
                                    }
                                  >
                                    {getCongestionLabel(peak?.congestion_level ?? 0)}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
