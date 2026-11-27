'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, FileText, FileCode, FileSpreadsheet, Check, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Checkbox } from '@/components/ui/Checkbox';
import { Label } from '@/components/ui/Label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/RadioGroup';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { Zone } from './ZoneCanvas';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  zones: Zone[];
  onExport: (format: 'json' | 'yaml' | 'csv', options: ExportOptions) => void;
}

interface ExportOptions {
  includeStats: boolean;
  includeGeometry: boolean;
  selectedZoneIds: string[];
}

const FORMAT_OPTIONS = [
  { value: 'json', label: 'JSON', icon: FileCode, desc: 'Machine-readable, preserves all data types' },
  { value: 'yaml', label: 'YAML', icon: FileText, desc: 'Human-readable, great for version control' },
  { value: 'csv', label: 'CSV', icon: FileSpreadsheet, desc: 'Spreadsheet compatible, flattened geometry' },
] as const;

export function ExportDialog({ isOpen, onClose, zones, onExport }: ExportDialogProps) {
  const [format, setFormat] = React.useState<'json' | 'yaml' | 'csv'>('json');
  const [includeStats, setIncludeStats] = React.useState(true);
  const [includeGeometry, setIncludeGeometry] = React.useState(true);
  const [selectedZoneIds, setSelectedZoneIds] = React.useState<string[]>(
    zones.map(z => z.id)
  );
  const [isExporting, setIsExporting] = React.useState(false);

  const toggleZone = (zoneId: string) => {
    setSelectedZoneIds(prev => prev.includes(zoneId)
      ? prev.filter(id => id !== zoneId)
      : [...prev, zoneId]
    );
  };

  const selectAll = () => setSelectedZoneIds(zones.map(z => z.id));
  const selectNone = () => setSelectedZoneIds([]);

  const handleExport = async () => {
    if (selectedZoneIds.length === 0) return;
    setIsExporting(true);
    try {
      onExport(format, { includeStats, includeGeometry, selectedZoneIds });
    } finally {
      setIsExporting(false);
      onClose();
    }
  };

  const generatePreview = () => {
    const selectedZones = zones.filter(z => selectedZoneIds.includes(z.id));
    switch (format) {
      case 'json':
        return JSON.stringify({
          version: '1.0',
          exportedAt: new Date().toISOString(),
          zoneCount: selectedZones.length,
          zones: selectedZones.map(z => ({
            ...z,
            points: includeGeometry ? z.points : undefined,
            currentCount: includeStats ? z.currentCount : undefined,
            totalEntries: includeStats ? z.totalEntries : undefined,
            avgDwellMs: includeStats ? z.avgDwellMs : undefined,
            vehicleDistribution: includeStats ? z.vehicleDistribution : undefined,
          })),
        }, null, 2);
      case 'yaml':
        return `# NexusVision Zone Export
version: "1.0"
exportedAt: "${new Date().toISOString()}"
zoneCount: ${selectedZones.length}
zones:
${selectedZones.map(z => `  - id: "${z.id}"
    label: "${z.label}"
    color: "${z.color}"
    maxDwellMs: ${z.maxDwellMs}
    active: ${z.active}
${includeGeometry ? `    points:${z.points.map(p => `\n      - x: ${p.x}\n        y: ${p.y}`).join('')}` : ''}
${includeStats ? `    currentCount: ${z.currentCount}
    totalEntries: ${z.totalEntries}
    avgDwellMs: ${z.avgDwellMs}
    vehicleDistribution: ${JSON.stringify(z.vehicleDistribution)}` : ''}`).join('\n')}`;
      case 'csv':
        const headers = ['id', 'label', 'color', 'maxDwellMs', 'active'];
        if (includeGeometry) headers.push('points');
        if (includeStats) headers.push('currentCount', 'totalEntries', 'avgDwellMs', 'vehicleDistribution');
        const rows = selectedZones.map(z => {
          const row = [z.id, z.label, z.color, z.maxDwellMs, z.active];
          if (includeGeometry) row.push(z.points.map(p => `${p.x},${p.y}`).join(';'));
          if (includeStats) row.push(z.currentCount || 0, z.totalEntries || 0, z.avgDwellMs || 0, JSON.stringify(z.vehicleDistribution || {}));
          return row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });
        return [headers.join(','), ...rows].join('\n');
    }
  };

  const preview = generatePreview();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-3xl max-h-[90vh] bg-card rounded-xl border border-border shadow-elevation-5 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h2 className="text-heading-md font-semibold">Export Zones</h2>
              <p className="text-body-sm text-muted-foreground">{zones.length} zone{zones.length !== 1 ? 's' : ''} available</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} disabled={isExporting}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-4 space-y-6 max-h-[calc(90vh-140px)] overflow-y-auto">
            {/* Format Selection */}
            <div className="space-y-3">
              <Label className="text-body-sm font-medium">Format</Label>
              <RadioGroup value={format} onValueChange={(v) => setFormat(v as any)} className="grid grid-cols-3 gap-3">
                {FORMAT_OPTIONS.map(opt => (
                  <TooltipProvider key={opt.value}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <RadioGroupItem
                          value={opt.value}
                          className={cn(
                            'relative flex flex-col items-start p-4 border-2 rounded-xl transition-all',
                            format === opt.value
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          )}
                        >
                          <opt.icon className={cn('h-6 w-6 mb-2', format === opt.value ? 'text-primary' : 'text-muted-foreground')} />
                          <span className="font-medium text-sm">{opt.label}</span>
                          <span className="text-caption text-muted-foreground mt-1">{opt.desc}</span>
                        </RadioGroupItem>
                      </TooltipTrigger>
                      <TooltipContent side="top" align="center">
                        <p className="font-medium">{opt.label}</p>
                        <p className="text-sm text-muted-foreground">{opt.desc}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </RadioGroup>
            </div>

            <Separator />

            {/* Options */}
            <div className="space-y-3">
              <Label className="text-body-sm font-medium">Options</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={includeGeometry}
                    onCheckedChange={(c) => setIncludeGeometry(!!c)}
                    disabled={format === 'csv' && !includeGeometry}
                  />
                  <span className="text-body-sm">Include Geometry (polygon points)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={includeStats}
                    onCheckedChange={(c) => setIncludeStats(!!c)}
                  />
                  <span className="text-body-sm">Include Live Stats (counts, dwell, distribution)</span>
                </label>
              </div>
              <p className="text-caption text-muted-foreground">
                {format === 'csv' && 'Note: CSV always includes geometry. '}Selected zones: {selectedZoneIds.length}
              </p>
            </div>

            <Separator />

            {/* Zone Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-body-sm font-medium mb-0">Select Zones ({selectedZoneIds.length}/{zones.length})</Label>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll} disabled={selectedZoneIds.length === zones.length}>
                    All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={selectNone} disabled={selectedZoneIds.length === 0}>
                    None
                  </Button>
                </div>
              </div>
              <ScrollArea className="max-h-48 rounded-lg border border-border">
                <div className="p-2 space-y-1">
                  {zones.map(zone => (
                    <label
                      key={zone.id}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                        selectedZoneIds.includes(zone.id)
                          ? 'bg-primary/10'
                          : 'hover:bg-accent/50'
                      )}
                    >
                      <Checkbox
                        checked={selectedZoneIds.includes(zone.id)}
                        onCheckedChange={() => toggleZone(zone.id)}
                      />
                      <div
                        className="w-3 h-3 rounded-full border-2 flex-shrink-0"
                        style={{
                          backgroundColor: zone.active ? zone.color : 'transparent',
                          borderColor: zone.color,
                        }}
                      />
                      <span className="font-medium text-sm truncate flex-1">{zone.label}</span>
                      <Badge variant="secondary" className="text-xs">
                        {zone.points.length} pts
                      </Badge>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <Separator />

            {/* Preview */}
            <div className="space-y-3">
              <Label className="text-body-sm font-medium">Preview ({preview.length} chars)</Label>
              <div className="relative">
                <pre className="bg-background p-3 rounded-lg border border-border max-h-64 overflow-auto text-xs font-mono text-muted-foreground">
                  {preview.slice(0, 5000)}{preview.length > 5000 ? '\n... (truncated)' : ''}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => navigator.clipboard.writeText(preview)}
                  disabled={isExporting}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
            <Button variant="outline" onClick={onClose} disabled={isExporting}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={selectedZoneIds.length === 0 || isExporting}>
              {isExporting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Download className="h-4 w-4 mr-2" />
              Export {format.toUpperCase()}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}