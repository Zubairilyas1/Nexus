'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import {
  Cpu,
  Monitor,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  Activity,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';

interface SystemStats {
  detectionFps: number;
  trackingFps: number;
  spatialFps: number;
  framesProcessed: number;
  framesDropped: number;
  totalLatencyMs: number;
  activeTracks: number;
  zoneEvents: number;
  memoryUsedPercent: number;
  cpuUsedPercent: number;
  diskUsedPercent: number;
  uptimeSeconds: number;
  frameQueueSize: number;
  frameQueueMax: number;
  streams: Record<
    string,
    {
      status: string;
      fps: number;
      framesProcessed: number;
      framesDropped: number;
    }
  >;
}

interface StatsBarProps {
  stats: SystemStats;
  className?: string;
}

function Sparkline({ data, color = 'hsl(var(--primary))' }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-8 w-16 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type ColorKey = 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

const ICON_BG: Record<ColorKey, string> = {
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

const SPARK_COLOR: Record<ColorKey, string> = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
  muted: 'hsl(var(--muted-foreground))',
};

interface StatItemProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  color?: ColorKey;
  unit?: string;
  tooltip?: string;
  sparkData?: number[];
}

function StatItem({ label, value, icon: Icon, trend, color = 'primary', unit = '', tooltip, sparkData }: StatItemProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-all hover:shadow-elevation-3"
        >
          <div className={cn('flex shrink-0 items-center justify-center rounded-xl p-2.5', ICON_BG[color])}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted-foreground">{label}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-heading-sm font-bold tabular-nums">{value}</span>
              <span className="text-caption text-muted-foreground">{unit}</span>
            </div>
          </div>
          {sparkData && sparkData.length >= 2 ? <Sparkline data={sparkData} color={SPARK_COLOR[color]} /> : null}
          {trend !== undefined ? (
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-medium tabular-nums',
                trend >= 0 ? 'text-success' : 'text-destructive'
              )}
            >
              {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trend).toFixed(1)}%
            </div>
          ) : null}
        </motion.div>
      </TooltipTrigger>
      {tooltip ? (
        <TooltipContent side="top" align="center">
          {tooltip}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}

function StreamStatusCard({
  streamId,
  stream,
}: {
  streamId: string;
  stream: {
    status: string;
    fps: number;
    framesProcessed: number;
    framesDropped: number;
  };
}) {
  const isRunning = stream.status === 'running';
  const total = stream.framesDropped + stream.framesProcessed;
  const dropRate = total > 0 ? ((stream.framesDropped / total) * 100).toFixed(1) : '0';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card-hover p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">{streamId}</p>
          <p className="font-mono text-caption text-muted-foreground">Dropped: {dropRate}%</p>
        </div>
        <Badge variant={isRunning ? 'success' : 'destructive'} className="gap-1.5">
          <span
            className="relative flex h-1.5 w-1.5 rounded-full"
            style={{
              backgroundColor: isRunning ? 'hsl(var(--status-online))' : 'hsl(var(--destructive))',
            }}
          >
            <span
              className="absolute inset-0 animate-pulse-slow rounded-full"
              style={{
                backgroundColor: isRunning ? 'hsl(var(--status-online))' : 'hsl(var(--destructive))',
              }}
            />
          </span>
          {isRunning ? 'RUNNING' : 'STOPPED'}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-muted/50 p-3">
          <p className="text-heading-sm font-bold tabular-nums">{stream.fps.toFixed(1)}</p>
          <p className="text-caption text-muted-foreground">FPS</p>
        </div>
        <div className="rounded-xl bg-muted/50 p-3">
          <p className="text-heading-sm font-bold tabular-nums">{stream.framesProcessed.toLocaleString()}</p>
          <p className="text-caption text-muted-foreground">Processed</p>
        </div>
        <div className="rounded-xl bg-muted/50 p-3">
          <p className="text-heading-sm font-bold tabular-nums text-warning">
            {stream.framesDropped.toLocaleString()}
          </p>
          <p className="text-caption text-muted-foreground">Dropped</p>
        </div>
      </div>
    </motion.div>
  );
}

const SPARK_MAX = 20;

function useSparkHistory(value: number): number[] {
  const ref = React.useRef<number[]>([]);
  React.useEffect(() => {
    ref.current = [...ref.current.slice(-(SPARK_MAX - 1)), value];
  }, [value]);
  return ref.current;
}

export function StatsBar({ stats, className }: StatsBarProps) {
  const uptimeHours = Math.floor(stats.uptimeSeconds / 3600);
  const uptimeMinutes = Math.floor((stats.uptimeSeconds % 3600) / 60);
  const totalFrames = stats.framesDropped + stats.framesProcessed;
  const dropRate =
    totalFrames > 0 ? ((stats.framesDropped / totalFrames) * 100).toFixed(2) : '0.00';

  const sparkDetection = useSparkHistory(stats.detectionFps);
  const sparkTracking = useSparkHistory(stats.trackingFps);
  const sparkLatency = useSparkHistory(stats.totalLatencyMs);

  return (
    <TooltipProvider>
      <div className={cn('space-y-4', className)}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-heading-md font-semibold">System Performance</h3>
            <p className="text-caption text-muted-foreground">
              Uptime: {uptimeHours}h {uptimeMinutes}m • Queue: {stats.frameQueueSize}/{stats.frameQueueMax} •
              Frames: {stats.framesProcessed.toLocaleString()} • Dropped: {dropRate}%
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant={
                stats.detectionFps > 25 ? 'success' : stats.detectionFps > 15 ? 'warning' : 'destructive'
              }
            >
              AI Pipeline: {stats.detectionFps.toFixed(1)} FPS
            </Badge>
            {stats.cpuUsedPercent > 0 ? (
              <Badge
                variant={stats.cpuUsedPercent < 70 ? 'success' : stats.cpuUsedPercent < 85 ? 'warning' : 'destructive'}
              >
                CPU: {stats.cpuUsedPercent.toFixed(1)}%
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-8">
          <StatItem
            label="Frames Processed"
            value={stats.framesProcessed.toLocaleString()}
            icon={Cpu}
            color="primary"
            tooltip="Total frames pushed through the pipeline"
          />
          <StatItem
            label="Detection FPS"
            value={stats.detectionFps.toFixed(1)}
            unit="FPS"
            icon={Monitor}
            color="success"
            tooltip="Object detection throughput (0 when no model is loaded)"
            sparkData={sparkDetection}
          />
          <StatItem
            label="Tracking FPS"
            value={stats.trackingFps.toFixed(1)}
            unit="FPS"
            icon={Activity}
            color="warning"
            tooltip="Object tracking throughput"
            sparkData={sparkTracking}
          />
          <StatItem
            label="Spatial FPS"
            value={stats.spatialFps.toFixed(1)}
            unit="FPS"
            icon={Activity}
            color="muted"
            tooltip="Zone evaluation throughput"
          />
          <StatItem
            label="Total Latency"
            value={stats.totalLatencyMs.toFixed(1)}
            unit="ms"
            icon={Zap}
            color="destructive"
            tooltip="End-to-end pipeline latency"
            sparkData={sparkLatency}
          />
          <StatItem label="Active Tracks" value={stats.activeTracks} icon={Activity} color="success" tooltip="Currently tracked objects" />
          <StatItem label="Zone Events" value={stats.zoneEvents} icon={Activity} color="warning" tooltip="Zone events received in this session" />
          <StatItem
            label="Frame Drops"
            value={dropRate}
            unit="%"
            icon={AlertTriangle}
            color={parseFloat(dropRate) > 10 ? 'destructive' : 'success'}
            tooltip="Share of frames dropped out of all frames received"
          />
        </div>

        {Object.keys(stats.streams).length > 0 ? (
          <Card>
            <CardContent className="p-4">
              <h4 className="mb-4 font-medium">Active Streams</h4>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(stats.streams).map(([streamId, stream]) => (
                  <StreamStatusCard key={streamId} streamId={streamId} stream={stream} />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

export default StatsBar;
