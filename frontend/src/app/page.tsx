'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { StreamViewer } from '@/components/stream/StreamViewer';
import { DetectionOverlay } from '@/components/stream/DetectionOverlay';
import { ZonePanel } from '@/components/zone/ZonePanel';
import { StatsBar } from '@/components/stream/StatsBar';
import { TrafficCharts } from '@/components/charts/TrafficCharts';
import { ZoneCanvas, type Zone } from '@/components/zone/ZoneCanvas';
import { useNexusStream } from '@/hooks/useNexusStream';
import { useZones } from '@/hooks/useZones';
import { PageHeader, StatCard, EmptyState } from '@/components/common';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Card, CardContent } from '@/components/ui/Card';
import { fetchJson } from '@/lib/api';
import { Camera, MapPin, Car, Activity } from 'lucide-react';

interface StreamInfo {
  stream_id: string;
  name: string;
  status: string;
  fps: number;
  frame_width: number;
  frame_height: number;
  frames_processed: number;
  frames_dropped: number;
}

interface AnalyticsSummary {
  total_vehicles_24h: number;
  active_zones: number;
  total_zones: number;
  avg_congestion: number;
}

function Dashboard() {
  const [selectedZoneId, setSelectedZoneId] = React.useState<string | null>(null);
  const [drawingMode, setDrawingMode] = React.useState(false);
  const [currentPoints, setCurrentPoints] = React.useState<{ x: number; y: number; id: string }[]>([]);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState<'all' | 'active' | 'inactive'>('all');

  const [streams, setStreams] = React.useState<StreamInfo[]>([]);
  const [streamsError, setStreamsError] = React.useState<string | null>(null);
  const [streamId, setStreamId] = React.useState('');
  const [summary, setSummary] = React.useState<AnalyticsSummary | null>(null);

  const fetchStreams = React.useCallback(async () => {
    try {
      const data = await fetchJson<StreamInfo[]>('/api/streams');
      setStreams(data);
      setStreamsError(null);
      setStreamId((current) => {
        if (current && data.some((s) => s.stream_id === current)) return current;
        return data[0]?.stream_id ?? '';
      });
    } catch (err) {
      setStreamsError(err instanceof Error ? err.message : 'Failed to load streams');
    }
  }, []);

  React.useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, 10_000);
    return () => clearInterval(interval);
  }, [fetchStreams]);

  React.useEffect(() => {
    fetchJson<AnalyticsSummary>('/api/analytics/summary')
      .then(setSummary)
      .catch(() => {
        // stat cards show em-dashes without summary
      });
  }, []);

  const { detections, frameWidth, frameHeight, zoneEvents, streamStats, isConnected } = useNexusStream({
    streamId: streamId || 'none',
    autoConnect: Boolean(streamId),
    reconnectInterval: 3000,
    maxRetries: 5,
  });

  const {
    zones,
    isLoading,
    error: zonesError,
    createZone,
    updateZone,
    deleteZone,
    duplicateZone,
  } = useZones({ streamId: streamId || 'none', autoLoad: true });

  const handleZoneCreate = (label: string, points: { x: number; y: number }[], color: string) => {
    createZone({
      label,
      points: points.map((p) => ({ x: p.x, y: p.y })),
      color,
      maxDwellMs: 30000,
      active: true,
    });
  };

  const handleZoneUpdate = (zoneId: string, updates: Partial<Zone>) => {
    updateZone(zoneId, updates);
  };

  const handleZoneDelete = (zoneId: string) => {
    deleteZone(zoneId);
    if (selectedZoneId === zoneId) setSelectedZoneId(null);
  };

  const handleZoneToggle = (zoneId: string, active: boolean) => {
    updateZone(zoneId, { active });
  };

  const handleZoneDuplicate = (zoneId: string) => {
    duplicateZone(zoneId);
  };

  const handleZoneEdit = (zoneId: string) => {
    setSelectedZoneId(zoneId);
    setDrawingMode(true);
    const zone = zones.find((z) => z.id === zoneId);
    if (zone) {
      setCurrentPoints(zone.points.map((p, i) => ({ x: p.x, y: p.y, id: `pt_${i}` })));
    }
  };

  const handlePointsChange = (zoneId: string, points: { x: number; y: number }[]) => {
    if (drawingMode) {
      setCurrentPoints(points.map((p, i) => ({ x: p.x, y: p.y, id: (p as { id?: string }).id ?? `pt_${i}` })));
    } else {
      updateZone(zoneId, { points });
    }
  };

  const selectedStream = streams.find((s) => s.stream_id === streamId);
  const runningStreams = streams.filter((s) => s.status === 'running');

  const [health, setHealth] = React.useState<{
    uptimeSeconds: number;
    cpuUsedPercent: number;
    memoryUsedPercent: number;
    diskUsedPercent: number;
    frameQueueSize: number;
    frameQueueMax: number;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const [hzRes, depsRes] = await Promise.all([
          fetch('/healthz'),
          fetch('/healthz/deps'),
        ]);
        const hz = hzRes.ok ? await hzRes.json() : null;
        const deps = depsRes.ok ? await depsRes.json() : null;
        if (cancelled || !hz) return;
        setHealth({
          uptimeSeconds: hz.uptime_seconds ?? 0,
          cpuUsedPercent: deps?.cpu_used_percent ?? 0,
          memoryUsedPercent: deps?.memory_used_percent ?? 0,
          diskUsedPercent: deps?.disk_used_percent ?? 0,
          frameQueueSize: deps?.frame_queue_size ?? 0,
          frameQueueMax: deps?.frame_queue_max ?? 0,
        });
      } catch {
        // stats bar falls back to dashes/zero without health data
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const systemStats = React.useMemo(
    () => ({
      detectionFps: streamStats?.detection_fps ?? 0,
      trackingFps: streamStats?.tracking_fps ?? 0,
      spatialFps: streamStats?.spatial_fps ?? 0,
      framesProcessed: streamStats?.frames_processed ?? 0,
      framesDropped: streamStats?.frames_dropped ?? 0,
      totalLatencyMs: streamStats?.total_latency_ms ?? 0,
      activeTracks: streamStats?.active_tracks ?? detections.length,
      zoneEvents: zoneEvents.length,
      memoryUsedPercent: health?.memoryUsedPercent ?? 0,
      cpuUsedPercent: health?.cpuUsedPercent ?? 0,
      diskUsedPercent: health?.diskUsedPercent ?? 0,
      uptimeSeconds: health?.uptimeSeconds ?? 0,
      frameQueueSize: health?.frameQueueSize ?? 0,
      frameQueueMax: health?.frameQueueMax ?? 0,
      streams: Object.fromEntries(
        streams.map((s) => [
          s.stream_id,
          {
            status: s.status,
            fps: s.fps,
            framesProcessed: s.frames_processed,
            framesDropped: s.frames_dropped,
          },
        ])
      ),
    }),
    [streamStats, detections.length, zoneEvents.length, streams, health]
  );

  // Chart data from live WebSocket events only — no fallbacks
  const chartData = React.useMemo(() => {
    if (zoneEvents.length === 0) return null;

    interface HourlyData {
      cars: number;
      trucks: number;
      buses: number;
      motorcycles: number;
      bicycles: number;
      pedestrians: number;
      total: number;
    }

    const now = new Date();
    const hourlyMap = new Map<string, HourlyData>();
    for (let i = 0; i < 24; i++) {
      const hour = new Date(now.getTime() - i * 3_600_000);
      const key = hour.getHours().toString().padStart(2, '0');
      hourlyMap.set(key, { cars: 0, trucks: 0, buses: 0, motorcycles: 0, bicycles: 0, pedestrians: 0, total: 0 });
    }

    zoneEvents.forEach((event) => {
      const eventTime = new Date(event.timestamp);
      const key = eventTime.getHours().toString().padStart(2, '0');
      const data = hourlyMap.get(key);
      const vehicleClass = (event.class_name || 'cars').toLowerCase();
      if (data) {
        if (vehicleClass in data) {
          (data as unknown as Record<string, number>)[vehicleClass]++;
        }
        data.total++;
      }
    });

    const hourlyData = Array.from(hourlyMap.entries())
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([hour, data]) => ({ hour, ...data }));

    const distributionMap = new Map<string, number>();
    zoneEvents.forEach((event) => {
      const vehicleClass = (event.class_name || 'cars').toLowerCase();
      distributionMap.set(vehicleClass, (distributionMap.get(vehicleClass) || 0) + 1);
    });

    const colors: Record<string, string> = {
      cars: '#06b6d4',
      trucks: '#f97316',
      buses: '#a855f7',
      motorcycles: '#22c55e',
      bicycles: '#eab308',
      pedestrians: '#ec4899',
    };

    const vehicleDistribution = Array.from(distributionMap.entries()).map(([type, count]) => ({
      type,
      count,
      percentage: count / zoneEvents.length,
      color: colors[type] ?? '#94a3b8',
    }));

    const dwellData = zones
      .filter((z) => (z.avgDwellMs ?? 0) > 0)
      .map((z) => ({
        zone: z.label,
        avgDwellMs: z.avgDwellMs ?? 0,
        maxDwellMs: z.maxDwellMs ?? 0,
        violations: 0,
      }));

    return {
      hourlyData,
      vehicleDistribution,
      dwellData: dwellData.length > 0 ? dwellData : undefined,
      totalVehicles: zoneEvents.length,
      peakHour: (() => {
        let max = { hour: '', count: 0 };
        for (const h of hourlyData) {
          if (h.total > max.count) max = { hour: h.hour, count: h.total };
        }
        return max;
      })(),
      avgDwellTime: zones.length > 0 ? zones.reduce((sum, z) => sum + (z.avgDwellMs ?? 0), 0) / zones.length : 0,
      violationRate:
        (zoneEvents.filter((e) => e.event_type === 'dwell_exceeded').length / zoneEvents.length) * 100,
    };
  }, [zoneEvents, zones]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Dashboard"
          description="Live monitoring overview across streams and zones"
          actions={
            streams.length > 0 ? (
              <Select value={streamId} onValueChange={setStreamId}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select stream" />
                </SelectTrigger>
                <SelectContent>
                  {streams.map((s) => (
                    <SelectItem key={s.stream_id} value={s.stream_id}>
                      {s.name || s.stream_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null
          }
        />

        {/* Metric cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Running Streams"
            value={runningStreams.length}
            hint={`${streams.length} configured`}
            icon={Camera}
            tone="primary"
          />
          <StatCard
            label="Zones"
            value={summary ? `${summary.active_zones} / ${summary.total_zones}` : '—'}
            hint="Active / total"
            icon={MapPin}
            tone="success"
          />
          <StatCard
            label="Vehicles (24h)"
            value={summary ? summary.total_vehicles_24h.toLocaleString() : '—'}
            hint="Traffic events recorded"
            icon={Car}
          />
          <StatCard
            label="Active Tracks"
            value={isConnected ? systemStats.activeTracks : '—'}
            hint={isConnected ? 'Live from WebSocket' : 'WS not connected'}
            icon={Activity}
            tone="warning"
          />
        </div>

        {streamsError ? (
          <Card>
            <EmptyState
              icon={Camera}
              title="Could not load streams"
              description={streamsError}
              className="py-10"
            />
          </Card>
        ) : !streamId ? (
          <Card>
            <EmptyState
              icon={Camera}
              title="No streams configured"
              description="Add a stream on the Streams page to begin live monitoring."
              className="py-10"
            />
          </Card>
        ) : (
          <div className="flex flex-1 flex-col gap-4 lg:flex-row">
            {/* Left: live view + stats */}
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl border border-border bg-black">
                <StreamViewer
                  streamId={streamId}
                  mjpegUrl={`/api/streams/${streamId}/mjpeg`}
                  wsUrl={`ws://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:8003/api/streams/${streamId}/ws`}
                  showControls
                  showStatus
                  className="absolute inset-0 h-full w-full object-contain"
                />
                <DetectionOverlay detections={detections as any} frameWidth={frameWidth || selectedStream?.frame_width || 1280} frameHeight={frameHeight || selectedStream?.frame_height || 720} />
                  <ZoneCanvas
                  videoWidth={selectedStream?.frame_width || 1280}
                  videoHeight={selectedStream?.frame_height || 720}
                  zones={zones}
                  selectedZoneId={selectedZoneId}
                  onZoneSelect={setSelectedZoneId}
                  onZoneCreate={handleZoneCreate}
                  onZoneUpdate={handleZoneUpdate}
                  onZoneDelete={handleZoneDelete}
                  onPointsChange={handlePointsChange}
                  drawingMode={drawingMode}
                  setDrawingMode={setDrawingMode}
                  currentPoints={currentPoints}
                  setCurrentPoints={setCurrentPoints}
                  showGrid={false}
                />
              </div>

              {zonesError ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {zonesError}
                </div>
              ) : null}

              <StatsBar stats={systemStats} />
            </div>

            {/* Right: zones + charts */}
            <div className="w-full space-y-4 lg:w-96 lg:shrink-0">
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <ZonePanel
                  zones={zones}
                  selectedZoneId={selectedZoneId}
                  onZoneSelect={setSelectedZoneId}
                  onZoneEdit={handleZoneEdit}
                  onZoneDelete={handleZoneDelete}
                  onZoneToggle={handleZoneToggle}
                  onZoneDuplicate={handleZoneDuplicate}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  filterStatus={filterStatus}
                  setFilterStatus={setFilterStatus}
                />
              </div>

              {chartData ? (
                <TrafficCharts
                  hourlyData={chartData.hourlyData}
                  vehicleDistribution={chartData.vehicleDistribution}
                  dwellData={chartData.dwellData ?? []}
                  totalVehicles={chartData.totalVehicles}
                  peakHour={chartData.peakHour}
                  avgDwellTime={chartData.avgDwellTime}
                  violationRate={chartData.violationRate}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default Dashboard;
