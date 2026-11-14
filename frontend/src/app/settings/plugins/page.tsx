'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import {
  Puzzle,
  RefreshCw,
  Package,
  Trash2,
  Loader2,
  Download,
  CircleCheck,
  CircleX,
  Activity,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { PageHeader, StatCard, EmptyState, ErrorState } from '@/components/common';
import { fetchJson, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Plugin {
  name: string;
  version: string;
  author: string;
  description: string;
  category: string;
  status?: string;
  installed: boolean;
  enabled?: boolean;
  error?: string | null;
  result_count?: number;
}

interface PluginsResponse {
  plugins: Plugin[];
}

interface PluginResultEntry {
  plugin_name: string;
  timestamp: number;
  data: Record<string, unknown>;
  metrics: Record<string, number> | null;
  error: string | null;
}

interface PluginResultsResponse {
  name: string;
  results: PluginResultEntry[];
}

const CATEGORY_TONES: Record<string, 'default' | 'secondary' | 'outline'> = {
  counting: 'default',
  detection: 'secondary',
  tracking: 'outline',
  general: 'secondary',
};

function PluginCard({
  plugin,
  busy,
  onInstall,
  onToggle,
  onUninstall,
  onViewResults,
}: {
  plugin: Plugin;
  busy: boolean;
  onInstall: (plugin: Plugin) => void;
  onToggle: (plugin: Plugin, enabled: boolean) => void;
  onUninstall: (plugin: Plugin) => void;
  onViewResults: (plugin: Plugin) => void;
}) {
  const hasResults = (plugin.result_count ?? 0) > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="h-full transition-shadow duration-300 hover:shadow-elevation-3">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">{plugin.name}</CardTitle>
              <CardDescription className="mt-1">{plugin.description}</CardDescription>
            </div>
            <Badge variant={CATEGORY_TONES[plugin.category] ?? 'secondary'} className="shrink-0 capitalize">
              {plugin.category}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            <span className="tabular-nums">v{plugin.version}</span>
            <span aria-hidden>·</span>
            <span>by {plugin.author}</span>
          </div>

          {plugin.error ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-caption text-destructive">
              {plugin.error}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
            {plugin.installed ? (
              <>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={plugin.enabled ?? false}
                    onCheckedChange={(checked) => onToggle(plugin, checked)}
                    disabled={busy}
                    aria-label={`Enable ${plugin.name}`}
                  />
                  <span className={cn('text-caption', plugin.enabled ? 'text-success' : 'text-muted-foreground')}>
                    {plugin.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {hasResults ? (
                    <Button variant="ghost" size="sm" className="text-caption" onClick={() => onViewResults(plugin)}>
                      <Activity className="h-4 w-4 mr-1.5" />
                      {plugin.result_count} results
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Uninstall ${plugin.name}`}
                    disabled={busy}
                    onClick={() => onUninstall(plugin)}
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex w-full justify-end">
                <Button size="sm" disabled={busy} onClick={() => onInstall(plugin)}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Install
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function PluginsPage() {
  const [plugins, setPlugins] = React.useState<Plugin[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [busyName, setBusyName] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [resultsTarget, setResultsTarget] = React.useState<Plugin | null>(null);
  const [results, setResults] = React.useState<PluginResultEntry[] | null>(null);
  const [resultsLoading, setResultsLoading] = React.useState(false);

  const load = React.useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const data = await fetchJson<PluginsResponse>('/api/plugins');
      setPlugins(data.plugins ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load plugins');
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const runAction = async (plugin: Plugin, action: () => Promise<unknown>) => {
    setBusyName(plugin.name);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Plugin action failed');
    } finally {
      setBusyName(null);
    }
  };

  const install = (plugin: Plugin) =>
    runAction(plugin, () =>
      fetchJson('/api/plugins/install', {
        method: 'POST',
        body: JSON.stringify({ name: plugin.name }),
      })
    );

  const toggle = (plugin: Plugin, enabled: boolean) =>
    runAction(plugin, () =>
      fetchJson(`/api/plugins/${plugin.name}/${enabled ? 'enable' : 'disable'}`, { method: 'POST' })
    );

  const uninstall = (plugin: Plugin) =>
    runAction(plugin, () => fetchJson(`/api/plugins/${plugin.name}`, { method: 'DELETE' }));

  const openResults = async (plugin: Plugin) => {
    setResultsTarget(plugin);
    setResults(null);
    setResultsLoading(true);
    try {
      const data = await fetchJson<PluginResultsResponse>(`/api/plugins/${plugin.name}/results?limit=20`);
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setResultsLoading(false);
    }
  };

  const installedCount = plugins.filter((p) => p.installed).length;
  const enabledCount = plugins.filter((p) => p.installed && p.enabled).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Plugins"
          description="Extend NexusVision with modular analytics processors"
          actions={
            <Button variant="outline" size="sm" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCw className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          }
        />

        {error ? (
          <ErrorState title="Plugin registry unavailable" description={error} onRetry={() => load(true)} />
        ) : (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard label="Available" value={plugins.length} icon={Puzzle} loading={loading} />
              <StatCard label="Installed" value={installedCount} icon={Package} loading={loading} />
              <StatCard
                label="Enabled"
                value={enabledCount}
                icon={CircleCheck}
                tone="success"
                loading={loading}
              />
              <StatCard
                label="Errors"
                value={plugins.filter((p) => p.error).length}
                icon={CircleX}
                tone={plugins.some((p) => p.error) ? 'destructive' : 'default'}
                loading={loading}
              />
            </div>

            {actionError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-body-sm text-destructive">
                {actionError}
              </p>
            ) : null}

            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-52" />
                ))}
              </div>
            ) : plugins.length === 0 ? (
              <Card>
                <CardContent>
                  <EmptyState
                    icon={Puzzle}
                    title="No plugins in the registry"
                    description="Built-in plugins appear here automatically when the backend discovers them."
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {plugins.map((plugin) => (
                  <PluginCard
                    key={plugin.name}
                    plugin={plugin}
                    busy={busyName === plugin.name}
                    onInstall={install}
                    onToggle={toggle}
                    onUninstall={uninstall}
                    onViewResults={openResults}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={resultsTarget !== null} onOpenChange={(open) => !open && setResultsTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{resultsTarget?.name} — recent results</DialogTitle>
            <DialogDescription>Latest 20 processing results from this plugin</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {resultsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : !results || results.length === 0 ? (
              <p className="py-8 text-center text-body-sm text-muted-foreground">
                No results recorded yet. The plugin produces results as frames and events flow.
              </p>
            ) : (
              <div className="space-y-2">
                {results.map((r, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background/50 p-3">
                    <div className="flex items-center justify-between text-caption text-muted-foreground">
                      <span className="tabular-nums">{new Date(r.timestamp * 1000).toLocaleTimeString()}</span>
                      {r.error ? (
                        <span className="text-destructive">{r.error}</span>
                      ) : (
                        <CircleCheck className="h-3.5 w-3.5 text-success" />
                      )}
                    </div>
                    <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted/60 p-2 text-[11px] leading-relaxed text-foreground">
                      {JSON.stringify(r.data, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
