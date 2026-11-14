'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  Camera,
  Play,
  Square,
  RefreshCw,
  Layers,
  Radio,
  Cpu,
  Signal,
  Video,
  Loader2,
  LayoutGrid,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { CameraGrid } from '@/components/stream/CameraGrid';
import { PageHeader, StatCard, EmptyState, ErrorState } from '@/components/common';
import { fetchJson } from '@/lib/api';
import { cn } from '@/lib/utils';

type GridLayout = '2x2' | '3x3' | '1+5';

interface PipelineStats {
  detection_fps: number;
  tracking_fps: number;
  latency_ms: number;
  active_tracks: number;
}

interface FusionStream {
  stream_id: string;
  name: string;
  status: string;
  current_fps: number;
  has_pipeline: boolean;
  pipeline_stats: PipelineStats | null;
}

interface FusionStats {
  total_fused_tracks: number;
  active_tracks: number;
  multi_camera_tracks: number;
  registered_cameras: number;
  coverage: Record<string, string[]>;
}

interface FusionStreamsResponse {
  streams: FusionStream[];
  fusion: FusionStats | null;
}

interface FusedTrack {
  fused_id: string;
  camera_tracks: Record<string, number>;
  class_name: string;
  confidence: number;
  num_cameras: number;
  last_seen: number;
}

interface FusedTracksResponse {
  tracks: FusedTrack[];
}

const STATUS_DOT: Record<string, string> = {
  running: 'hsl(var(--status-online))',
  connecting: 'hsl(var(--status-warning))',
  error: 'hsl(var(--status-destructive))',
};

function statusDotColor(status: string): string {
  return STATUS_DOT[status] ?? 'hsl(var(--muted-foreground))';
}

function timeAgo(epochSeconds: number): string {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - epochSeconds));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function FusionPage() {
  const [streams, setStreams] = React.useState<FusionStream[]>([]);
  const [fusionStats, setFusionStats] = React.useState<FusionStats | null>(null);
  const [tracks, setTracks] = React.useState<FusedTrack[]>([]);
  const [selectedStreams, setSelectedStreams] = React.useState<string[]>([]);
  const [layout, setLayout] = React.useState<GridLayout>('2x2');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
  const [bulkBusy, setBulkBusy] = React.useState<'start' | 'stop' | null>(null);
  const preselected = React.useRef(false);

  const load = React.useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const data = await fetchJson<FusionStreamsResponse>('/api/fusion/streams');
      setStreams(data.streams ?? []);
      setFusionStats(data.fusion ?? null);
      setError(null);

      if (!preselected.current) {
        preselected.current = true;
        const initial = (data.streams ?? [])
          .filter((s) => s.has_pipeline || s.status === 'running')
          .slice(0, 4)
          .map((s) => s.stream_id);
        if (initial.length > 0) setSelectedStreams(initial);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fusion state');
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }

    fetchJson<FusedTracksResponse>('/api/fusion/tracks')
      .then((data) => setTracks(data.tracks ?? []))
      .catch(() => setTracks([]));
  }, []);

  React.useEffect(() => {
    load();
    const interval = setInterval(() => load(), 5000);
    return () => clearInterval(interval);
  }, [load]);

  const toggleStream = (streamId: string) => {
    setSelectedStreams((prev) =>
      prev.includes(streamId) ? prev.filter((id) => id !== streamId) : [...prev, streamId]
    );
  };

  const setPipeline = async (stream: FusionStream, enable: boolean) => {
    setBusy((prev) => ({ ...prev, [stream.stream_id]: true }));
    try {
      const path = enable ? 'start' : 'stop';
      await fetchJson(`/api/fusion/${path}/${stream.stream_id}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pipeline request failed');
    } finally {
      setBusy((prev) => ({ ...prev, [stream.stream_id]: false }));
    }
  };

  const runBulk = async (enable: boolean) => {
    setBulkBusy(enable ? 'start' : 'stop');
    try {
      const targets = streams.filter((s) => s.has_pipeline !== enable);
      await Promise.all(
        targets.map((s) =>
          fetchJson(`/api/fusion/${enable ? 'start' : 'stop'}/${s.stream_id}`, {
            method: 'POST',
          }).catch(() => null)
        )
      );
      await load();
    } finally {
      setBulkBusy(null);
    }
  };

  const pipelinesRunning = streams.filter((s) => s.has_pipeline).length;
  const runningStreams = streams.filter((s) => s.status === 'running').length;
  const sortedTracks = React.useMemo(
    () =>
      [...tracks].sort((a, b) => b.num_cameras - a.num_cameras || b.last_seen - a.last_seen).slice(0, 8),
    [tracks]
  );

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-6">
        <PageHeader
          title="Multi-Camera Fusion"
          description="Unified object tracking across every camera in one scene"
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => load(true)}
                disabled={refreshing}
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runBulk(true)}
                disabled={bulkBusy !== null || pipelinesRunning === streams.length}
              >
                {bulkBusy === 'start' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Start All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runBulk(false)}
                disabled={bulkBusy !== null || pipelinesRunning === 0}
              >
                {bulkBusy === 'stop' ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Stop All
              </Button>
            </div>
          }
        />

        {error ? (
          <ErrorState
            title="Fusion state unavailable"
            description={error}
            onRetry={() => load(true)}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                label="Active Fused Tracks"
                value={fusionStats?.active_tracks ?? 0}
                hint={`${fusionStats?.total_fused_tracks ?? 0} total this session`}
                icon={Radio}
                tone="primary"
                loading={loading}
              />
              <StatCard
                label="Multi-Camera Tracks"
                value={fusionStats?.multi_camera_tracks ?? 0}
                hint="Seen by 2+ cameras"
                icon={Layers}
                tone="success"
                loading={loading}
              />
              <StatCard
                label="Pipelines Running"
                value={`${pipelinesRunning}/${streams.length}`}
                hint={`${runningStreams} stream${runningStreams === 1 ? '' : 's'} capturing`}
                icon={Cpu}
                tone={pipelinesRunning > 0 ? 'warning' : 'default'}
                loading={loading}
              />
              <StatCard
                label="Fusion Cameras"
                value={fusionStats?.registered_cameras ?? 0}
                hint="Registered in fusion engine"
                icon={Camera}
                loading={loading}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              {/* Camera grid */}
              <div className="xl:col-span-3">
                <Card className="h-full">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Live Grid</CardTitle>
                    <div className="flex gap-1">
                      {(['2x2', '3x3', '1+5'] as const).map((l) => (
                        <Button
                          key={l}
                          variant={layout === l ? 'default' : 'outline'}
                          size="sm"
                          className="px-3"
                          onClick={() => setLayout(l)}
                        >
                          {l}
                        </Button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <Skeleton className="aspect-video w-full" />
                    ) : streams.length === 0 ? (
                      <EmptyState
                        icon={Video}
                        title="No streams available"
                        description="Fusion needs camera streams. Add streams first, then start their pipelines here."
                        action={
                          <Button asChild size="sm">
                            <Link href="/streams">Go to Streams</Link>
                          </Button>
                        }
                      />
                    ) : selectedStreams.length === 0 ? (
                      <EmptyState
                        icon={LayoutGrid}
                        title="No cameras selected"
                        description="Select cameras from the list to compose the live grid."
                      />
                    ) : (
                      <CameraGrid streamIds={selectedStreams} layout={layout} />
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-4">
                {/* Fused tracks */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Fused Tracks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-14" />
                        ))}
                      </div>
                    ) : sortedTracks.length === 0 ? (
                      <p className="text-body-sm text-muted-foreground py-4 text-center">
                        No fused tracks right now.
                        <br />
                        Start pipelines to fuse detections across cameras.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {sortedTracks.map((track) => (
                          <motion.div
                            key={track.fused_id}
                            layout
                            className="rounded-lg border border-border bg-background/50 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                                <span className="text-sm font-mono truncate">{track.fused_id}</span>
                              </div>
                              <Badge
                                variant={track.num_cameras > 1 ? 'success' : 'secondary'}
                                className="shrink-0"
                              >
                                {track.num_cameras} cam{track.num_cameras === 1 ? '' : 's'}
                              </Badge>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between text-caption text-muted-foreground">
                              <span className="capitalize">{track.class_name}</span>
                              <span className="tabular-nums">
                                {(track.confidence * 100).toFixed(0)}% · {timeAgo(track.last_seen)}
                              </span>
                            </div>
                            {track.num_cameras > 1 ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {Object.keys(track.camera_tracks).map((camId) => (
                                  <span
                                    key={camId}
                                    className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                                  >
                                    {camId}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Camera list */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Cameras</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-16" />
                        ))}
                      </div>
                    ) : streams.length === 0 ? (
                      <p className="text-body-sm text-muted-foreground py-2">
                        No streams registered.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {streams.map((stream) => {
                          const selected = selectedStreams.includes(stream.stream_id);
                          const isBusy = busy[stream.stream_id] ?? false;
                          const coverageCount = fusionStats?.coverage?.[stream.stream_id]?.length ?? 0;
                          return (
                            <div
                              key={stream.stream_id}
                              className={cn(
                                'group rounded-lg border p-3 cursor-pointer transition-colors',
                                selected
                                  ? 'border-primary/60 bg-primary/5'
                                  : 'border-border hover:border-muted-foreground/40'
                              )}
                              onClick={() => toggleStream(stream.stream_id)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className="relative flex h-1.5 w-1.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: statusDotColor(stream.status) }}
                                  >
                                    {stream.status === 'running' ? (
                                      <span
                                        className="absolute inset-0 animate-ping rounded-full"
                                        style={{ backgroundColor: statusDotColor(stream.status) }}
                                      />
                                    ) : null}
                                  </span>
                                  <span className="text-sm font-medium truncate">
                                    {stream.name || stream.stream_id}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {coverageCount > 0 ? (
                                    <Badge variant="secondary" className="text-[11px]">
                                      {coverageCount} fused
                                    </Badge>
                                  ) : null}
                                  <Badge variant={stream.has_pipeline ? 'default' : 'secondary'}>
                                    {stream.has_pipeline ? 'LIVE' : 'IDLE'}
                                  </Badge>
                                  <Button
                                    variant={stream.has_pipeline ? 'outline' : 'default'}
                                    size="sm"
                                    className="h-7 px-2"
                                    disabled={isBusy || bulkBusy !== null}
                                    aria-label={
                                      stream.has_pipeline
                                        ? `Stop pipeline for ${stream.name || stream.stream_id}`
                                        : `Start pipeline for ${stream.name || stream.stream_id}`
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPipeline(stream, !stream.has_pipeline);
                                    }}
                                  >
                                    {isBusy ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : stream.has_pipeline ? (
                                      <Square className="h-3.5 w-3.5" />
                                    ) : (
                                      <Play className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                              <div className="mt-1 flex items-center gap-3 text-caption text-muted-foreground tabular-nums">
                                <span className="flex items-center gap-1">
                                  <Signal className="h-3 w-3" />
                                  {stream.current_fps.toFixed(0)} fps
                                </span>
                                {stream.pipeline_stats ? (
                                  <>
                                    <span>{(stream.pipeline_stats.detection_fps ?? 0).toFixed(0)} det/s</span>
                                    <span>{(stream.pipeline_stats.latency_ms ?? 0).toFixed(0)} ms</span>
                                    <span>{stream.pipeline_stats.active_tracks ?? 0} tracks</span>
                                  </>
                                ) : (
                                  <span>No pipeline</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
