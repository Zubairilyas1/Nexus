'use client';

import * as React from 'react';
import { useNexusStream } from '@/hooks/useNexusStream';
import { Zone } from '@/components/zone/ZoneCanvas';
import { fetchJson } from '@/lib/api';

interface UseZonesOptions {
  streamId: string;
  autoLoad?: boolean;
}

interface UseZonesReturn {
  zones: Zone[];
  isLoading: boolean;
  error: string | null;
  createZone: (zone: Omit<Zone, 'id'>) => Promise<Zone>;
  updateZone: (id: string, updates: Partial<Zone>) => Promise<Zone>;
  deleteZone: (id: string) => Promise<void>;
  duplicateZone: (id: string) => Promise<Zone>;
  importZones: (zones: Omit<Zone, 'id'>[], strategy: 'replace' | 'merge' | 'skip') => Promise<Zone[]>;
  exportZones: (zoneIds: string[], options: ExportOptions) => string;
  refetch: () => Promise<void>;
}

interface ExportOptions {
  includeStats: boolean;
  includeGeometry: boolean;
  format: 'json' | 'yaml' | 'csv';
}

interface BackendZone {
  zone_id: string;
  label: string;
  color: string;
  coordinates: { x: number; y: number }[];
  max_dwell_ms: number;
  active: boolean;
  total_entries: number;
  avg_dwell_ms: number;
  project_id: string;
  current_count?: number;
  created_at: string;
}

const fromBackend = (z: BackendZone): Zone => ({
  id: z.zone_id,
  label: z.label,
  points: z.coordinates.map((p) => ({ x: p.x, y: p.y })),
  color: z.color,
  maxDwellMs: z.max_dwell_ms,
  active: z.active,
  totalEntries: z.total_entries,
  avgDwellMs: z.avg_dwell_ms,
});

const toBackendCreate = (zone: Omit<Zone, 'id'>, streamId: string) => ({
  label: zone.label,
    stream_id: streamId,
  coordinates: zone.points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
  color: zone.color,
  max_dwell_ms: zone.maxDwellMs,
});

const LOCAL_ONLY_FIELDS = ['currentCount', 'totalEntries', 'avgDwellMs', 'vehicleDistribution'] as const;

function hasPersistedChanges(updates: Partial<Zone>): boolean {
  return Object.keys(updates).some((key) => !(LOCAL_ONLY_FIELDS as readonly string[]).includes(key));
}

export function useZones({ streamId, autoLoad = true }: UseZonesOptions): UseZonesReturn {
  const { zoneEvents, sendZoneUpdate, isConnected } = useNexusStream({
    streamId,
    wsBaseUrl: '',
    autoConnect: autoLoad && !!streamId,
  });

  const [zones, setZones] = React.useState<Zone[]>([]);
  const [isLoading, setIsLoading] = React.useState(autoLoad);
  const [error, setError] = React.useState<string | null>(null);

  const refetch = React.useCallback(async () => {
    setError(null);
    try {
      const data = await fetchJson<BackendZone[]>(`/api/zones?stream_id=${streamId}`);
      setZones(data.map(fromBackend));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load zones');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (autoLoad) {
      refetch();
    }
  }, [autoLoad, refetch]);

  // Apply live counts derived from WebSocket zone events (entered/exited deltas)
  React.useEffect(() => {
    if (zoneEvents.length === 0) return;
    setZones((prev) => {
      let changed = false;
      const next = prev.map((zone) => {
        const relevant = zoneEvents.filter((e) => e.zone_id === zone.id);
        if (relevant.length === 0) return zone;
        const delta = relevant.reduce((sum, e) => {
          if (e.event_type === 'entered') return sum + 1;
          if (e.event_type === 'exited') return sum - 1;
          return sum;
        }, 0);
        const totalEntries = zone.totalEntries ?? 0;
        const newEntries = totalEntries + relevant.filter((e) => e.event_type === 'entered').length;
        if (delta === 0 && newEntries === totalEntries) return zone;
        changed = true;
        return {
          ...zone,
          currentCount: Math.max(0, (zone.currentCount ?? 0) + delta),
          totalEntries: newEntries,
        };
      });
      return changed ? next : prev;
    });
  }, [zoneEvents]);

  const createZone = React.useCallback(
    async (zone: Omit<Zone, 'id'>) => {
      setError(null);
      try {
        const created = await fetchJson<BackendZone>('/api/zones', {
          method: 'POST',
          body: JSON.stringify(toBackendCreate(zone, streamId)),
        });
        const mapped = fromBackend(created);
        setZones((prev) => [...prev, mapped]);
        if (isConnected) {
          sendZoneUpdate({ zone_id: mapped.id, coordinates: mapped.points.map((p) => [p.x, p.y]) });
        }
        return mapped;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create zone');
        throw err;
      }
    },
    [isConnected, sendZoneUpdate]
  );

  const updateZone = React.useCallback(
    async (id: string, updates: Partial<Zone>) => {
      setError(null);
      const existing = zones.find((z) => z.id === id);
      if (!existing) throw new Error('Zone not found');

      // Local-only stat fields never hit the API
      if (!hasPersistedChanges(updates)) {
        const merged = { ...existing, ...updates };
        setZones((prev) => prev.map((z) => (z.id === id ? merged : z)));
        return merged;
      }

      try {
        const body: Record<string, unknown> = {};
        if (updates.label !== undefined) body.label = updates.label;
        if (updates.color !== undefined) body.color = updates.color;
        if (updates.maxDwellMs !== undefined) body.max_dwell_ms = updates.maxDwellMs;
        if (updates.active !== undefined) body.active = updates.active;
        if (updates.points !== undefined) {
          body.coordinates = updates.points.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
        }

        const updated = await fetchJson<BackendZone>(`/api/zones/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        const mapped = { ...fromBackend(updated), currentCount: existing.currentCount };
        setZones((prev) => prev.map((z) => (z.id === id ? mapped : z)));
        if (isConnected && updates.points) {
          sendZoneUpdate({ zone_id: id, coordinates: updates.points.map((p) => [p.x, p.y]) });
        }
        return mapped;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update zone');
        throw err;
      }
    },
    [zones, isConnected, sendZoneUpdate]
  );

  const deleteZone = React.useCallback(async (id: string) => {
    setError(null);
    try {
      await fetchJson<void>(`/api/zones/${id}`, { method: 'DELETE' });
      setZones((prev) => prev.filter((z) => z.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete zone');
      throw err;
    }
  }, []);

  const duplicateZone = React.useCallback(
    async (id: string) => {
      const existing = zones.find((z) => z.id === id);
      if (!existing) throw new Error('Zone not found');
      return createZone({
        ...existing,
        label: `${existing.label} (Copy)`,
        points: existing.points.map((p) => ({ x: p.x, y: p.y })),
      });
    },
    [zones, createZone]
  );

  const importZones = React.useCallback(
    async (zonesToImport: Omit<Zone, 'id'>[], strategy: 'replace' | 'merge' | 'skip') => {
      setError(null);
      try {
        if (strategy === 'replace') {
          await Promise.all(zones.map((z) => fetchJson<void>(`/api/zones/${z.id}`, { method: 'DELETE' })));
          setZones([]);
        }

        const imported: Zone[] = [];
        for (const zone of zonesToImport) {
          const existing = zones.find((z) => z.label.toLowerCase() === zone.label.toLowerCase());
          if (existing) {
            if (strategy === 'merge') {
              imported.push(await updateZone(existing.id, zone));
            }
            // 'skip' leaves existing zone untouched
          } else {
            imported.push(await createZone(zone));
          }
        }
        return imported;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import zones');
        throw err;
      }
    },
    [zones, createZone, updateZone]
  );

  const exportZones = React.useCallback(
    (zoneIds: string[], options: ExportOptions): string => {
      const selectedZones = zones.filter((z) => zoneIds.includes(z.id));

      const data = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        streamId,
        zoneCount: selectedZones.length,
        zones: selectedZones.map((z) => ({
          ...z,
          points: options.includeGeometry ? z.points : undefined,
          currentCount: options.includeStats ? z.currentCount : undefined,
          totalEntries: options.includeStats ? z.totalEntries : undefined,
          avgDwellMs: options.includeStats ? z.avgDwellMs : undefined,
          vehicleDistribution: options.includeStats ? z.vehicleDistribution : undefined,
        })),
      };

      switch (options.format) {
        case 'yaml':
          return `# NexusVision Zone Export
version: "1.0"
exportedAt: "${data.exportedAt}"
streamId: "${data.streamId}"
zoneCount: ${data.zoneCount}
zones:
${data.zones.map((z) => `  - id: "${z.id}"
    label: "${z.label}"
    color: "${z.color}"
    maxDwellMs: ${z.maxDwellMs}
    active: ${z.active}
${options.includeGeometry ? `    points:${z.points?.map((p) => `\n      - x: ${p.x}\n        y: ${p.y}`).join('') || ''}` : ''}
${options.includeStats ? `    currentCount: ${z.currentCount ?? 0}
    totalEntries: ${z.totalEntries ?? 0}
    avgDwellMs: ${z.avgDwellMs ?? 0}
    vehicleDistribution: ${JSON.stringify(z.vehicleDistribution ?? {})}` : ''}`).join('\n')}`;
        case 'csv': {
          const headers = ['id', 'label', 'color', 'maxDwellMs', 'active'];
          if (options.includeGeometry) headers.push('points');
          if (options.includeStats) headers.push('currentCount', 'totalEntries', 'avgDwellMs', 'vehicleDistribution');
          const rows = data.zones.map((z) => {
            const row = [z.id, z.label, z.color, z.maxDwellMs, z.active];
            if (options.includeGeometry) row.push(z.points?.map((p) => `${p.x},${p.y}`).join(';') || '');
            if (options.includeStats)
              row.push(
                String(z.currentCount ?? 0),
                String(z.totalEntries ?? 0),
                String(z.avgDwellMs ?? 0),
                JSON.stringify(z.vehicleDistribution ?? {})
              );
            return row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
          });
          return [headers.join(','), ...rows].join('\n');
        }
        default:
          return JSON.stringify(data, null, 2);
      }
    },
    [zones, streamId]
  );

  return {
    zones,
    isLoading,
    error,
    createZone,
    updateZone,
    deleteZone,
    duplicateZone,
    importZones,
    exportZones,
    refetch,
  };
}
