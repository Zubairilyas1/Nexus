'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import {
  Shapes,
  RefreshCw,
  PenTool,
  PenLine,
  Check,
  X,
  Copy,
  Trash2,
  Loader2,
  Download,
  Boxes,
  Activity,
  Timer,
  Radio,
  Camera,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { PageHeader, StatCard, EmptyState, ErrorState } from '@/components/common';
import { useZones } from '@/hooks/useZones';
import type { Zone } from '@/components/zone/ZoneCanvas';
import { fetchJson, formatNumber } from '@/lib/api';
import { TooltipProvider } from '@radix-ui/react-tooltip';

interface StreamOption {
  stream_id: string;
  name: string;
  status: string;
}

function ZonePreview({ zone }: { zone: Zone }) {
  if (!zone.points || zone.points.length < 3) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/40">
        <Shapes className="h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
      </div>
    );
  }
  const xs = zone.points.map((p) => p.x);
  const ys = zone.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const padX = w * 0.18 + 1;
  const padY = h * 0.18 + 1;
  const path =
    zone.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  const scale = Math.max(w, h);
  return (
    <svg
      viewBox={`${minX - padX} ${minY - padY} ${w + padX * 2} ${h + padY * 2}`}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-label={`${zone.label} geometry preview`}
      role="img"
    >
      <path d={path} fill={zone.color} fillOpacity={0.14} stroke={zone.color} strokeWidth={scale * 0.012} strokeLinejoin="round" />
      {zone.points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={scale * 0.01} fill={zone.color} />
      ))}
    </svg>
  );
}

function ZoneCard({
  zone,
  live,
  isEditing,
  draftLabel,
  onDraftChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onToggleActive,
  onDuplicate,
  onDelete,
  busy,
}: {
  zone: Zone;
  live: boolean;
  isEditing: boolean;
  draftLabel: string;
  onDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onToggleActive: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <Card className="group h-full overflow-hidden transition-shadow duration-300 hover:shadow-elevation-3">
        {/* Geometry preview */}
        <div className="relative aspect-video w-full border-b border-border bg-zinc-950">
          <ZonePreview zone={zone} />
          <div className="absolute left-3 top-3">
            <Badge variant={zone.active ? 'success' : 'secondary'} className="gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: zone.active ? 'hsl(var(--status-online))' : 'hsl(var(--muted-foreground))' }}
              />
              {zone.active ? 'ACTIVE' : 'INACTIVE'}
            </Badge>
          </div>
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 font-mono text-caption text-zinc-200 backdrop-blur-sm">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                backgroundColor: live
                  ? 'hsl(var(--status-online))'
                  : zone.active
                    ? zone.color
                    : 'hsl(var(--muted-foreground))',
              }}
            />
            {live ? `${zone.currentCount ?? 0} inside` : `${zone.points.length} pts`}
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: zone.color }}
                aria-hidden="true"
              />
              {isEditing ? (
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  <Input
                    value={draftLabel}
                    onChange={(e) => onDraftChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onCommitEdit();
                      if (e.key === 'Escape') onCancelEdit();
                    }}
                    className="h-8 text-body-sm"
                    autoFocus
                    aria-label="Zone name"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCommitEdit} aria-label="Save name">
                    <Check className="h-4 w-4 text-success" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCancelEdit} aria-label="Cancel rename">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="min-w-0">
                  <h3 className="truncate text-body-sm font-semibold text-foreground">{zone.label}</h3>
                  <p className="truncate font-mono text-caption text-muted-foreground">{zone.id}</p>
                </div>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Switch
                    checked={zone.active}
                    onCheckedChange={onToggleActive}
                    disabled={busy}
                    aria-label={`${zone.active ? 'Disable' : 'Enable'} zone ${zone.label}`}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="left">{zone.active ? 'Disable zone' : 'Enable zone'}</TooltipContent>
            </Tooltip>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-muted/50 px-2 py-2">
              <p className="text-heading-sm font-bold tabular-nums text-foreground">
                {live ? (zone.currentCount ?? 0) : '—'}
              </p>
              <p className="text-caption text-muted-foreground">Inside now</p>
            </div>
            <div className="rounded-lg bg-muted/50 px-2 py-2">
              <p className="text-heading-sm font-bold tabular-nums text-foreground">
                {formatNumber(zone.totalEntries ?? 0)}
              </p>
              <p className="text-caption text-muted-foreground">Entries</p>
            </div>
            <div className="rounded-lg bg-muted/50 px-2 py-2">
              <p className="text-heading-sm font-bold tabular-nums text-foreground">
                {zone.avgDwellMs != null ? `${(zone.avgDwellMs / 1000).toFixed(1)}s` : '—'}
              </p>
              <p className="text-caption text-muted-foreground">Avg dwell</p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <p className="text-caption text-muted-foreground">
              Max dwell <span className="font-medium text-foreground">{(zone.maxDwellMs / 1000).toFixed(0)}s</span>
            </p>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onStartEdit}
                    disabled={isEditing || busy}
                    aria-label={`Rename zone ${zone.label}`}
                  >
                    <PenLine className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Rename</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onDuplicate}
                    disabled={busy}
                    aria-label={`Duplicate zone ${zone.label}`}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Duplicate</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={onDelete}
                    disabled={busy}
                    aria-label={`Delete zone ${zone.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Delete</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function DeleteZoneDialog({
  zone,
  onClose,
  onConfirm,
}: {
  zone: Zone | null;
  onClose: () => void;
  onConfirm: (zone: Zone) => void;
}) {
  return (
    <Dialog open={zone !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" aria-hidden="true" />
            Delete zone
          </DialogTitle>
          <DialogDescription>
            This permanently removes the zone and its dwell rules. Zone history stays in analytics.
          </DialogDescription>
        </DialogHeader>
        {zone ? (
          <div className="rounded-lg border border-border bg-muted/50 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border border-border" style={{ backgroundColor: zone.color }} aria-hidden="true" />
              <p className="text-body-sm font-medium text-foreground">{zone.label}</p>
            </div>
            <p className="font-mono text-caption text-muted-foreground">{zone.id}</p>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => zone && onConfirm(zone)} className="gap-2">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete zone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ZonesPage() {
  const router = useRouter();
  const [streams, setStreams] = React.useState<StreamOption[]>([]);
  const [selectedStream, setSelectedStream] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftLabel, setDraftLabel] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState<Zone | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const { zones, isLoading, error, updateZone, deleteZone, duplicateZone, exportZones, refetch } =
    useZones({ streamId: selectedStream });

  React.useEffect(() => {
    fetchJson<StreamOption[]>('/api/streams')
      .then((data) => {
        setStreams(data);
        const running = data.find((s) => s.status === 'running') ?? data[0];
        if (running) setSelectedStream(running.stream_id);
      })
      .catch(() => {});
  }, []);

  const live = zones.length > 0 && zones.some((z) => z.currentCount != null) && !!selectedStream;

  const runAction = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const startEdit = (zone: Zone) => {
    setEditingId(zone.id);
    setDraftLabel(zone.label);
  };

  const commitEdit = (zone: Zone) => {
    const label = draftLabel.trim();
    setEditingId(null);
    if (label && label !== zone.label) {
      void runAction(zone.id, () => updateZone(zone.id, { label }));
    }
  };

  const confirmDelete = (zone: Zone) => {
    setDeleteTarget(null);
    void runAction(zone.id, () => deleteZone(zone.id));
  };

  const exportJson = () => {
    const content = exportZones(
      zones.map((z) => z.id),
      { includeStats: true, includeGeometry: true, format: 'json' }
    );
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexusvision-zones-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeCount = zones.filter((z) => z.active).length;
  const totalEntries = zones.reduce((sum, z) => sum + (z.totalEntries ?? 0), 0);
  const dwellValues = zones.map((z) => z.avgDwellMs).filter((v): v is number => v != null && v > 0);
  const avgDwell = dwellValues.length > 0 ? dwellValues.reduce((a, b) => a + b, 0) / dwellValues.length : null;

  return (
    <DashboardLayout>
      <TooltipProvider>
        <div className="space-y-6">
          <PageHeader
            title="Zones"
            description="Manage detection zones, dwell rules, and live occupancy."
            actions={
              <>
                <Button variant="outline" onClick={exportJson} disabled={zones.length === 0} className="gap-2">
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Export JSON
                </Button>
                <Button variant="outline" onClick={() => void refetch()} className="gap-2">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Refresh
                </Button>
                <Button onClick={() => router.push('/designer')} className="gap-2">
                  <PenTool className="h-4 w-4" aria-hidden="true" />
                  Open Designer
                </Button>
              </>
            }
          />

          {/* Live monitoring selector */}
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Radio className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-body-sm font-medium text-foreground">Live occupancy monitoring</p>
                <p className="text-caption text-muted-foreground">
                  {streams.length === 0
                    ? 'No streams registered yet — counts will show once a stream is running.'
                    : 'Pick the stream whose zone events drive the live counts.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={selectedStream || undefined}
                onValueChange={setSelectedStream}
                disabled={streams.length === 0}
              >
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
              <Badge variant={live ? 'success' : 'secondary'} className="gap-1.5">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: live ? 'hsl(var(--status-online))' : 'hsl(var(--muted-foreground))' }}
                />
                {live ? 'LIVE' : 'IDLE'}
              </Badge>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Zones" value={zones.length} icon={Shapes} tone="primary" loading={isLoading} />
            <StatCard label="Active Zones" value={activeCount} icon={Boxes} tone="success" loading={isLoading} />
            <StatCard
              label="Total Entries"
              value={formatNumber(totalEntries)}
              icon={Activity}
              loading={isLoading}
              hint="All-time, per zone"
            />
            <StatCard
              label="Avg Dwell"
              value={avgDwell != null ? `${(avgDwell / 1000).toFixed(1)}s` : '—'}
              icon={Timer}
              loading={isLoading}
              hint="Across zones with data"
            />
          </div>

          {(error || actionError) && zones.length === 0 ? (
            <Card>
              <ErrorState title="Could not load zones" description={error ?? actionError ?? undefined} onRetry={() => void refetch()} />
            </Card>
          ) : isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <div className="aspect-video w-full animate-pulse bg-muted/60" />
                  <div className="space-y-3 p-4">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted/60" />
                    <div className="h-12 w-full animate-pulse rounded bg-muted/40" />
                    <div className="h-8 w-full animate-pulse rounded bg-muted/60" />
                  </div>
                </Card>
              ))}
            </div>
          ) : zones.length === 0 ? (
            <Card>
              <EmptyState
                icon={Camera}
                title="No zones yet"
                description="Draw detection zones over a live stream to count vehicles, measure dwell time, and trigger alerts."
                action={
                  <Button onClick={() => router.push('/designer')} className="gap-2">
                    <PenTool className="h-4 w-4" aria-hidden="true" />
                    Open Zone Designer
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {zones.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  live={live}
                  isEditing={editingId === zone.id}
                  draftLabel={draftLabel}
                  onDraftChange={setDraftLabel}
                  onStartEdit={() => startEdit(zone)}
                  onCommitEdit={() => commitEdit(zone)}
                  onCancelEdit={() => setEditingId(null)}
                  onToggleActive={() => void runAction(zone.id, () => updateZone(zone.id, { active: !zone.active }))}
                  onDuplicate={() => void runAction(zone.id, () => duplicateZone(zone.id))}
                  onDelete={() => setDeleteTarget(zone)}
                  busy={busyId === zone.id}
                />
              ))}
            </div>
          )}

          {actionError && zones.length > 0 ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-body-sm text-destructive">
              {actionError}
            </p>
          ) : null}

          <DeleteZoneDialog zone={deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
        </div>
      </TooltipProvider>
    </DashboardLayout>
  );
}
