import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  const { x, y } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonArea(polygon: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i]!.x * polygon[j]!.y - polygon[j]!.x * polygon[i]!.y;
  }
  return Math.abs(area) / 2;
}

export function polygonCentroid(polygon: { x: number; y: number }[]): { x: number; y: number } {
  let cx = 0;
  let cy = 0;
  const area = polygonArea(polygon) * 2;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const factor = polygon[i]!.x * polygon[j]!.y - polygon[j]!.x * polygon[i]!.y;
    cx += (polygon[i]!.x + polygon[j]!.x) * factor;
    cy += (polygon[i]!.y + polygon[j]!.y) * factor;
  }
  return { x: cx / (3 * area), y: cy / (3 * area) };
}
