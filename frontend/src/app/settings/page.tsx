'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  User,
  Users,
  Cpu,
  Activity,
  Plug,
  LogOut,
  UserPlus,
  Loader2,
  Gauge,
  Database,
  RefreshCw,
  Server,
  ShieldCheck,
  Mail,
  Trash2,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Skeleton } from '@/components/ui/Skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { PageHeader, EmptyState, ErrorState } from '@/components/common';
import { fetchJson, ApiError, formatNumber } from '@/lib/api';
import { cn } from '@/lib/utils';

type SectionId = 'profile' | 'users' | 'model' | 'system' | 'plugins';

const SECTIONS: { id: SectionId; label: string; description: string }[] = [
  { id: 'profile', label: 'Profile', description: 'Your account and session' },
  { id: 'users', label: 'Users', description: 'Team members and roles' },
  { id: 'model', label: 'AI Model', description: 'Detection models and runtimes' },
  { id: 'system', label: 'System', description: 'Backend health and resources' },
  { id: 'plugins', label: 'Plugins', description: 'Analytics plugin registry' },
];

const ROLE_OPTIONS = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'ORG_ADMIN', label: 'Org Admin' },
  { value: 'EDITOR', label: 'Editor' },
  { value: 'VIEWER', label: 'Viewer' },
];

function roleLabel(role: string | null | undefined): string {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role ?? '—';
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function usageTone(percent: number): string {
  if (percent < 60) return 'bg-status-online';
  if (percent < 85) return 'bg-status-warning';
  return 'bg-destructive';
}

/* ---------------------------------- Profile ---------------------------------- */

function ProfileSection() {
  const { data: session, status } = useSession();
  const user = session?.user;

  if (status === 'loading') {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-5">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={User} title="Not signed in" description="Sign in to view your profile." />
        </CardContent>
      </Card>
    );
  }

  const displayName = user.name || user.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Identity carried by your authenticated session</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-semibold text-primary">
            {initials || <User className="h-7 w-7" />}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-heading-sm font-semibold">{displayName}</p>
              <Badge variant="secondary">{roleLabel(user.globalRole)}</Badge>
            </div>
            <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              {user.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-background/50 p-4">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Organization</p>
            <p className="mt-1 text-sm font-medium">{user.orgName ?? 'No active organization'}</p>
            {user.orgRole ? (
              <p className="mt-0.5 text-caption text-muted-foreground">{roleLabel(user.orgRole)} in this org</p>
            ) : null}
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-4">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Access</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-success" />
              Authenticated session
            </p>
            <p className="mt-0.5 text-caption text-muted-foreground">Credentials sign-in, JWT-backed API access</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => signOut({ callbackUrl: '/auth/login' })}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------- Users ----------------------------------- */

interface OrgUser {
  id: string;
  email: string;
  name: string | null;
  global_role: string;
  org_role: string | null;
  status: string;
  joined_at: string | null;
  created_at: string;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  SUSPENDED: 'destructive',
  REVOKED: 'destructive',
};

function UsersSection() {
  const { data: session } = useSession();
  const [users, setUsers] = React.useState<OrgUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState('VIEWER');
  const [inviting, setInviting] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [roleTarget, setRoleTarget] = React.useState<OrgUser | null>(null);
  const [newRole, setNewRole] = React.useState('VIEWER');
  const [roleBusy, setRoleBusy] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<OrgUser | null>(null);
  const [removeBusy, setRemoveBusy] = React.useState(false);

  const canManage = session?.user?.globalRole === 'SUPER_ADMIN' || session?.user?.globalRole === 'ORG_ADMIN';

  const load = React.useCallback(async () => {
    try {
      const data = await fetchJson<OrgUser[]>('/api/auth/users');
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setInviting(true);
    setInviteError(null);
    try {
      await fetchJson('/api/auth/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('VIEWER');
      load();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async () => {
    if (!roleTarget) return;
    setRoleBusy(true);
    try {
      await fetchJson(`/api/auth/users/${roleTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      setRoleTarget(null);
      load();
    } catch (err) {
      setRoleTarget(null);
      setError(err instanceof ApiError ? err.message : 'Role update failed');
    } finally {
      setRoleBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await fetchJson(`/api/auth/users/${removeTarget.id}`, { method: 'DELETE' });
      setRemoveTarget(null);
      load();
    } catch (err) {
      setRemoveTarget(null);
      setError(err instanceof ApiError ? err.message : 'Remove failed');
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Users</CardTitle>
          <CardDescription>Members of your organization and their roles</CardDescription>
        </div>
        {canManage ? (
          <Button
            size="sm"
            onClick={() => {
              setInviteEmail('');
              setInviteRole('VIEWER');
              setInviteError(null);
              setInviteOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Invite
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : error ? (
          <ErrorState title="Users unavailable" description={error} onRetry={load} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users found"
            description={canManage ? 'Invite your first team member.' : 'You are not part of an organization yet.'}
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Global Role</TableHead>
                  <TableHead>Org Role</TableHead>
                  <TableHead>Joined</TableHead>
                  {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <Badge variant={STATUS_TONE[u.status] ?? 'secondary'}>{u.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{u.name || u.email.split('@')[0]}</p>
                      <p className="text-caption text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{roleLabel(u.global_role)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.org_role ? 'default' : 'secondary'}>{roleLabel(u.org_role)}</Badge>
                    </TableCell>
                    <TableCell className="text-caption text-muted-foreground">
                      {u.joined_at ? new Date(u.joined_at).toLocaleDateString() : 'Pending'}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        {u.id === session?.user?.id ? (
                          <span className="text-caption text-muted-foreground">You</span>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRoleTarget(u);
                                setNewRole(u.org_role ?? 'VIEWER');
                              }}
                            >
                              Change role
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              aria-label={`Remove ${u.email}`}
                              onClick={() => setRemoveTarget(u)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Invite */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite user</DialogTitle>
            <DialogDescription>
              They receive a pending membership and set their password on first sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Organization role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inviteError ? (
              <p className="text-body-sm text-destructive">{inviteError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={!inviteEmail || inviting}>
              {inviting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role change */}
      <Dialog open={roleTarget !== null} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role</DialogTitle>
            <DialogDescription>
              {roleTarget ? `New organization role for ${roleTarget.email}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <Label>Role</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleRoleChange} disabled={roleBusy}>
              {roleBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Update role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <Dialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove user</DialogTitle>
            <DialogDescription>
              {removeTarget
                ? `Remove ${removeTarget.email} from the organization? They lose access immediately.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removeBusy}>
              {removeBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* -------------------------------- AI Model ---------------------------------- */

interface ModelFile {
  name: string;
  path: string;
  size_mb: number;
  format: string;
}

interface ModelInfoResponse {
  models: ModelFile[];
  backends: Record<string, boolean>;
}

interface BenchmarkResult {
  mean_ms: number;
  min_ms: number;
  max_ms: number;
  fps: number;
}

const BACKEND_LABELS: Record<string, string> = {
  onnx_cpu: 'ONNX CPU',
  onnx_cuda: 'ONNX CUDA',
  tensorrt: 'TensorRT',
};

function ModelSection() {
  const [info, setInfo] = React.useState<ModelInfoResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [benchmarkPath, setBenchmarkPath] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, BenchmarkResult>>({});
  const [benchError, setBenchError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await fetchJson<ModelInfoResponse>('/api/model/info');
      setInfo(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load model info');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const runBenchmark = async (model: ModelFile) => {
    setBenchmarkPath(model.path);
    setBenchError(null);
    try {
      const result = await fetchJson<BenchmarkResult>('/api/model/benchmark', {
        method: 'POST',
        body: JSON.stringify({ model_path: model.path, num_runs: 20 }),
      });
      setResults((prev) => ({ ...prev, [model.path]: result }));
    } catch (err) {
      setBenchError(err instanceof ApiError ? err.message : 'Benchmark failed');
    } finally {
      setBenchmarkPath(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Model</CardTitle>
        <CardDescription>Models discovered on the backend and available runtimes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : error ? (
          <ErrorState title="Model info unavailable" description={error} onRetry={load} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(info?.backends ?? {}).map(([key, available]) => (
                <Badge key={key} variant={available ? 'success' : 'secondary'} className="gap-1.5">
                  <Cpu className="h-3 w-3" />
                  {BACKEND_LABELS[key] ?? key}
                  {available ? '' : ' (unavailable)'}
                </Badge>
              ))}
            </div>

            {benchError ? <p className="text-body-sm text-destructive">{benchError}</p> : null}

            {info && info.models.length > 0 ? (
              <div className="space-y-3">
                {info.models.map((model) => {
                  const result = results[model.path];
                  const running = benchmarkPath === model.path;
                  return (
                    <div key={model.path} className="rounded-lg border border-border bg-background/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-mono text-sm font-medium">{model.name}</p>
                            <Badge variant="outline" className="uppercase">
                              {model.format}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-caption text-muted-foreground tabular-nums">
                            {model.size_mb.toFixed(1)} MB · {model.path}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => runBenchmark(model)} disabled={running}>
                          {running ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Gauge className="h-4 w-4 mr-2" />
                          )}
                          Benchmark
                        </Button>
                      </div>
                      {result ? (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border pt-3">
                          <div>
                            <p className="text-caption text-muted-foreground">Mean</p>
                            <p className="text-sm font-semibold tabular-nums">{result.mean_ms.toFixed(2)} ms</p>
                          </div>
                          <div>
                            <p className="text-caption text-muted-foreground">Min</p>
                            <p className="text-sm font-semibold tabular-nums">{result.min_ms.toFixed(2)} ms</p>
                          </div>
                          <div>
                            <p className="text-caption text-muted-foreground">Max</p>
                            <p className="text-sm font-semibold tabular-nums">{result.max_ms.toFixed(2)} ms</p>
                          </div>
                          <div>
                            <p className="text-caption text-muted-foreground">Throughput</p>
                            <p className="text-sm font-semibold tabular-nums text-success">
                              {result.fps.toFixed(1)} inf/s
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                icon={Cpu}
                title="No models found"
                description="Place an ONNX model file in the backend models/ directory to enable detection."
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- System ----------------------------------- */

interface HealthzResponse {
  status: string;
  version: string;
  environment: string;
  uptime_seconds: number;
}

interface DepsResponse {
  status: string;
  memory_used_percent: number;
  cpu_used_percent: number;
  disk_used_percent: number;
  redis_connected: boolean;
  postgres_connected: boolean;
  model_loaded: boolean;
  frame_queue_size: number;
  frame_queue_max: number;
  frame_drops: number;
  total_frames_processed: number;
  total_frames_dropped: number;
  any_stream_running: boolean;
}

function UsageBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-caption">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{percent.toFixed(0)}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all duration-500', usageTone(percent))}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

function SystemSection() {
  const [health, setHealth] = React.useState<HealthzResponse | null>(null);
  const [deps, setDeps] = React.useState<DepsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [h, d] = await Promise.all([
        fetchJson<HealthzResponse>('/healthz'),
        fetchJson<DepsResponse>('/healthz/deps'),
      ]);
      setHealth(h);
      setDeps(d);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load system health');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-20" />
          <Skeleton className="h-40" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <ErrorState title="System health unavailable" description={error} onRetry={load} />
        </CardContent>
      </Card>
    );
  }

  const services = [
    { name: 'Backend API', ok: health?.status === 'ok' },
    { name: 'PostgreSQL', ok: deps?.postgres_connected ?? false },
    { name: 'Redis', ok: deps?.redis_connected ?? false },
    { name: 'Model runtime', ok: deps?.model_loaded ?? false },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>System</CardTitle>
          <CardDescription>Live backend status, refreshed every 15 seconds</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {services.map((s) => (
            <div key={s.name} className="rounded-lg border border-border bg-background/50 p-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-2 w-2 rounded-full',
                    s.ok ? 'bg-status-online' : 'bg-status-warning'
                  )}
                />
                <p className="text-caption uppercase tracking-wider text-muted-foreground">{s.name}</p>
              </div>
              <p className={cn('mt-1 text-sm font-semibold', s.ok ? 'text-success' : 'text-warning')}>
                {s.ok ? 'Operational' : 'Degraded'}
              </p>
            </div>
          ))}
        </div>

        {deps ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <UsageBar label="CPU" percent={deps.cpu_used_percent} />
            <UsageBar label="Memory" percent={deps.memory_used_percent} />
            <UsageBar label="Disk" percent={deps.disk_used_percent} />
          </div>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Version</p>
            <p className="mt-1 text-sm font-medium tabular-nums">{health?.version ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Environment</p>
            <p className="mt-1 text-sm font-medium">{health?.environment ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Uptime</p>
            <p className="mt-1 text-sm font-medium tabular-nums">
              {health ? formatUptime(health.uptime_seconds) : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <p className="text-caption uppercase tracking-wider text-muted-foreground">Frames processed</p>
            <p className="mt-1 text-sm font-medium tabular-nums">
              {deps ? formatNumber(deps.total_frames_processed) : '—'}
            </p>
          </div>
        </div>

        {deps && deps.any_stream_running ? (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background/50 p-3 text-body-sm">
            <Activity className="h-4 w-4 text-success" />
            <span className="tabular-nums">
              Frame pipeline active — {formatNumber(deps.total_frames_dropped)} drops, queue{' '}
              {deps.frame_queue_size}/{deps.frame_queue_max}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background/50 p-3 text-body-sm text-muted-foreground">
            <Server className="h-4 w-4" />
            No streams capturing right now
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------- Plugins ---------------------------------- */

function PluginsSection() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Plugins</CardTitle>
        <CardDescription>Analytics plugins extend the platform with additional processing</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-border bg-background/50 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Plug className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Plugin manager</p>
              <p className="mt-0.5 text-body-sm text-muted-foreground">
                Install, enable, and configure analytics plugins from the registry.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/plugins">
              Open plugin manager
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ----------------------------------- Page ------------------------------------ */

export default function SettingsPage() {
  const [active, setActive] = React.useState<SectionId>('profile');

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          description="Account, team, models, and system configuration"
        />

        {/* Mobile section switcher */}
        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {SECTIONS.map((s) => (
            <Button
              key={s.id}
              variant={active === s.id ? 'default' : 'outline'}
              size="sm"
              className="shrink-0"
              onClick={() => setActive(s.id)}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Nav rail */}
          <nav className="hidden lg:block" aria-label="Settings sections">
            <Card className="sticky top-0">
              <CardContent className="p-2">
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActive(s.id)}
                    aria-current={active === s.id ? 'page' : undefined}
                    className={cn(
                      'w-full rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active === s.id
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className="mt-0.5 block text-caption text-muted-foreground">{s.description}</span>
                  </button>
                ))}
              </CardContent>
            </Card>

            <div className="mt-4 flex items-center gap-2 px-3 text-caption text-muted-foreground">
              <Zap className="h-3.5 w-3.5" />
              <Database className="h-3.5 w-3.5" />
              <span>Changes on this page persist immediately</span>
            </div>
          </nav>

          {/* Section content */}
          <div className="lg:col-span-3">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {active === 'profile' ? <ProfileSection /> : null}
              {active === 'users' ? <UsersSection /> : null}
              {active === 'model' ? <ModelSection /> : null}
              {active === 'system' ? <SystemSection /> : null}
              {active === 'plugins' ? <PluginsSection /> : null}
            </motion.div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
