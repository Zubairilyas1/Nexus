'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import {
  Camera,
  Plus,
  RefreshCw,
  Play,
  Square,
  Trash2,
  Activity,
  AlertTriangle,
  Video,
  Loader2,
  Film,
  Download,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { PageHeader, StatCard, EmptyState, ErrorState } from '@/components/common';
import { fetchJson, ApiError, formatNumber } from '@/lib/api';
import { cn } from '@/lib/utils';

type StreamStatus = 'running' | 'stopped' | 'error' | 'connecting';

interface Stream {
  stream_id: string;
  name: string;
  rtsp_url: string;
  youtube_url: string;
  enabled: boolean;
  status: StreamStatus;
  fps: number;
  frame_width: number;
  frame_height: number;
  last_frame_ts: number | null;
  error: string | null;
  frames_captured: number;
  frames_dropped: number;
  frames_processed: number;
  queue_size: number;
  queue_max: number;
}

const STATUS_CONFIG: Record<StreamStatus, { label: string; tone: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  running: { label: 'RUNNING', tone: 'success' },
  connecting: { label: 'CONNECTING', tone: 'warning' },
  error: { label: 'ERROR', tone: 'destructive' },
  stopped: { label: 'STOPPED', tone: 'secondary' },
};

const RESOLUTIONS = [
  { value: '640x480', label: '640 × 480 (VGA)' },
  { value: '1280x720', label: '1280 × 720 (HD)' },
  { value: '1920x1080', label: '1920 × 1080 (Full HD)' },
  { value: '3840x2160', label: '3840 × 2160 (4K)' },
];

function StatusBadge({ status }: { status: StreamStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.stopped;
  const dotColor =
    status === 'running'
      ? 'hsl(var(--status-online))'
      : status === 'connecting'
        ? 'hsl(var(--status-warning))'
        : status === 'error'
          ? 'hsl(var(--status-destructive))'
          : 'hsl(var(--muted-foreground))';
  return (
    <Badge variant={config.tone} className="gap-1.5">
      <span className="relative flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }}>
        {status === 'running' || status === 'connecting' ? (
          <span className="absolute inset-0 animate-ping rounded-full" style={{ backgroundColor: dotColor }} />
        ) : null}
      </span>
      {config.label}
    </Badge>
  );
}

function StreamCard({
  stream,
  snapshotTick,
  toggling,
  onToggle,
  onDelete,
}: {
  stream: Stream;
  snapshotTick: number;
  toggling: boolean;
  onToggle: (stream: Stream) => void;
  onDelete: (stream: Stream) => void;
}) {
  const [snapFailed, setSnapFailed] = React.useState(false);

  React.useEffect(() => {
    setSnapFailed(false);
  }, [snapshotTick]);

  const isRunning = stream.status === 'running';
  const showSnapshot = isRunning && !snapFailed;
  const dropRate =
    stream.frames_captured > 0 ? (stream.frames_dropped / stream.frames_captured) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <Card className="group h-full overflow-hidden transition-shadow duration-300 hover:shadow-elevation-3">
        {/* Thumbnail */}
        <div className="relative aspect-video w-full overflow-hidden bg-zinc-950">
          {showSnapshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/streams/${stream.stream_id}/snapshot?t=${snapshotTick}`}
              alt={`${stream.name} latest frame`}
              className="h-full w-full object-cover"
              onError={() => setSnapFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Camera className="h-10 w-10 opacity-40" aria-hidden="true" />
              <p className="text-caption">
                {isRunning ? 'Waiting for first frame…' : 'Stream is not running'}
              </p>
            </div>
          )}
          <div className="absolute left-3 top-3">
            <StatusBadge status={stream.status} />
          </div>
          {isRunning ? (
            <div className="absolute bottom-3 right-3 rounded-md bg-black/70 px-2 py-1 font-mono text-caption text-zinc-200 backdrop-blur-sm">
              {stream.fps.toFixed(1)} FPS
            </div>
          ) : null}
        </div>

        {/* Body */}
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-body-sm font-semibold text-foreground">
                {stream.name || stream.stream_id}
              </h3>
              <p className="truncate font-mono text-caption text-muted-foreground">{stream.stream_id}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
            <span className="font-mono tabular-nums">
              {stream.frame_width}×{stream.frame_height}
            </span>
            <span className="tabular-nums">{formatNumber(stream.frames_processed)} processed</span>
            <span
              className={cn('tabular-nums', stream.frames_dropped > 0 && 'text-status-warning')}
              title="Dropped frames / captured frames"
            >
              {formatNumber(stream.frames_dropped)} dropped
              {stream.frames_captured > 0 ? ` (${dropRate.toFixed(1)}%)` : ''}
            </span>
            <span className="tabular-nums" title="Frame queue depth">
              queue {stream.queue_size}/{stream.queue_max}
            </span>
          </div>

          {stream.status === 'error' && stream.error ? (
            <p
              className="truncate rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-caption text-destructive"
              title={stream.error}
            >
              {stream.error}
            </p>
          ) : null}

          <div className="flex items-center justify-between border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={() => {
                const url = `/api/streams/${stream.stream_id}/tmc`;
                const a = document.createElement('a');
                a.href = url;
                a.download = `tmc_${stream.stream_id}_${new Date().toISOString().split('T')[0]}.csv`;
                a.click();
              }}
              disabled={stream.frames_processed === 0}
              title="Download Turning Movement Count CSV"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              TMC CSV
            </Button>
            <Button
              variant={isRunning ? 'outline' : 'default'}
              size="sm"
              className="gap-2"
              disabled={toggling}
              onClick={() => onToggle(stream)}
            >
              {toggling ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : isRunning ? (
                <Square className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              {toggling ? 'Working…' : isRunning ? 'Stop' : 'Start'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(stream)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

interface AddStreamForm {
  streamId: string;
  name: string;
  rtspUrl: string;
  youtubeUrl: string;
  resolution: string;
  targetFps: number;
}

const EMPTY_FORM: AddStreamForm = {
  streamId: '',
  name: '',
  rtspUrl: '',
  youtubeUrl: '',
  resolution: '1280x720',
  targetFps: 30,
};

function AddStreamDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState<AddStreamForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setFormError(null);
      setSubmitting(false);
    }
  }, [open]);

  const update = (patch: Partial<AddStreamForm>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-zA-Z0-9_-]+$/.test(form.streamId.trim())) {
      setFormError('Stream ID may only contain letters, numbers, hyphens and underscores.');
      return;
    }
    if (!form.rtspUrl.trim() && !form.youtubeUrl.trim()) {
      setFormError('Provide an RTSP URL or a YouTube URL.');
      return;
    }
    const parts = form.resolution.split('x');
    setSubmitting(true);
    setFormError(null);
    try {
      await fetchJson<Stream>('/api/streams', {
        method: 'POST',
        body: JSON.stringify({
          stream_id: form.streamId.trim(),
          name: form.name.trim() || form.streamId.trim(),
          rtsp_url: form.rtspUrl.trim(),
          youtube_url: form.youtubeUrl.trim(),
          frame_width: parseInt(parts[0] ?? '1280', 10),
          frame_height: parseInt(parts[1] ?? '720', 10),
          target_fps: form.targetFps,
          use_youtube_fallback: !!form.youtubeUrl.trim(),
        }),
      });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create stream.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" aria-hidden="true" />
            Add Stream
          </DialogTitle>
          <DialogDescription>
            Register an RTSP or YouTube source. The stream starts capturing immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="stream-id">Stream ID *</Label>
              <Input
                id="stream-id"
                placeholder="front-gate"
                value={form.streamId}
                onChange={(e) => update({ streamId: e.target.value })}
                autoComplete="off"
                required
              />
              <p className="text-caption text-muted-foreground">Letters, numbers, - and _ only.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stream-name">Display name</Label>
              <Input
                id="stream-name"
                placeholder="Front Gate Camera"
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rtsp-url">RTSP URL</Label>
            <Input
              id="rtsp-url"
              placeholder="rtsp://user:pass@camera.local:554/stream1"
              value={form.rtspUrl}
              onChange={(e) => update({ rtspUrl: e.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="youtube-url">YouTube URL (fallback)</Label>
            <Input
              id="youtube-url"
              placeholder="https://www.youtube.com/watch?v=…"
              value={form.youtubeUrl}
              onChange={(e) => update({ youtubeUrl: e.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-caption text-muted-foreground">
              Used when the RTSP source is unavailable. At least one URL is required.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resolution">Resolution</Label>
              <Select value={form.resolution} onValueChange={(v) => update({ resolution: v })}>
                <SelectTrigger id="resolution">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOLUTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-fps">Target FPS</Label>
              <Input
                id="target-fps"
                type="number"
                min={1}
                max={60}
                value={form.targetFps}
                onChange={(e) => update({ targetFps: parseInt(e.target.value, 10) || 1 })}
              />
            </div>
          </div>

          {formError ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
              {formError}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              {submitting ? 'Creating…' : 'Create stream'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteStreamDialog({
  stream,
  onClose,
  onDeleted,
}: {
  stream: Stream | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (stream) {
      setDeleting(false);
      setDeleteError(null);
    }
  }, [stream]);

  const confirmDelete = async () => {
    if (!stream) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await fetchJson<void>(`/api/streams/${stream.stream_id}`, { method: 'DELETE' });
      onClose();
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete stream.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={stream !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" aria-hidden="true" />
            Delete stream
          </DialogTitle>
          <DialogDescription>
            This permanently removes the stream and stops capture. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {stream ? (
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5">
            <p className="text-body-sm font-medium text-foreground">{stream.name || stream.stream_id}</p>
            <p className="font-mono text-caption text-muted-foreground">{stream.stream_id}</p>
          </div>
        ) : null}
        {deleteError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
            {deleteError}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={deleting} className="gap-2">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {deleting ? 'Deleting…' : 'Delete stream'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StreamsPage() {
  const [streams, setStreams] = React.useState<Stream[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Stream | null>(null);
  const [snapshotTick, setSnapshotTick] = React.useState(0);

  const fetchStreams = React.useCallback(async () => {
    try {
      const data = await fetchJson<Stream[]>('/api/streams');
      setStreams(data);
      setError(null);
      setSnapshotTick((t) => t + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load streams.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchStreams();
    const interval = setInterval(fetchStreams, 10000);
    return () => clearInterval(interval);
  }, [fetchStreams]);

  const toggleStream = async (stream: Stream) => {
    setTogglingId(stream.stream_id);
    try {
      const nextEnabled = stream.status === 'stopped';
      await fetchJson<Stream>(`/api/streams/${stream.stream_id}?enabled=${nextEnabled}`, { method: 'PATCH' });
      await fetchStreams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle stream.');
    } finally {
      setTogglingId(null);
    }
  };

  const runningCount = streams.filter((s) => s.status === 'running').length;
  const errorCount = streams.filter((s) => s.status === 'error').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Streams"
          description="Register RTSP or YouTube sources and manage capture."
          actions={
            <>
              <Button variant="outline" onClick={fetchStreams} className="gap-2">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Refresh
              </Button>
              <Button onClick={() => setAddOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Stream
              </Button>
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Total Streams"
            value={streams.length}
            icon={Film}
            tone="primary"
            loading={loading}
          />
          <StatCard
            label="Running"
            value={runningCount}
            icon={Activity}
            tone="success"
            loading={loading}
            hint={streams.length > 0 ? `of ${streams.length} registered` : undefined}
          />
          <StatCard
            label="In Error State"
            value={errorCount}
            icon={AlertTriangle}
            tone={errorCount > 0 ? 'destructive' : 'default'}
            loading={loading}
          />
        </div>

        {error && streams.length === 0 ? (
          <Card>
            <ErrorState
              title="Could not load streams"
              description={error}
              onRetry={fetchStreams}
            />
          </Card>
        ) : loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden">
                <div className="aspect-video w-full animate-pulse bg-muted/60" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted/60" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted/60" />
                  <div className="h-8 w-full animate-pulse rounded bg-muted/40" />
                </div>
              </Card>
            ))}
          </div>
        ) : streams.length === 0 ? (
          <Card>
            <EmptyState
              icon={Camera}
              title="No streams configured"
              description="Add an RTSP or YouTube source to start capturing video for detection and analytics."
              action={
                <Button onClick={() => setAddOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add your first stream
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {streams.map((stream) => (
              <StreamCard
                key={stream.stream_id}
                stream={stream}
                snapshotTick={snapshotTick}
                toggling={togglingId === stream.stream_id}
                onToggle={toggleStream}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}

        <AddStreamDialog open={addOpen} onOpenChange={setAddOpen} onCreated={fetchStreams} />
        <DeleteStreamDialog
          stream={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={fetchStreams}
        />
      </div>
    </DashboardLayout>
  );
}
