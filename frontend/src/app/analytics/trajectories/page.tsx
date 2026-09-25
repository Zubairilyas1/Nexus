'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  MapPin,
  Clock,
  Search,
  Download,
  RefreshCw,
  Route,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, EmptyState, ErrorState } from '@/components/common';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Slider } from '@/components/ui/Slider';
import { Input } from '@/components/ui/Input';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { fetchJson, ApiError, formatNumber } from '@/lib/api';

interface TrajectoryPoint {
  track_id: string;
  timestamp: string;
  x: number;
  y: number;
  speed: number;
  vehicle_class: string;
  zone_id?: string | null;
}

interface Trajectory {
  track_id: string;
  vehicle_class: string;
  start_time: string;
  end_time: string;
  points: TrajectoryPoint[];
  zones_visited: string[];
  total_distance: number;
  avg_speed: number;
  max_speed: number;
  duration_seconds: number;
}

interface TrajectoriesResponse {
  trajectories: Trajectory[];
  total: number;
  page: number;
  page_size: number;
}

interface ZoneOption {
  zone_id: string;
  label: string;
}

const VEHICLE_CLASSES = ['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'pedestrian'];

const VEHICLE_COLORS: Record<string, string> = {
  car: '#06b6d4',
  truck: '#f97316',
  bus: '#a855f7',
  motorcycle: '#22c55e',
  bicycle: '#eab308',
  pedestrian: '#ec4899',
};

const SPEED_OPTIONS = [0.5, 1, 2, 4];

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '--:--:--' : date.toLocaleTimeString();
}

export default function TrajectoriesPage() {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState({ w: 0, h: 0 });
  const [trajectories, setTrajectories] = React.useState<Trajectory[]>([]);
  const [zones, setZones] = React.useState<ZoneOption[]>([]);
  const [selected, setSelected] = React.useState<Trajectory | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterClass, setFilterClass] = React.useState('all');
  const [filterZone, setFilterZone] = React.useState('all');
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [playbackSpeed, setPlaybackSpeed] = React.useState(1);
  const [currentFrame, setCurrentFrame] = React.useState(0);
  const frameRef = React.useRef(0);

  const fetchTrajectories = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page_size: '100' });
      if (filterClass !== 'all') params.set('vehicle_class', filterClass);
      if (filterZone !== 'all') params.set('zone_id', filterZone);
      const data = await fetchJson<TrajectoriesResponse>(`/api/analytics/trajectories?${params.toString()}`);
      setTrajectories(data.trajectories);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load trajectories.');
    } finally {
      setIsLoading(false);
    }
  }, [filterClass, filterZone]);

  React.useEffect(() => {
    void fetchTrajectories();
  }, [fetchTrajectories]);

  React.useEffect(() => {
    fetchJson<ZoneOption[]>('/api/zones')
      .then((data) => setZones(data))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setView({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Reset selection when the dataset changes; auto-select the first trajectory
  React.useEffect(() => {
    if (trajectories.length === 0) {
      setSelected(null);
      return;
    }
    setSelected((prev) => (prev && trajectories.some((t) => t.track_id === prev.track_id) ? prev : trajectories[0] ?? null));
  }, [trajectories]);

  React.useEffect(() => {
    setCurrentFrame(0);
    frameRef.current = 0;
    setIsPlaying(false);
  }, [selected?.track_id]);

  React.useEffect(() => {
    frameRef.current = currentFrame;
  }, [currentFrame]);

  // Playback loop driven by refs to avoid stale closures
  React.useEffect(() => {
    if (!isPlaying || !selected) return;
    const total = selected.points.length;
    const interval = window.setInterval(
      () => {
        const next = frameRef.current + 1;
        if (next >= total) {
          setIsPlaying(false);
          return;
        }
        frameRef.current = next;
        setCurrentFrame(next);
      },
      Math.max(200 / playbackSpeed, 40)
    );
    return () => window.clearInterval(interval);
  }, [isPlaying, playbackSpeed, selected]);

  const filteredTrajectories = React.useMemo(
    () =>
      trajectories.filter((t) => {
        if (filterClass !== 'all' && t.vehicle_class !== filterClass) return false;
        if (filterZone !== 'all' && !t.zones_visited.includes(filterZone)) return false;
        const q = searchQuery.trim().toLowerCase();
        if (q && !t.track_id.toLowerCase().includes(q) && !t.vehicle_class.toLowerCase().includes(q)) return false;
        return true;
      }),
    [trajectories, filterClass, filterZone, searchQuery]
  );

  // Paint the canvas
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || view.w === 0 || view.h === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = view.w;
    const h = view.h;

    // Background
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    const relevant = selected ? [selected, ...filteredTrajectories.filter((t) => t.track_id !== selected.track_id)] : filteredTrajectories;
    if (relevant.length === 0 || !relevant[0] || relevant[0].points.length < 2) return;

    // Fit bounds across visible trajectories so scale is stable
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const t of relevant) {
      for (const p of t.points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }
    const padX = Math.max((maxX - minX) * 0.12, 8);
    const padY = Math.max((maxY - minY) * 0.12, 8);
    minX -= padX; maxX += padX; minY -= padY; maxY += padY;
    const spanX = Math.max(maxX - minX, 1);
    const spanY = Math.max(maxY - minY, 1);

    const toCanvas = (p: { x: number; y: number }) => ({
      x: ((p.x - minX) / spanX) * w,
      y: h - ((p.y - minY) / spanY) * h,
    });

    // Ghost paths for context
    for (const t of relevant) {
      if (selected && t.track_id === selected.track_id) continue;
      ctx.beginPath();
      t.points.forEach((p, i) => {
        const c = toCanvas(p);
        if (i === 0) ctx.moveTo(c.x, c.y);
        else ctx.lineTo(c.x, c.y);
      });
      ctx.strokeStyle = 'rgba(113, 113, 122, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (!selected) return;

    const color = VEHICLE_COLORS[selected.vehicle_class] ?? '#06b6d4';
    const points = selected.points.map(toCanvas);

    // Full path at low alpha
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = `${color}44`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Traveled portion in full color with fading by age
    const upto = Math.min(currentFrame, points.length - 1);
    for (let i = 1; i <= upto; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      const alpha = 0.25 + 0.75 * (i / Math.max(upto, 1));
      ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Waypoint dots
    points.forEach((p, i) => {
      if (i > upto) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i === upto ? '#ffffff' : `${color}aa`;
      ctx.fill();
    });

    // Current position marker
    const current = points[upto];
    if (current) {
      ctx.beginPath();
      ctx.arc(current.x, current.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = `${color}33`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(current.x, current.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = '600 12px Inter, system-ui';
      ctx.fillStyle = 'rgba(244, 244, 245, 0.9)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(selected.track_id, current.x + 12, current.y - 8);
    }
  }, [selected, filteredTrajectories, currentFrame, view]);

  const exportCsv = () => {
    const rows = [
      ['track_id', 'vehicle_class', 'start_time', 'end_time', 'duration_s', 'distance_m', 'avg_speed', 'max_speed', 'zones'],
      ...filteredTrajectories.map((t) => [
        t.track_id,
        t.vehicle_class,
        t.start_time,
        t.end_time,
        t.duration_seconds.toFixed(1),
        t.total_distance.toFixed(1),
        t.avg_speed.toFixed(1),
        t.max_speed.toFixed(1),
        t.zones_visited.join(';'),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajectories_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPoints = selected?.points.length ?? 0;
  const currentPoint = selected?.points[Math.min(currentFrame, totalPoints - 1)] ?? null;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Trajectory Replay"
          description="Replay and analyze recorded vehicle paths."
          actions={
            <>
              <Button variant="outline" onClick={() => void fetchTrajectories()} className="gap-2">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Refresh
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={filteredTrajectories.length === 0} className="gap-2">
                <Download className="h-4 w-4" aria-hidden="true" />
                Export CSV
              </Button>
            </>
          }
        />

        {/* Filters */}
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search track ID or class…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-8 text-body-sm"
              aria-label="Search trajectories"
            />
          </div>
          <Select value={filterClass} onValueChange={setFilterClass}>
            <SelectTrigger className="h-9 w-[150px] text-body-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {VEHICLE_CLASSES.map((v) => (
                <SelectItem key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterZone} onValueChange={setFilterZone}>
            <SelectTrigger className="h-9 w-[160px] text-body-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All zones</SelectItem>
              {zones.map((z) => (
                <SelectItem key={z.zone_id} value={z.zone_id}>
                  {z.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="shrink-0">
            {formatNumber(filteredTrajectories.length)} tracks
          </Badge>
        </Card>

        {error ? (
          <Card>
            <ErrorState title="Could not load trajectories" description={error} onRetry={() => void fetchTrajectories()} />
          </Card>
        ) : isLoading ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <Card className="aspect-video animate-pulse bg-muted/40" />
              <Card className="h-16 animate-pulse bg-muted/40" />
            </div>
            <Card className="h-[480px] animate-pulse bg-muted/40" />
          </div>
        ) : trajectories.length === 0 ? (
          <Card>
            <EmptyState
              icon={Route}
              title="No trajectories recorded yet"
              description="Trajectories appear once detection events are stored. Start a stream with a loaded model to begin recording."
            />
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            {/* Left: canvas + playback */}
            <div className="min-w-0 space-y-4">
              <Card className="relative overflow-hidden">
                <div ref={containerRef} className="relative aspect-video w-full">
                  <canvas ref={canvasRef} className="absolute inset-0" aria-label="Trajectory canvas" role="img" />
                  {selected ? (
                    <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-border bg-card/90 p-3 backdrop-blur-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-caption">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: VEHICLE_COLORS[selected.vehicle_class] ?? '#06b6d4' }}
                            aria-hidden="true"
                          />
                          <span className="font-medium capitalize text-foreground">{selected.vehicle_class}</span>
                          <Badge variant="secondary" className="font-mono">{selected.track_id}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {selected.zones_visited.join(', ') || 'No zones'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            {formatDuration(selected.duration_seconds)}
                          </span>
                          {currentPoint ? (
                            <span className="tabular-nums">
                              {currentPoint.speed.toFixed(1)} km/h · frame {currentFrame + 1}/{totalPoints}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>

              {/* Playback controls */}
              <Card>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="flex items-center gap-2">
                    <Button
                      variant={isPlaying ? 'secondary' : 'default'}
                      onClick={() => setIsPlaying(!isPlaying)}
                      disabled={!selected || totalPoints < 2}
                      className="h-11 w-11 rounded-full"
                      aria-label={isPlaying ? 'Pause playback' : 'Play playback'}
                    >
                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setCurrentFrame(0);
                        frameRef.current = 0;
                        setIsPlaying(false);
                      }}
                      disabled={!selected}
                      aria-label="Restart"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (!selected) return;
                        const last = selected.points.length - 1;
                        setCurrentFrame(last);
                        frameRef.current = last;
                        setIsPlaying(false);
                      }}
                      disabled={!selected}
                      aria-label="Skip to end"
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const next = Math.max(0, frameRef.current - 1);
                        setCurrentFrame(next);
                        frameRef.current = next;
                      }}
                      disabled={!selected}
                      aria-label="Previous frame"
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex min-w-[200px] flex-1 items-center gap-3">
                    <span className="w-[72px] text-right font-mono text-caption tabular-nums text-muted-foreground">
                      {currentPoint ? formatTime(currentPoint.timestamp) : '--:--:--'}
                    </span>
                    <Slider
                      value={[Math.min(currentFrame, Math.max(totalPoints - 1, 0))]}
                      onValueChange={(v) => {
                        const next = v[0];
                        if (next === undefined) return;
                        setCurrentFrame(next);
                        frameRef.current = next;
                      }}
                      max={Math.max(totalPoints - 1, 1)}
                      step={1}
                      className="flex-1"
                      aria-label="Playback position"
                    />
                    <span className="w-[72px] font-mono text-caption tabular-nums text-muted-foreground">
                      {selected ? formatTime(selected.points[totalPoints - 1]?.timestamp ?? '') : '--:--:--'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-caption text-muted-foreground">Speed</span>
                    <Select value={String(playbackSpeed)} onValueChange={(v) => setPlaybackSpeed(parseFloat(v))}>
                      <SelectTrigger className="h-9 w-[80px] text-body-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SPEED_OPTIONS.map((s) => (
                          <SelectItem key={s} value={String(s)}>
                            {s}x
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: list + details */}
            <div className="min-w-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-heading-sm">Tracks</CardTitle>
                  <CardDescription>{filteredTrajectories.length} trajectories in view</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[360px]">
                    <div className="space-y-2">
                      {filteredTrajectories.map((traj) => (
                        <motion.button
                          key={traj.track_id}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={cn(
                            'w-full rounded-lg border p-3 text-left transition-colors',
                            selected?.track_id === traj.track_id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:bg-accent/50'
                          )}
                          onClick={() => {
                            setSelected(traj);
                            setIsPlaying(false);
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: VEHICLE_COLORS[traj.vehicle_class] ?? '#888888' }}
                              aria-hidden="true"
                            />
                            <span className="truncate font-mono text-body-sm font-medium">{traj.track_id}</span>
                            <Badge variant="secondary" className="ml-auto shrink-0">{traj.points.length} pts</Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-caption text-muted-foreground">
                            <span className="capitalize">{traj.vehicle_class}</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {formatDuration(traj.duration_seconds)}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {traj.zones_visited.length}
                            </span>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {selected ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-heading-sm">Details</CardTitle>
                    <CardDescription className="font-mono">{selected.track_id}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-caption text-muted-foreground">Duration</p>
                        <p className="text-heading-sm font-bold tabular-nums">{formatDuration(selected.duration_seconds)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-caption text-muted-foreground">Distance</p>
                        <p className="text-heading-sm font-bold tabular-nums">{selected.total_distance.toFixed(1)} m</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-caption text-muted-foreground">Avg speed</p>
                        <p className="text-heading-sm font-bold tabular-nums">{selected.avg_speed.toFixed(1)} km/h</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <p className="text-caption text-muted-foreground">Max speed</p>
                        <p className="text-heading-sm font-bold tabular-nums">{selected.max_speed.toFixed(1)} km/h</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-body-sm font-medium">Zones visited</p>
                      <div className="flex flex-wrap gap-2">
                        {selected.zones_visited.length > 0 ? (
                          selected.zones_visited.map((zone) => (
                            <Badge key={zone} variant="secondary" className="gap-1">
                              <MapPin className="h-3 w-3" aria-hidden="true" />
                              {zone}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-caption text-muted-foreground">No zones visited</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
