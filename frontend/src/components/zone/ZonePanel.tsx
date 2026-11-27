'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { 
  MapPin, 
  Trash2, 
  Edit2, 
  Eye, 
  EyeOff,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Plus,
  Filter,
  Search,
  ChevronDown
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Input } from '@/components/ui/Input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/DropdownMenu';

interface Zone {
  id: string;
  label: string;
  points: { x: number; y: number }[];
  color: string;
  maxDwellMs: number;
  active: boolean;
  currentCount: number;
  totalEntries: number;
  avgDwellMs: number;
  vehicleDistribution: Record<string, number>;
}

interface ZonePanelProps {
  zones: any[];
  selectedZoneId: string | null;
  onZoneSelect: (zoneId: string | null) => void;
  onZoneEdit: (zoneId: string) => void;
  onZoneDelete: (zoneId: string) => void;
  onZoneToggle: (zoneId: string, active: boolean) => void;
  onZoneDuplicate: (zoneId: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterStatus: 'all' | 'active' | 'inactive';
  setFilterStatus: (status: 'all' | 'active' | 'inactive') => void;
}

const ZONE_COLORS = [
  '#06b6d4', '#f97316', '#a855f7', '#22c55e', '#eab308', '#ec4899', '#14b8a6', '#f43f5e',
];

function ZoneCard({
  zone,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onToggle,
  onDuplicate,
}: {
  zone: any;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
}) {
  const dwellMinutes = Math.round(zone.avgDwellMs / 1000 / 60 * 10) / 10;
  const dwellLimitMinutes = Math.round(zone.maxDwellMs / 1000 / 60);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative card-hover p-4',
        isSelected && 'ring-2 ring-primary border-primary/50 bg-primary/5'
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="h-3 w-3 rounded-full border-2 flex-shrink-0"
              style={{ 
                backgroundColor: zone.active ? zone.color : 'transparent',
                borderColor: zone.color,
              }}
            />
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-sm truncate">{zone.label || zone.id}</h4>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge 
                  variant={zone.active ? 'success' : 'secondary'}
                  className="gap-1"
                >
                  {zone.active ? (
                    <>
                      <span className="relative flex h-1.5 w-1.5 rounded-full bg-status-online">
                        <span className="absolute inset-0 rounded-full animate-pulse-slow bg-status-online" />
                      </span>
                      Active
                    </>
                  ) : 'Inactive'}
                </Badge>
                <span className="font-mono">{zone.points?.length || 0} pts</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="flex h-2 w-2 rounded-full" style={{ backgroundColor: '#06b6d4' }} />
              <span>{zone.vehicleDistribution?.cars || 0}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: '#f97316' }} />
              <span>{zone.vehicleDistribution?.trucks || 0}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: '#a855f7' }} />
              <span>{zone.vehicleDistribution?.buses || 0}</span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <div className="h-2 w-2 rounded-full" style={{ backgroundColor: '#22c55e' }} />
              <span>{zone.vehicleDistribution?.motorcycles || 0}</span>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4"/></svg>
              <span>Avg: {Math.round((zone.avgDwellMs || 0) / 1000 / 60 * 10) / 10} min</span>
              {zone.maxDwellMs > 0 && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className={(zone.avgDwellMs || 0) > (zone.maxDwellMs || 0) ? 'text-status-warning' : 'text-muted-foreground'}>
                    Limit: {Math.round((zone.maxDwellMs || 0) / 1000 / 60)} min
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs font-medium">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-mono">{(zone.totalEntries || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label="Edit zone">
                  <Edit2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Edit zone</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} aria-label="Duplicate zone">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l4 4m-4 4v12m0 0l-4 4m4-4l4-4"/></svg>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Duplicate zone</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onToggle(); }} aria-label="Toggle">
                  {zone.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">{zone.active ? "Deactivate" : "Activate"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete zone">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Delete zone</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </motion.div>
  );
}

export function ZonePanel({
  zones,
  selectedZoneId,
  onZoneSelect,
  onZoneEdit,
  onZoneDelete,
  onZoneToggle,
  onZoneDuplicate,
  searchQuery,
  setSearchQuery,
  filterStatus,
  setFilterStatus,
}: ZonePanelProps) {
  const filteredZones = zones
    .filter(zone => {
      if (filterStatus === 'active' && !zone.active) return false;
      if (filterStatus === 'inactive' && zone.active) return false;
      if (searchQuery && !zone.label.toLowerCase().includes(searchQuery.toLowerCase()) && !zone.id.includes(searchQuery)) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return b.totalEntries - a.totalEntries;
    });

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-heading-md font-semibold">Monitoring Zones</h2>
              <p className="text-caption text-muted-foreground">
                {zones.filter(z => z.active).length} of {zones.length} active
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative hidden sm:block">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                <input
                  type="search"
                  placeholder="Search zones..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={false}
                />
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Filter className="h-4 w-4" />
                      <span className="hidden sm:inline">Filter</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setFilterStatus('all')}>All Zones</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setFilterStatus('active')}>Active Only</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setFilterStatus('inactive')}>Inactive Only</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            {filteredZones.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MapPin className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No zones found</p>
              </div>
            ) : (
              filteredZones.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  isSelected={selectedZoneId === zone.id}
                  onSelect={() => onZoneSelect(selectedZoneId === zone.id ? null : zone.id)}
                  onEdit={() => onZoneEdit(zone.id)}
                  onDelete={() => onZoneDelete(zone.id)}
                  onToggle={() => onZoneToggle(zone.id, !zone.active)}
                  onDuplicate={() => onZoneDuplicate(zone.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

export default ZonePanel;
