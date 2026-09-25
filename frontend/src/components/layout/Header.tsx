'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  Menu,
  Search,
  ChevronDown,
  Camera,
  BarChart3,
  MapPin,
  User,
  Settings,
  LogOut,
  Building2,
  LayoutGrid,
  PenTool,
  Flame,
  Route,
  TrendingUp,
  Boxes,
  Plug,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/DropdownMenu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { Separator } from '@/components/ui/Separator';

interface HeaderProps {
  onMenuClick: () => void;
}

interface ReadinessPayload {
  status?: string;
  checks?: Record<string, string>;
}

type SystemHealth = 'checking' | 'ready' | 'degraded' | 'offline';

const NAV_ROUTES = [
  { name: 'Dashboard', href: '/', icon: BarChart3 },
  { name: 'Zones', href: '/zones', icon: MapPin },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Streams', href: '/streams', icon: Camera },
];

const COMMAND_ROUTES = [
  { name: 'Dashboard', href: '/', icon: BarChart3 },
  { name: 'Zone Designer', href: '/designer', icon: PenTool },
  { name: 'Zones', href: '/zones', icon: MapPin },
  { name: 'Analytics Overview', href: '/analytics', icon: BarChart3 },
  { name: 'Heatmap', href: '/analytics/heatmap', icon: Flame },
  { name: 'O-D Matrix', href: '/analytics/od-matrix', icon: Boxes },
  { name: 'Trajectories', href: '/analytics/trajectories', icon: Route },
  { name: 'Predictions', href: '/analytics/predictions', icon: TrendingUp },
  { name: 'Streams', href: '/streams', icon: Camera },
  { name: 'Stream Fusion', href: '/streams/fusion', icon: LayoutGrid },
  { name: 'Organizations', href: '/organizations', icon: Building2 },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Plugins', href: '/settings/plugins', icon: Plug },
];

function useSystemHealth() {
  const [health, setHealth] = React.useState<SystemHealth>('checking');
  const [modelLoaded, setModelLoaded] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/readyz', { cache: 'no-store' });
        let payload: ReadinessPayload = {};
        try {
          payload = (await res.json()) as ReadinessPayload;
          if (!res.ok && payload && typeof payload === 'object') {
            const detail = (payload as { detail?: ReadinessPayload }).detail;
            if (detail) payload = detail;
          }
        } catch {
          // non-JSON body
        }
        if (cancelled) return;
        const model = payload.checks?.model;
        setModelLoaded(model === 'loaded');
        setHealth(res.ok || payload.status === 'ready' ? 'ready' : 'degraded');
      } catch {
        if (!cancelled) {
          setHealth('offline');
          setModelLoaded(null);
        }
      }
    };

    poll();
    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { health, modelLoaded };
}

export function Header({ onMenuClick }: HeaderProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { health, modelLoaded } = useSystemHealth();
  const [commandOpen, setCommandOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (!commandOpen) setQuery('');
  }, [commandOpen]);

  const user = session?.user;
  const displayName = user?.name || user?.email || 'User';
  const displayEmail = user?.email || '';
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  const filteredRoutes = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMAND_ROUTES;
    return COMMAND_ROUTES.filter((route) => route.name.toLowerCase().includes(q) || route.href.includes(q));
  }, [query]);

  const healthBadge =
    health === 'ready'
      ? { label: 'SYSTEM ONLINE', variant: 'success' as const }
      : health === 'degraded'
        ? { label: 'DEGRADED', variant: 'warning' as const }
        : health === 'offline'
          ? { label: 'OFFLINE', variant: 'destructive' as const }
          : { label: 'CONNECTING', variant: 'subtle' as const };

  return (
    <TooltipProvider>
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card/80 px-4 backdrop-blur-xl">
        <button
          className="shrink-0 rounded-lg p-2 hover:bg-accent lg:hidden"
          onClick={onMenuClick}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <nav className="hidden shrink-0 items-center gap-1 md:flex" aria-label="Main navigation">
          {NAV_ROUTES.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-1 items-center justify-center px-4">
          <Button
            variant="ghost"
            size="sm"
            className="w-full max-w-md gap-2 text-muted-foreground"
            onClick={() => setCommandOpen(true)}
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search pages...</span>
            <kbd className="hidden items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline-flex">
              ⌘K
            </kbd>
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={healthBadge.variant} className="gap-1.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className={cn(
                        'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                        health === 'ready'
                          ? 'bg-status-online'
                          : health === 'degraded'
                            ? 'bg-status-warning'
                            : 'bg-destructive'
                      )}
                    />
                    <span
                      className={cn(
                        'relative inline-flex h-1.5 w-1.5 rounded-full',
                        health === 'ready'
                          ? 'bg-status-online'
                          : health === 'degraded'
                            ? 'bg-status-warning'
                            : 'bg-destructive'
                      )}
                    />
                  </span>
                  {healthBadge.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Backend readiness from /readyz</TooltipContent>
            </Tooltip>

            {modelLoaded !== null ? (
              <Badge variant={modelLoaded ? 'success' : 'warning'} className="gap-1">
                {modelLoaded ? 'MODEL LOADED' : 'NO MODEL'}
              </Badge>
            ) : null}
          </div>

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 pr-2">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                  <span className="text-xs font-semibold text-primary">{initials || <User className="h-4 w-4" />}</span>
                </div>
                <div className="hidden min-w-0 text-left md:block">
                  <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
                  <p className="truncate text-xs leading-tight text-muted-foreground">{displayEmail}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              <DropdownMenuLabel className="flex flex-col">
                <span className="text-sm font-medium">{displayName}</span>
                <span className="text-xs font-normal text-muted-foreground">{displayEmail}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onSelect={() => signOut({ callbackUrl: '/auth/login' })}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <AnimatePresence>
          {commandOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-20 backdrop-blur-sm"
              onClick={() => setCommandOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, y: -16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-elevation-5"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Command palette"
              >
                <div className="relative p-4">
                  <Search className="absolute left-7 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search pages..."
                    className="w-full rounded-xl border border-border bg-background py-3 pl-12 pr-4 text-lg outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setCommandOpen(false);
                      if (e.key === 'Enter') {
                        const target = filteredRoutes[0];
                        if (target) window.location.href = target.href;
                      }
                    }}
                  />
                </div>
                <Separator />
                <div className="max-h-96 overflow-y-auto p-2">
                  <h4 className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {query.trim() ? 'Results' : 'All pages'}
                  </h4>
                  <div className="space-y-0.5">
                    {filteredRoutes.map((route) => {
                      const Icon = route.icon;
                      return (
                        <Link
                          key={route.href}
                          href={route.href}
                          onClick={() => setCommandOpen(false)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-accent"
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span>{route.name}</span>
                          <span className="ml-auto font-mono text-[10px] text-muted-foreground">{route.href}</span>
                        </Link>
                      );
                    })}
                    {filteredRoutes.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">No pages match “{query}”</p>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </TooltipProvider>
  );
}
