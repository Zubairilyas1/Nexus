'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { HelpCircle, Check } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { TooltipProvider } from '@radix-ui/react-tooltip';

import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';

export interface Zone {
  id: string;
  label: string;
  points: { x: number; y: number }[];
  color: string;
  maxDwellMs: number;
  active: boolean;
  currentCount?: number;
  totalEntries?: number;
  avgDwellMs?: number;
  vehicleDistribution?: Record<string, number>;
}

interface ZoneCanvasProps {
  videoWidth: number;
  videoHeight: number;
  zones: Zone[];
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string | null) => void;
  onZoneCreate: (label: string, points: { x: number; y: number }[], color: string) => void;
  onZoneUpdate: (zoneId: string, updates: Partial<Zone>) => void;
  onZoneDelete: (zoneId: string) => void;
  onPointsChange: (zoneId: string, points: { x: number; y: number }[]) => void;
  drawingMode: boolean;
  setDrawingMode: (mode: boolean) => void;
  currentPoints: { x: number; y: number; id: string }[];
  setCurrentPoints: (points: { x: number; y: number; id: string }[]) => void;
  /** When set, completing a polygon updates this zone instead of creating a new one. */
  editingZoneId?: string | null;
  snapThreshold?: number;
  gridSize?: number;
  showGrid?: boolean;
}

export const ZONE_COLORS = [
  '#06b6d4',
  '#f97316',
  '#a855f7',
  '#22c55e',
  '#eab308',
  '#ec4899',
  '#14b8a6',
  '#f43f5e',
];

interface ViewSize {
  w: number;
  h: number;
}

const snapToGrid = (x: number, y: number, gridSize: number): { x: number; y: number } => ({
  x: Math.round(x / gridSize) * gridSize,
  y: Math.round(y / gridSize) * gridSize,
});

const distance = (p1: { x: number; y: number }, p2: { x: number; y: number }): number =>
  Math.hypot(p1.x - p2.x, p1.y - p2.y);

export function ZoneCanvas({
  videoWidth,
  videoHeight,
  zones,
  selectedZoneId,
  onZoneSelect,
  onZoneCreate,
  onZoneUpdate,
  onZoneDelete,
  onPointsChange,
  drawingMode,
  setDrawingMode,
  currentPoints,
  setCurrentPoints,
  editingZoneId = null,
  snapThreshold = 14,
  gridSize = 20,
  showGrid = false,
}: ZoneCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<ViewSize>({ w: 0, h: 0 });
  const [hoveredPoint, setHoveredPoint] = React.useState<{ zoneId: string; index: number } | null>(null);
  const [draggedPoint, setDraggedPoint] = React.useState<{ zoneId: string; index: number } | null>(null);
  const [showHelp, setShowHelp] = React.useState(false);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setView({ w: el.clientWidth, h: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const videoToView = React.useCallback(
    (x: number, y: number): { x: number; y: number } =>
      view.w > 0 && view.h > 0
        ? { x: (x / videoWidth) * view.w, y: (y / videoHeight) * view.h }
        : { x: 0, y: 0 },
    [view, videoWidth, videoHeight]
  );

  const viewToVideo = React.useCallback(
    (x: number, y: number): { x: number; y: number } =>
      view.w > 0 && view.h > 0
        ? { x: (x / view.w) * videoWidth, y: (y / view.h) * videoHeight }
        : { x: 0, y: 0 },
    [view, videoWidth, videoHeight]
  );

  const completePolygon = React.useCallback(() => {
    if (currentPoints.length < 3) return;
    const points = currentPoints.map((p) => ({ x: p.x, y: p.y }));
    if (editingZoneId) {
      onZoneUpdate(editingZoneId, { points });
    } else {
      const label = `Zone ${zones.length + 1}`;
      const color = ZONE_COLORS[zones.length % ZONE_COLORS.length] ?? '#06b6d4';
      onZoneCreate(label, points, color);
    }
    setDrawingMode(false);
    setCurrentPoints([]);
  }, [currentPoints, editingZoneId, zones.length, onZoneCreate, onZoneUpdate, setDrawingMode, setCurrentPoints]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingMode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const videoPos = viewToVideo(e.clientX - rect.left, e.clientY - rect.top);
    const snapped = showGrid ? snapToGrid(videoPos.x, videoPos.y, gridSize) : videoPos;
    const newPoint = {
      x: Math.max(0, Math.min(videoWidth, snapped.x)),
      y: Math.max(0, Math.min(videoHeight, snapped.y)),
      id: `pt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    };

    // Auto-complete when clicking near the first point of a 3+ point polygon
    if (currentPoints.length >= 3) {
      const first = currentPoints[0];
      if (first && distance(videoToView(first.x, first.y), { x: e.clientX - rect.left, y: e.clientY - rect.top }) < snapThreshold) {
        completePolygon();
        return;
      }
    }
    setCurrentPoints([...currentPoints, newPoint]);
  };

  const getPointAtPosition = (x: number, y: number): { zoneId: string; index: number } | null => {
    if (drawingMode) {
      for (let i = 0; i < currentPoints.length; i++) {
        const p = currentPoints[i];
        if (!p) continue;
        if (distance(videoToView(p.x, p.y), { x, y }) < snapThreshold) {
          return { zoneId: 'drawing', index: i };
        }
      }
    }
    for (const zone of zones) {
      for (let i = 0; i < zone.points.length; i++) {
        const p = zone.points[i];
        if (!p) continue;
        if (distance(videoToView(p.x, p.y), { x, y }) < snapThreshold) {
          return { zoneId: zone.id, index: i };
        }
      }
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (draggedPoint) {
      if (drawingMode && draggedPoint.zoneId === 'drawing') {
        const videoPos = viewToVideo(x, y);
        const snapped = showGrid ? snapToGrid(videoPos.x, videoPos.y, gridSize) : videoPos;
        setCurrentPoints(
          currentPoints.map((p, i) =>
            i === draggedPoint.index
              ? { ...p, x: Math.max(0, Math.min(videoWidth, snapped.x)), y: Math.max(0, Math.min(videoHeight, snapped.y)) }
              : p
          )
        );
      } else {
        const zone = zones.find((z) => z.id === draggedPoint.zoneId);
        if (zone) {
          const videoPos = viewToVideo(x, y);
          const snapped = showGrid ? snapToGrid(videoPos.x, videoPos.y, gridSize) : videoPos;
          onPointsChange(
            zone.id,
            zone.points.map((p, i) =>
              i === draggedPoint.index
                ? { ...p, x: Math.max(0, Math.min(videoWidth, snapped.x)), y: Math.max(0, Math.min(videoHeight, snapped.y)) }
                : p
            )
          );
        }
      }
    } else {
      setHoveredPoint(getPointAtPosition(x, y));
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (drawingMode) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const hit = getPointAtPosition(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) setDraggedPoint(hit);
  };

  const handleMouseUp = () => setDraggedPoint(null);

  // Right-click a vertex to delete it
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const hit = getPointAtPosition(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit) return;

    if (drawingMode && hit.zoneId === 'drawing') {
      setCurrentPoints(currentPoints.filter((_, i) => i !== hit.index));
      return;
    }
    const zone = zones.find((z) => z.id === hit.zoneId);
    if (zone && zone.points.length > 3) {
      onPointsChange(zone.id, zone.points.filter((_, i) => i !== hit.index));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDrawingMode(false);
      setCurrentPoints([]);
      onZoneSelect(null);
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedZoneId) {
        onZoneDelete(selectedZoneId);
        onZoneSelect(null);
      }
    }
    if (e.key === ' ') {
      e.preventDefault();
      setDrawingMode(!drawingMode);
      if (!drawingMode) setCurrentPoints([]);
    }
    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (drawingMode && currentPoints.length > 0) {
        setCurrentPoints(currentPoints.slice(0, -1));
      }
    }
    if (e.key === 'Enter') {
      if (drawingMode) {
        e.preventDefault();
        completePolygon();
      }
    }
  };

  // Draw on canvas
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

    ctx.clearRect(0, 0, view.w, view.h);

    if (showGrid) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1;
      const stepX = Math.max((gridSize / videoWidth) * view.w, 8);
      const stepY = Math.max((gridSize / videoHeight) * view.h, 8);
      for (let x = 0; x <= view.w; x += stepX) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, view.h);
        ctx.stroke();
      }
      for (let y = 0; y <= view.h; y += stepY) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(view.w, y);
        ctx.stroke();
      }
    }

    zones.forEach((zone, index) => {
      if (zone.points.length < 2) return;

      const displayPoints = zone.points.map((p) => videoToView(p.x, p.y));
      const isSelected = zone.id === selectedZoneId;
      const isHovered = hoveredPoint?.zoneId === zone.id;

      ctx.beginPath();
      const first = displayPoints[0];
      if (first) ctx.moveTo(first.x, first.y);
      for (let i = 1; i < displayPoints.length; i++) {
        const pt = displayPoints[i];
        if (pt) ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();

      ctx.fillStyle = `${zone.color}${isSelected ? '40' : isHovered ? '30' : '18'}`;
      ctx.fill();

      ctx.strokeStyle = zone.active ? zone.color : '#71717a';
      ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 2;
      ctx.setLineDash(isSelected ? [] : [5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (displayPoints.length > 0) {
        const centroid = displayPoints.reduce(
          (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
          { x: 0, y: 0 }
        );
        centroid.x /= displayPoints.length;
        centroid.y /= displayPoints.length;

        const labelText = zone.currentCount != null ? `${zone.label} · ${zone.currentCount}` : zone.label || `Zone ${index + 1}`;
        ctx.font = '600 12px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const textWidth = ctx.measureText(labelText).width;
        ctx.fillStyle = 'rgba(9, 9, 11, 0.75)';
        ctx.fillRect(centroid.x - textWidth / 2 - 6, centroid.y - 20, textWidth + 12, 18);
        ctx.fillStyle = zone.active ? zone.color : '#a1a1aa';
        ctx.fillText(labelText, centroid.x, centroid.y - 11);
      }
    });

    if (drawingMode && currentPoints.length > 0) {
      const displayPoints = currentPoints.map((p) => videoToView(p.x, p.y));
      const color = editingZoneId
        ? zones.find((z) => z.id === editingZoneId)?.color ?? '#06b6d4'
        : ZONE_COLORS[zones.length % ZONE_COLORS.length] ?? '#06b6d4';

      ctx.beginPath();
      const first = displayPoints[0];
      if (first) ctx.moveTo(first.x, first.y);
      for (let i = 1; i < displayPoints.length; i++) {
        const pt = displayPoints[i];
        if (pt) ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = 0; i < displayPoints.length; i++) {
        const display = displayPoints[i];
        if (!display) continue;
        ctx.beginPath();
        ctx.arc(display.x, display.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#22c55e' : color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '500 11px Inter, system-ui';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${i + 1}`, display.x, display.y + 1);
      }
    }

    const selectedZone = zones.find((z) => z.id === selectedZoneId);
    if (selectedZone && !drawingMode) {
      selectedZone.points.forEach((point, i) => {
        const display = videoToView(point.x, point.y);
        const isHovered = hoveredPoint?.zoneId === selectedZone.id && hoveredPoint?.index === i;

        ctx.beginPath();
        ctx.arc(display.x, display.y, isHovered ? 10 : 8, 0, Math.PI * 2);
        ctx.fillStyle = isHovered ? '#f97316' : selectedZone.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '500 11px Inter, system-ui';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${i + 1}`, display.x, display.y + 1);
      });
    }
  }, [
    zones,
    selectedZoneId,
    drawingMode,
    currentPoints,
    hoveredPoint,
    view,
    videoWidth,
    videoHeight,
    showGrid,
    gridSize,
    videoToView,
    editingZoneId,
  ]);

  const canComplete = drawingMode && currentPoints.length >= 3;

  return (
    <TooltipProvider>
      <div
        ref={containerRef}
        className="absolute inset-0 z-10 h-full w-full overflow-hidden bg-transparent"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="application"
        aria-label="Zone drawing canvas"
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            cursor: drawingMode ? 'crosshair' : hoveredPoint ? 'grab' : 'default',
          }}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={handleContextMenu}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 glass h-8 w-8"
              onClick={() => setShowHelp(!showHelp)}
              aria-label="Toggle help"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" align="start" className="max-w-xs">
            <div className="space-y-1.5 p-1">
              <h4 className="text-sm font-semibold">Keyboard shortcuts</h4>
              <dl className="space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between gap-6"><dt>Space</dt><dd>Toggle drawing mode</dd></div>
                <div className="flex justify-between gap-6"><dt>Enter</dt><dd>Complete polygon</dd></div>
                <div className="flex justify-between gap-6"><dt>Esc</dt><dd>Cancel / deselect</dd></div>
                <div className="flex justify-between gap-6"><dt>Delete</dt><dd>Delete selected zone</dd></div>
                <div className="flex justify-between gap-6"><dt>Ctrl+Z</dt><dd>Remove last point</dd></div>
                <div className="flex justify-between gap-6"><dt>Right-click</dt><dd>Delete a vertex</dd></div>
              </dl>
            </div>
          </TooltipContent>
        </Tooltip>

        {drawingMode && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2 shadow-elevation-3"
          >
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="text-sm font-medium">
                {editingZoneId ? 'Editing zone' : 'Drawing mode'}
              </span>
            </div>
            <Badge variant="secondary" className="text-xs">
              {currentPoints.length} points
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDrawingMode(false);
                setCurrentPoints([]);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              className={cn('gap-1.5', !canComplete && 'opacity-50')}
              disabled={!canComplete}
              onClick={completePolygon}
            >
              <Check className="h-3.5 w-3.5" />
              Complete
            </Button>
          </motion.div>
        )}

        {selectedZoneId && !drawingMode && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-3 left-3 right-3 lg:right-auto lg:w-72"
          >
            <Card className="glass">
              <CardContent className="p-3">
                {(() => {
                  const zone = zones.find((z) => z.id === selectedZoneId);
                  return (
                    <>
                      <div className="mb-2 flex items-center justify-between">
                        <h4 className="text-sm font-medium">{zone?.label}</h4>
                        <Badge variant={zone?.active ? 'success' : 'secondary'}>
                          {zone?.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div>Vertices: {zone?.points.length ?? 0}</div>
                        <div>Max dwell: {Math.round((zone?.maxDwellMs ?? 0) / 1000)}s</div>
                        <div className="text-caption">Drag vertices to reshape · right-click to delete</div>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default ZoneCanvas;
