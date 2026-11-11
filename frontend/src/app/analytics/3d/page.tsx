'use client';

import * as React from 'react';
import { Suspense } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader, StatCard, ErrorState, EmptyState } from '@/components/common';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Box, RefreshCw, Boxes } from 'lucide-react';
import { fetchJson } from '@/lib/api';

interface Vehicle {
  id: string;
  position: [number, number, number];
  class_name: string;
  speed: number;
  color: string;
}

interface Zone3D {
  id: string;
  label: string;
  points: [number, number][];
  color: string;
  height: number;
}

interface Camera3D {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  fov: number;
  color: string;
}

interface BackendZone {
  zone_id: string;
  label: string;
  color: string;
  coordinates: { x: number; y: number }[];
}

interface TrajectoryPoint {
  track_id: string;
  timestamp: string;
  x: number;
  y: number;
  speed: number;
  vehicle_class: string;
}

const VEHICLE_COLORS: Record<string, string> = {
  car: '#60a5fa',
  truck: '#f87171',
  bus: '#fbbf24',
  motorcycle: '#a78bfa',
  bicycle: '#34d399',
  pedestrian: '#f472b6',
};

const SCALE = 45;

function LoadingFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/40">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-caption text-muted-foreground">Loading 3D scene…</p>
      </div>
    </div>
  );
}

function LiveScene({ zones, vehicles }: { zones: Zone3D[]; vehicles: Vehicle[] }) {
  const [Scene3D, setScene3D] = React.useState<React.ComponentType<{
    vehicles: Vehicle[];
    zones: Zone3D[];
    cameras: Camera3D[];
    showGrid?: boolean;
  }> | null>(null);

  React.useEffect(() => {
    let mounted = true;
    import('@/components/three/Scene3D').then((mod) => {
      if (mounted) setScene3D(() => mod.Scene3D);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!Scene3D) return <LoadingFallback />;
  return <Scene3D vehicles={vehicles} zones={zones} cameras={[]} showGrid />;
}

export default function Analytics3DPage() {
  const [zones, setZones] = React.useState<Zone3D[]>([]);
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchScene = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [zoneData, trajData] = await Promise.all([
        fetchJson<BackendZone[]>('/api/zones'),
        fetchJson<{ trajectories: { points: TrajectoryPoint[]; vehicle_class: string }[] }>(
          '/api/analytics/trajectories?page_size=25'
        ).catch(() => ({ trajectories: [] as { points: TrajectoryPoint[]; vehicle_class: string }[] })),
      ]);

      const usable = zoneData.filter((z) => z.coordinates.length >= 3);
      if (usable.length === 0) {
        setZones([]);
        setVehicles([]);
        return;
      }

      // Fit all zone geometry into the scene, centered
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const z of usable) {
        for (const p of z.coordinates) {
          minX = Math.min(minX, p.x);
          maxX = Math.max(maxX, p.x);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const toScene = (x: number, y: number): [number, number] => [(x - cx) / SCALE, (y - cy) / SCALE];

      setZones(
        usable.map((z) => ({
          id: z.zone_id,
          label: z.label,
          points: z.coordinates.map((p) => toScene(p.x, p.y)),
          color: z.color,
          height: 0.5,
        }))
      );

      // Place one vehicle per trajectory at its most recent recorded point
      const sceneVehicles: Vehicle[] = [];
      for (const traj of trajData.trajectories) {
        const last = traj.points[traj.points.length - 1];
        if (!last) continue;
        const [sx, sz] = toScene(last.x, last.y);
        sceneVehicles.push({
          id: traj.points[0]?.track_id ?? `${sceneVehicles.length}`,
          position: [sx, 0.5, sz],
          class_name: last.vehicle_class || traj.vehicle_class,
          speed: last.speed,
          color: VEHICLE_COLORS[last.vehicle_class] ?? '#60a5fa',
        });
      }
      setVehicles(sceneVehicles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scene data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchScene();
  }, [fetchScene]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="3D Visualization"
          description="Spatial view of your zones and the latest recorded vehicle positions."
          actions={
            <Button variant="outline" onClick={() => void fetchScene()} disabled={isLoading} className="gap-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Refresh
            </Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Zones in Scene" value={zones.length} icon={Box} tone="primary" loading={isLoading} />
          <StatCard
            label="Vehicles Positioned"
            value={vehicles.length}
            icon={Boxes}
            tone={vehicles.length > 0 ? 'success' : 'default'}
            loading={isLoading}
            hint={vehicles.length === 0 && !isLoading ? 'Vehicles appear once detection events exist' : undefined}
          />
        </div>

        {error ? (
          <Card>
            <ErrorState title="Could not load scene data" description={error} onRetry={() => void fetchScene()} />
          </Card>
        ) : isLoading ? (
          <Card className="h-[540px] animate-pulse bg-muted/40" />
        ) : zones.length === 0 ? (
          <Card>
            <EmptyState
              icon={Box}
              title="No zones to visualize"
              description="Create zones in the Zone Designer to see them laid out in 3D space."
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="h-[540px] w-full">
              <Suspense fallback={<LoadingFallback />}>
                <LiveScene zones={zones} vehicles={vehicles} />
              </Suspense>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-caption text-muted-foreground">
              <div className="flex gap-4">
                <span>Drag to rotate</span>
                <span>Scroll to zoom</span>
                <span>Right-click to pan</span>
              </div>
              {vehicles.length === 0 ? (
                <span>No vehicle positions recorded yet</span>
              ) : (
                <span>
                  {vehicles.length} vehicles at last recorded position
                </span>
              )}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
