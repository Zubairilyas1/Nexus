'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import {
  RefreshCw,
  Download,
  Grid,
  ArrowRight,
  ArrowLeftRight,
  BarChart2,
  Route,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { ScrollArea } from '@/components/ui/ScrollArea';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, EmptyState, ErrorState } from '@/components/common';
import { fetchJson } from '@/lib/api';

interface ODMatrixEntry {
  origin_zone: string;
  destination_zone: string;
  count: number;
  avg_travel_time: number;
  avg_distance: number;
  vehicle_distribution: Record<string, number>;
}

interface ODMatrixData {
  zone_ids: string[];
  matrix: ODMatrixEntry[][];
  time_period: string;
  total_trips: number;
}

const VEHICLE_COLORS: Record<string, string> = {
  car: '#06b6d4',
  truck: '#f97316',
  bus: '#a855f7',
  motorcycle: '#22c55e',
  bicycle: '#eab308',
  pedestrian: '#ec4899',
};

const TIME_PERIODS = [
  { value: 'daily', label: 'Daily Total' },
  { value: 'am_peak', label: 'AM Peak (7-9)' },
  { value: 'pm_peak', label: 'PM Peak (16-18)' },
  { value: 'off_peak', label: 'Off Peak' },
];

type ViewMode = 'matrix' | 'list' | 'flow';

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatDistance(meters: number): string {
  if (!meters) return '—';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function ODMatrixPage() {
  const [odMatrix, setOdMatrix] = React.useState<ODMatrixData | null>(null);
  const [zoneLabels, setZoneLabels] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [timePeriod, setTimePeriod] = React.useState('daily');
  const [selectedPair, setSelectedPair] = React.useState<{ origin: string; dest: string } | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>('matrix');

  const fetchODMatrix = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ time_period: timePeriod });
      const data = await fetchJson<ODMatrixData>(`/api/analytics/od-matrix?${params}`);
      setOdMatrix(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch O-D matrix');
    } finally {
      setIsLoading(false);
    }
  }, [timePeriod]);

  React.useEffect(() => {
    fetchODMatrix();
  }, [fetchODMatrix]);

  React.useEffect(() => {
    fetchJson<{ zone_id: string; label: string }[]>('/api/zones')
      .then((zones) => {
        const map: Record<string, string> = {};
        for (const z of zones) map[z.zone_id] = z.label;
        setZoneLabels(map);
      })
      .catch(() => {
        // zone labels are cosmetic; ids still render
      });
  }, []);

  const label = (id: string) => zoneLabels[id] || id;

  const flatEntries = React.useMemo(() => {
    if (!odMatrix) return [];
    return odMatrix.matrix
      .flat()
      .filter((m) => m.origin_zone !== m.destination_zone)
      .sort((a, b) => b.count - a.count);
  }, [odMatrix]);

  const maxCount = React.useMemo(() => {
    if (flatEntries.length === 0) return 1;
    return Math.max(...flatEntries.map((m) => m.count), 1);
  }, [flatEntries]);

  const selectedEntry = React.useMemo(() => {
    if (!odMatrix || !selectedPair) return null;
    return (
      odMatrix.matrix
        .find((row) => row[0]?.origin_zone === selectedPair.origin)
        ?.find((cell) => cell.destination_zone === selectedPair.dest) ?? null
    );
  }, [odMatrix, selectedPair]);

  const exportCsv = () => {
    if (!odMatrix) return;
    const headers = ['Origin', 'Destination', 'Trips', 'Avg Travel Time (s)', 'Avg Distance (m)', 'Vehicle Distribution'];
    const rows = flatEntries.map((e) => [
      label(e.origin_zone),
      label(e.destination_zone),
      String(e.count),
      String(e.avg_travel_time),
      String(e.avg_distance),
      JSON.stringify(e.vehicle_distribution),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `od-matrix-${timePeriod}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasData = odMatrix != null && odMatrix.total_trips > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="O-D Matrix"
          description="Origin-destination flow analysis computed from zone transitions"
          actions={
            <>
              <Select value={timePeriod} onValueChange={setTimePeriod}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchODMatrix} disabled={isLoading}>
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!hasData}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            </>
          }
        />

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            {(
              [
                { mode: 'matrix', icon: Grid, text: 'Matrix' },
                { mode: 'list', icon: BarChart2, text: 'List' },
                { mode: 'flow', icon: ArrowLeftRight, text: 'Flow' },
              ] as const
            ).map(({ mode, icon: Icon, text }) => (
              <Button
                key={mode}
                variant={viewMode === mode ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode(mode)}
                className="gap-2"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{text}</span>
              </Button>
            ))}
          </div>
          {odMatrix ? (
            <Badge variant="outline" className="ml-auto">
              {odMatrix.total_trips.toLocaleString()} total trips • {odMatrix.zone_ids.length} zones
            </Badge>
          ) : null}
        </div>

        {error ? (
          <Card>
            <ErrorState
              title="Could not load O-D matrix"
              description={error}
              onRetry={fetchODMatrix}
            />
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : !odMatrix || !hasData ? (
          <Card>
            <EmptyState
              icon={Route}
              title="No trips recorded yet"
              description="Origin-destination flows appear once vehicles are tracked moving between zones. Start a stream with a loaded model to generate events."
            />
          </Card>
        ) : (
          <>
            {viewMode === 'matrix' ? (
              <Card>
                <CardHeader>
                  <CardTitle>Origin → Destination</CardTitle>
                  <CardDescription>Click a cell for flow details</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-40">Origin \ Destination</TableHead>
                          {odMatrix.zone_ids.map((id) => (
                            <TableHead key={id} className="text-center">
                              {label(id)}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {odMatrix.zone_ids.map((originId, i) => (
                          <TableRow key={originId}>
                            <TableCell className="text-sm font-medium">{label(originId)}</TableCell>
                            {odMatrix.zone_ids.map((destId, j) => {
                              const entry = odMatrix.matrix[i]?.[j];
                              const isDiagonal = i === j;
                              if (!entry) {
                                return (
                                  <TableCell key={`${originId}-${destId}`} className="text-center text-muted-foreground">
                                    —
                                  </TableCell>
                                );
                              }
                              const intensity = entry.count / maxCount;
                              return (
                                <TableCell
                                  key={`${originId}-${destId}`}
                                  className={cn(
                                    'text-center font-mono text-sm font-medium tabular-nums',
                                    isDiagonal ? 'bg-muted/50' : 'cursor-pointer transition-colors hover:brightness-125'
                                  )}
                                  style={
                                    !isDiagonal && entry.count > 0
                                      ? {
                                          backgroundColor: `hsl(200 70% ${Math.max(30, 80 - intensity * 50)}%)`,
                                          color: intensity > 0.5 ? 'white' : undefined,
                                        }
                                      : undefined
                                  }
                                  onClick={() => {
                                    if (!isDiagonal) setSelectedPair({ origin: originId, dest: destId });
                                  }}
                                >
                                  {isDiagonal ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : entry.count > 0 ? (
                                    <span className="font-bold">{entry.count.toLocaleString()}</span>
                                  ) : (
                                    <span className="text-muted-foreground">0</span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : null}

            {viewMode === 'flow' ? (
              <Card>
                <CardHeader>
                  <CardTitle>Flow Visualization</CardTitle>
                  <CardDescription>Top {Math.min(flatEntries.length, 10)} origin-destination flows</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {flatEntries.slice(0, 10).map((pair, index) => (
                      <motion.div
                        key={`${pair.origin_zone}-${pair.destination_zone}`}
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.04 }}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-5 text-sm font-medium text-muted-foreground tabular-nums">{index + 1}.</span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{label(pair.origin_zone)}</span>
                            <ArrowRight className="h-4 w-4 text-primary" />
                            <span className="font-medium">{label(pair.destination_zone)}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Badge variant="secondary" className="gap-1 tabular-nums">
                            {pair.count.toLocaleString()} trips
                          </Badge>
                          <Badge variant="outline" className="tabular-nums">
                            {formatDuration(pair.avg_travel_time)}
                          </Badge>
                          <Badge variant="outline" className="tabular-nums">
                            {formatDistance(pair.avg_distance)}
                          </Badge>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {viewMode === 'list' ? (
              <Card>
                <CardHeader>
                  <CardTitle>All Flows</CardTitle>
                  <CardDescription>All origin-destination pairs sorted by volume</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rank</TableHead>
                          <TableHead>Origin</TableHead>
                          <TableHead>Destination</TableHead>
                          <TableHead className="text-right">Trips</TableHead>
                          <TableHead className="text-right">Avg Time</TableHead>
                          <TableHead className="text-right">Distance</TableHead>
                          <TableHead>Vehicles</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {flatEntries.map((entry, index) => (
                          <TableRow key={`${entry.origin_zone}-${entry.destination_zone}`}>
                            <TableCell className="font-mono text-muted-foreground tabular-nums">{index + 1}</TableCell>
                            <TableCell className="font-medium">{label(entry.origin_zone)}</TableCell>
                            <TableCell className="font-medium">{label(entry.destination_zone)}</TableCell>
                            <TableCell className="text-right font-mono tabular-nums">{entry.count.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatDuration(entry.avg_travel_time)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatDistance(entry.avg_distance)}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(entry.vehicle_distribution)
                                  .filter(([, count]) => count > 0)
                                  .map(([cls, count]) => (
                                    <Badge key={cls} variant="secondary" className="gap-1 text-xs">
                                      <span
                                        className="h-1.5 w-1.5 rounded-full"
                                        style={{ backgroundColor: VEHICLE_COLORS[cls] ?? '#94a3b8' }}
                                      />
                                      {count}
                                    </Badge>
                                  ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : null}

            {selectedPair && selectedEntry ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Flow Details</CardTitle>
                    <CardDescription>
                      {label(selectedPair.origin)} → {label(selectedPair.dest)}
                    </CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPair(null)}>
                    Close
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-caption uppercase tracking-wider text-muted-foreground">Trips</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">{selectedEntry.count.toLocaleString()}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-caption uppercase tracking-wider text-muted-foreground">Avg Travel Time</p>
                      <p className="mt-1 text-xl font-bold tabular-nums">{formatDuration(selectedEntry.avg_travel_time)}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-caption uppercase tracking-wider text-muted-foreground">Avg Distance</p>
                      <p className="mt-1 text-xl font-bold tabular-nums">{formatDistance(selectedEntry.avg_distance)}</p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <h4 className="mb-2 font-medium">Vehicle Distribution</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedEntry.vehicle_distribution).map(([cls, count]) => (
                        <Badge
                          key={cls}
                          variant="secondary"
                          className="gap-1.5"
                          style={{ borderColor: `${VEHICLE_COLORS[cls] ?? '#94a3b8'}55` }}
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: VEHICLE_COLORS[cls] ?? '#94a3b8' }}
                          />
                          {cls.charAt(0).toUpperCase() + cls.slice(1)}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
