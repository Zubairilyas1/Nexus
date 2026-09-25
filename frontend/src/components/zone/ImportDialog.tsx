'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileText, AlertCircle, CheckCircle, Loader2, Minus, Plus, Search, ChevronDown, ChevronUp } from 'lucide-react';
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
import { Input } from '@/components/ui/Input';
import { Zone } from './ZoneCanvas';

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  existingZones: Zone[];
  onImport: (zones: Zone[], strategy: 'replace' | 'merge' | 'skip') => void;
}

const STRATEGY_OPTIONS = [
  { value: 'merge', label: 'Merge (Upsert)', desc: 'Update existing zones by label, add new ones', icon: Plus },
  { value: 'replace', label: 'Replace All', desc: 'Delete all existing zones, import fresh', icon: Upload },
  { value: 'skip', label: 'Skip Existing', desc: 'Only add zones with new labels', icon: Minus },
] as const;

interface ParsedZone {
  id: string;
  label: string;
  color: string;
  maxDwellMs: number;
  active: boolean;
  points: { x: number; y: number }[];
  currentCount?: number;
  totalEntries?: number;
  avgDwellMs?: number;
  vehicleDistribution?: Record<string, number>;
}

interface ValidationIssue {
  zone: ParsedZone;
  type: 'error' | 'warning';
  message: string;
}

export function ImportDialog({ isOpen, onClose, existingZones, onImport }: ImportDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [parsedZones, setParsedZones] = React.useState<ParsedZone[]>([]);
  const [validationIssues, setValidationIssues] = React.useState<ValidationIssue[]>([]);
  const [strategy, setStrategy] = React.useState<'merge' | 'replace' | 'skip'>('merge');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = React.useState(false);
  const [step, setStep] = React.useState<'upload' | 'preview' | 'complete'>('upload');

  const existingLabels = new Set(existingZones.map(z => z.label.toLowerCase()));

  const parseFile = async (f: File) => {
    const text = await f.text();
    let zones: ParsedZone[] = [];

    try {
      if (f.name.endsWith('.json')) {
        const data = JSON.parse(text);
        if (data.zones && Array.isArray(data.zones)) {
          zones = data.zones;
        } else if (Array.isArray(data)) {
          zones = data;
        }
      } else if (f.name.endsWith('.yaml') || f.name.endsWith('.yml')) {
        // Simple YAML parsing (for demo - in production use js-yaml)
        throw new Error('YAML parsing requires js-yaml library. Please use JSON || CSV.');
      } else if (f.name.endsWith('.csv')) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) throw new Error('CSV must have header and at least one row');
        const headers = (lines[0] || '').split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const pointsIdx = headers.indexOf('points');
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine((lines[i] || ''));
          if (values.length < headers.length) continue;
          const row: Record<string, string> = {};
          headers.forEach((h, idx) => row[h] = values[idx] || '');
          zones.push({
            id: String(row.id || 'zone_' + Date.now() + '_' + i),
            label: String(row.label || 'Imported Zone ' + i),
            color: String(row.color || "#06b6d4"),
            maxDwellMs: parseInt(row.maxDwellMs || '') || 30000,
            active: (row.active || '') === 'true',
            points: pointsIdx >= 0 && row.points
              ? row.points.split(';').map(p => {
                  const [x, y] = p.split(',').map(Number);
                  return { x: x || 0, y: y || 0 };
                })
              : [],
          });
        }
      } else {
        throw new Error('Unsupported file format. Use JSON, YAML, || CSV.');
      }

      // Validate each zone
      const issues: ValidationIssue[] = [];
      zones.forEach(z => {
        if (!z.label) issues.push({ zone: z, type: 'error', message: 'Missing label' });
        if (z.points.length < 3) issues.push({ zone: z, type: 'error', message: 'Zone must have at least 3 points' });
        if (!/^#[0-9A-Fa-f]{6}$/.test(z.color)) issues.push({ zone: z, type: 'warning', message: 'Invalid color format, using default' });
        if (existingLabels.has(z.label.toLowerCase())) {
          issues.push({ zone: z, type: 'warning', message: `Label "${z.label}" already exists` });
        }
      });

      setParsedZones(zones);
      setValidationIssues(issues);
      setStep('preview');
    } catch (err) {
      setValidationIssues([{ zone: {} as ParsedZone, type: 'error', message: err instanceof Error ? err.message : 'Parse failed' }]);
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result.map(v => v.trim().replace(/^"|"$/g, ''));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      parseFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      parseFile(e.dataTransfer.files[0]);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasErrors = validationIssues.some(i => i.type === 'error');
  const hasWarnings = validationIssues.some(i => i.type === 'warning');

  const filteredZones = parsedZones.filter(z =>
    z.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleImport = () => {
    if (hasErrors) return;
    setIsImporting(true);
    try {
      onImport(
        parsedZones.map(z => ({
          ...z,
            color: String(z.color || "#06b6d4"),
        })),
        strategy
      );
      setStep('complete');
    } finally {
      setIsImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setParsedZones([]);
    setValidationIssues([]);
    setSearchQuery('');
    setExpandedRows(new Set());
    setStep('upload');
    (document.getElementById('import-file-input') as HTMLInputElement).value = '';
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-4xl max-h-[90vh] bg-card rounded-xl border border-border shadow-elevation-5 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div>
              <h2 className="text-heading-md font-semibold">Import Zones</h2>
              <p className="text-body-sm text-muted-foreground">
                {step === 'upload' && 'Upload a JSON, YAML, || CSV file'}
                {step === 'preview' && `${parsedZones.length} zone${parsedZones.length !== 1 ? 's' : ''} parsed`}
                {step === 'complete' && 'Import completed successfully'}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} disabled={isImporting}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {step === 'upload' && (
            <div className="p-6 space-y-6">
              {/* Drop Zone */}
              <div
                className={cn(
                  'relative border-2 border-dashed rounded-xl p-8 text-center transition-colors',
                  file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                )}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <input
                  id="import-file-input"
                  type="file"
                  accept=".json,.yaml,.yml,.csv"
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-body-lg font-medium">Drop zone file here || click to browse</p>
                <p className="text-body-sm text-muted-foreground mt-1">JSON, YAML, || CSV • Max 10MB</p>
                <div className="mt-4 flex justify-center gap-4 text-caption text-muted-foreground">
                  <span className="px-2 py-1 bg-background rounded border border-border">.json</span>
                  <span className="px-2 py-1 bg-background rounded border border-border">.yaml</span>
                  <span className="px-2 py-1 bg-background rounded border border-border">.csv</span>
                </div>
              </div>

              {/* Or drag hint */}
              <p className="text-center text-caption text-muted-foreground">Supports exported NexusVision zone files</p>
            </div>
          )}

          {step === 'preview' && (
            <div className="p-4 space-y-4 max-h-[calc(90vh-140px)] overflow-y-auto">
              {/* Validation Summary */}
              {(hasErrors || hasWarnings) && (
                <div className={cn('p-3 rounded-lg border', hasErrors ? 'bg-destructive/10 border-destructive/30' : 'bg-warning/10 border-warning/30')}>
                  <div className="flex items-start gap-3">
                    {hasErrors && (
                      <>
                        <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-destructive">{validationIssues.filter(i => i.type === 'error').length} Error{validationIssues.filter(i => i.type === 'error').length !== 1 ? 's' : ''}</p>
                          <p className="text-caption text-muted-foreground">Fix errors before importing</p>
                        </div>
                      </>
                    )}
                    {hasWarnings && !hasErrors && (
                      <>
                        <AlertCircle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-warning">{validationIssues.filter(i => i.type === 'warning').length} Warning{validationIssues.filter(i => i.type === 'warning').length !== 1 ? 's' : ''}</p>
                          <p className="text-caption text-muted-foreground">Review before importing</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search zones..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Zone List */}
              <ScrollArea className="max-h-96 rounded-lg border border-border">
                <div className="p-2 space-y-1">
                  {filteredZones.map((zone, idx) => {
                    const zoneIssues = validationIssues.filter(i => i.zone.id === zone.id);
                    const hasZoneError = zoneIssues.some(i => i.type === 'error');
                    const isExpanded = expandedRows.has(zone.id);
                    return (
                      <motion.div
                        key={zone.id}
                        layout
                        className={cn(
                          'rounded-lg border overflow-hidden',
                          hasZoneError ? 'border-destructive/30 bg-destructive/5' : 'border-border'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleRow(zone.id)}
                          className="w-full p-3 flex items-center gap-3 text-left"
                        >
                          <div
                            className="w-3 h-3 rounded-full border-2 flex-shrink-0"
                            style={{
                              backgroundColor: zone.active ? zone.color : 'transparent',
                              borderColor: zone.color,
                            }}
                          />
                          <span className={cn('font-medium text-sm truncate flex-1', hasZoneError && 'text-destructive')}>
                            {zone.label}
                          </span>
                          <Badge variant={hasZoneError ? 'destructive' : zoneIssues.length > 0 ? 'warning' : 'success'} className="text-xs">
                            {hasZoneError ? 'Error' : zoneIssues.length > 0 ? 'Warning' : 'OK'}
                          </Badge>
                          <span className="text-caption text-muted-foreground font-mono">{zone.points.length} pts</span>
                          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                        </button>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="px-3 pb-3 border-t border-border/50"
                              style={{ overflow: 'hidden' }}
                            >
                              {zoneIssues.length > 0 && (
                                <div className="space-y-2 pt-2">
                                  {zoneIssues.map((issue, i) => (
                                    <div
                                      key={i}
                                      className={cn(
                                        'flex items-start gap-2 p-2 rounded text-sm',
                                        issue.type === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning'
                                      )}
                                    >
                                      {issue.type === 'error' ? (
                                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                      ) : (
                                        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                      )}
                                      <span>{issue.message}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="pt-2 grid grid-cols-2 gap-2 text-caption text-muted-foreground">
                                <div><span className="font-medium">Color:</span> {zone.color}</div>
                                <div><span className="font-medium">Max Dwell:</span> {zone.maxDwellMs}ms</div>
                                <div><span className="font-medium">Active:</span> {zone.active ? 'Yes' : 'No'}</div>
                                <div><span className="font-medium">Vertices:</span> {zone.points.length}</div>
                              </div>
                              {zone.points.length > 0 && (
                                <details className="pt-2">
                                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                                    View Coordinates ({zone.points.length})
                                  </summary>
                                  <pre className="mt-2 p-2 bg-background rounded text-xs font-mono text-muted-foreground overflow-x-auto max-h-32">
                                    {zone.points.map((p, i) => `  ${i + 1}. x: ${p.x}, y: ${p.y}`).join('\n')}
                                  </pre>
                                </details>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              </ScrollArea>

              {filteredZones.length === 0 && parsedZones.length > 0 && (
                <p className="text-center text-muted-foreground py-8">No zones match your search</p>
              )}

              {/* Strategy Selection */}
              <Separator className="my-4" />
              <div className="space-y-3">
                <Label className="text-body-sm font-medium">Import Strategy</Label>
                <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as any)} className="space-y-2">
                  {STRATEGY_OPTIONS.map(opt => (
                    <TooltipProvider key={opt.value}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <RadioGroupItem
                            value={opt.value}
                            className={cn(
                              'relative flex items-center gap-3 p-3 border rounded-xl transition-all',
                              strategy === opt.value
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            )}
                          >
                            <opt.icon className={cn('h-5 w-5 flex-shrink-0', strategy === opt.value ? 'text-primary' : 'text-muted-foreground')} />
                            <div className="flex-1 text-left">
                              <span className="font-medium text-sm">{opt.label}</span>
                              <p className="text-caption text-muted-foreground">{opt.desc}</p>
                            </div>
                          </RadioGroupItem>
                        </TooltipTrigger>
                        <TooltipContent side="right" align="center">
                          <p className="font-medium">{opt.label}</p>
                          <p className="text-sm text-muted-foreground">{opt.desc}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </RadioGroup>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <CheckCircle className="h-16 w-16 text-success mb-4" />
              <h3 className="text-heading-lg font-semibold mb-2">Import Complete</h3>
              <p className="text-body text-muted-foreground mb-6">
                Successfully imported {parsedZones.length} zone{parsedZones.length !== 1 ? 's' : ''}
              </p>
              <Button onClick={() => { reset(); onClose(); }} className="w-[200px]">
                Done
              </Button>
            </div>
          )}

          {/* Footer */}
          {step !== 'complete' && (
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
              <Button variant="outline" onClick={step === 'preview' ? () => setStep('upload') : onClose} disabled={isImporting}>
                {step === 'preview' ? 'Back' : 'Cancel'}
              </Button>
              {step === 'preview' && (
                <Button onClick={handleImport} disabled={hasErrors || parsedZones.length === 0 || isImporting}>
                  {isImporting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Import Zones
                </Button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}