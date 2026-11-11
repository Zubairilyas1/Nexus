'use client';

import * as React from 'react';
import { RefreshCw, Download, Flame, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Label } from '@/components/ui/Label';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, EmptyState, ErrorState } from '@/components/common';
import { fetchJson } from '@/lib/api';

interface HeatmapPoint {
  grid_x: number;
  grid_y: number;
  count: number;
  avg_speed: number;
  avg_dwell_ms: number;
  vehicle_distribution: Record<string, number>;
  violations: number;
}

interface HeatmapData {
  zone_id: string;
  grid_size: number;
  metric: string;
  data: HeatmapPoint[];
  bounds: { min_x: number; max_x: number; min_y: number; max_y: number };
  total_count: number;
  max_value: number;
}

interface ZoneInfo {
  zone_id: string;
  label: string;
  coordinates: { x: number; y: number }[];
}

const METRICS = [
  { value: 'count', label: 'Vehicle Count' },
  { value: 'speed', label: 'Avg Speed' },
  { value: 'dwell', label: 'Dwell Time' },
  { value: 'violations', label: 'Violations' },
];

const TIME_RANGES = [
  { value: '15m', label: 'Last 15 min', minutes: 15 },
  { value: '1h', label: 'Last hour', minutes: 60 },
  { value: '6h', label: 'Last 6 hours', minutes: 360 },
  { value: '24h', label: 'Last 24 hours', minutes: 1440 },
];

function metricValue(point: HeatmapPoint, metric: string): number {
  switch (metric) {
    case 'speed':
      return point.avg_speed;
    case 'dwell':
      return point.avg_dwell_ms;
    case 'violations':
      return point.violations;
    default:
      return point.count;
  }
}

// Cyan → green → yellow → red intensity ramp
function intensityColor(ratio: number): string {
  const r = Math.min(Math.max(ratio, 0), 1);
  if (r < 0.25) return `rgba(6, 182, 212, ${0.25 + r * 1.4})`;
  if (r < 0.5) return `rgba(34, 197, 94, ${0.35 + (r - 0.25) * 1.6})`;
  if (r < 0.75) return `rgba(234, 179, 8, ${0.45 + (r - 0.5) * 1.6})`;
  return `rgba(239, 68, 68, ${0.55 + (r - 0.75) * 1.6})`;
}

export default function HeatmapPage() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [zones, setZones] = React.useState<ZoneInfo[]>([]);
  const [zoneId, setZoneId] = React.useState<string>('');
  const [metric, setMetric] = React.useState('count');
  const [timeRange, setTimeRange] = React.useState('24h');
  const [gridSize, setGridSize] = React.useState(50);
  const [opacity, setOpacity] = React.useState(80);
  const [heatmap, setHeatmap] = React.useState<HeatmapData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = React.useState(false);

  React.useEffect(() => {
    fetchJson<ZoneInfo[]>('/api/zones')
      .then((data) => {
        setZones(data);
        if (data.length > 0 && !zoneId) setZoneId(data[0]!.zone_id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load zones'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchHeatmap = React.useCallback(async () => {
    if (!zoneId) return;
    setIsLoading(true);
    setError(null);
    try {
      const minutes = TIME_RANGES.find((t) => t.value === timeRange)?.minutes ?? 1440;
      const end = new Date();
      const start = new Date(end.getTime() - minutes * 60_000);
      const params = new URLSearchParams({
        zone_id: zoneId,
        metric,
        grid_size: String(gridSize),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      const data = await fetchJson<HeatmapData>(`/api/analytics/heatmap?${params}`);
      setHeatmap(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load heatmap');
    } finally {
      setIsLoading(false);
    }
  }, [zoneId, metric, gridSize, timeRange]);

  React.useEffect(() => {
    if (zoneId) fetchHeatmap();
  }, [zoneId, metric, gridSize, timeRange, fetchHeatmap]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHeatmap, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHeatmap]);

  const zone = zones.find((z) => z.zone_id === zoneId);

  // Paint the heatmap canvas whenever data or settings change
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmap) return;

    const parent = canvas.parentElement;
    if (!parent) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { min_x, max_x, min_y, max_y } = heatmap.bounds;
    const spanX = Math.max(max_x - min_x, 1);
    const spanY = Math.max(max_y - min_y, 1);
    const scale = Math.min(width / spanX, height / spanY);
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (height - spanY * scale) / 2;
    const toCanvas = (x: number, y: number): [number, number] => [
      offsetX + (x - min_x) * scale,
      offsetY + (y - min_y) * scale,
    ];

    // Zone polygon outline for spatial context
    if (zone && zone.coordinates.length >= 3) {
      ctx.beginPath();
      zone.coordinates.forEach((p, i) => {
        const [cx, cy] = toCanvas(p.x, p.y);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Heat cells
    const maxValue = Math.max(heatmap.max_value, 0.0001);
    ctx.globalAlpha = opacity / 100;
    for (const point of heatmap.data) {
      const value = metricValue(point, metric);
      if (value <= 0) continue;
      const ratio = value / maxValue;
      const cellCenterX = min_x + (point.grid_x + 0.5) * heatmap.grid_size;
      const cellCenterY = min_y + (point.grid_y + 0.5) * heatmap.grid_size;
      const [cx, cy] = toCanvas(cellCenterX, cellCenterY);
      const cellW = Math.max(heatmap.grid_size * scale, 10);
      const radius = cellW * 0.7;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, intensityColor(ratio));
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [heatmap, opacity, metric, zone]);

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `heatmap-${zoneId}-${metric}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const exportCsv = () => {
    if (!heatmap) return;
    const headers = ['grid_x', 'grid_y', 'count', 'avg_speed', 'avg_dwell_ms', 'violations'];
    const rows = heatmap.data.map((p) =>
      [p.grid_x, p.grid_y, p.count, p.avg_speed, p.avg_dwell_ms, p.violations].join(',')
    );
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `heatmap-${zoneId}-${metric}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasData = (heatmap?.total_count ?? 0) > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Heatmap"
          description="Spatial density of traffic events within a zone"
          actions={
            <Badge variant={autoRefresh ? 'success' : 'secondary'} className="gap-1.5">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  autoRefresh ? 'animate-pulse bg-status-online' : 'bg-status-warning'
                )}
              />
              {autoRefresh ? 'Live (30s)' : 'Paused'}
            </Badge>
          }
        />

        {zones.length === 0 && !isLoading ? (
          <Card>
            <EmptyState
              icon={Flame}
              title="No zones configured"
              description="Create zones in the Zone Designer to visualize traffic density."
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            {/* Controls */}
            <Card className="w-full shrink-0 lg:w-72">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Layers className="h-4 w-4 text-primary" />
                  Controls
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Zone</Label>
                  <Select value={zoneId} onValueChange={setZoneId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select zone" />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((z) => (
                        <SelectItem key={z.zone_id} value={z.zone_id}>
                          {z.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Metric</Label>
                  <Select value={metric} onValueChange={setMetric}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METRICS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Time range</Label>
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_RANGES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Grid size: {gridSize}px</Label>
                  <Slider
                    value={[gridSize]}
                    onValueChange={(v) => setGridSize(v[0] ?? gridSize)}
                    min={25}
                    max={200}
                    step={25}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Opacity: {opacity}%</Label>
                  <Slider
                    value={[opacity]}
                    onValueChange={(v) => setOpacity(v[0] ?? opacity)}
                    min={10}
                    max={100}
                    step={10}
                  />
                </div>

                <div className="space-y-2 border-t border-border pt-4">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="text-sm">Auto refresh (30s)</span>
                  </label>
                </div>

                <div className="flex flex-col gap-2 border-t border-border pt-4">
                  <Button onClick={fetchHeatmap} disabled={isLoading || !zoneId}>
                    <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                    Refresh now
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={exportPng} disabled={!hasData}>
                      <Download className="h-4 w-4" />
                      PNG
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1" onClick={exportCsv} disabled={!hasData}>
                      <Download className="h-4 w-4" />
                      CSV
                    </Button>
                  </div>
                </div>

                {/* Legend */}
                <div className="border-t border-border pt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Intensity</p>
                  <div
                    className="h-3 w-full rounded-full"
                    style={{
                      background:
                        'linear-gradient(90deg, rgba(6,182,212,0.35), rgba(34,197,94,0.5), rgba(234,179,8,0.7), rgba(239,68,68,0.9))',
                    }}
                  />
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>Low</span>
                    <span>
                      Max{' '}
                      {heatmap
                        ? metric === 'dwell'
                          ? `${Math.round(heatmap.max_value / 1000)}s`
                          : metric === 'speed'
                            ? heatmap.max_value.toFixed(1)
                            : Math.round(heatmap.max_value).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Canvas */}
            <Card className="min-w-0 flex-1">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">{zone?.label ?? 'Zone'}</CardTitle>
                  <CardDescription>
                    {heatmap ? `${heatmap.total_count.toLocaleString()} events • ${heatmap.data.length} active cells` : 'Loading…'}
                    {lastUpdated ? ` • updated ${lastUpdated.toLocaleTimeString()}` : ''}
                  </CardDescription>
                </div>
                {heatmap ? <Badge variant="outline">{heatmap.grid_size}px grid</Badge> : null}
              </CardHeader>
              <CardContent>
                {error ? (
                  <ErrorState title="Could not load heatmap" description={error} onRetry={fetchHeatmap} />
                ) : (
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-[linear-gradient(180deg,#09090b_0%,#111827_100%)]">
                    <canvas ref={canvasRef} className="absolute inset-0" />
                    {!isLoading && !hasData ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
                        <EmptyState
                          icon={Flame}
                          title="No events in this period"
                          description="No traffic events recorded for this zone in the selected time range."
                          className="py-8"
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
