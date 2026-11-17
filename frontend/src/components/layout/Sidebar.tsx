'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  Camera,
  BarChart3,
  MapPin,
  Settings,
  X,
  LogOut,
  User,
  ChevronDown,
  Building2,
  PenTool,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/DropdownMenu';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { Separator } from '@/components/ui/Separator';

const navigation = [
  { name: 'Dashboard', href: '/', icon: BarChart3 },
  { name: 'Organizations', href: '/organizations', icon: Building2 },
  { name: 'Zones', href: '/zones', icon: MapPin },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Streams', href: '/streams', icon: Camera },
  { name: 'Fusion', href: '/streams/fusion', icon: Building2 },
  { name: 'Zone Designer', href: '/designer', icon: PenTool },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const user = session?.user;
  const displayName = user?.name || user?.email || 'User';
  const initials = displayName
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          'flex flex-col bg-card border-r border-border w-72 shrink-0',
          'fixed inset-y-0 left-0 z-50 lg:static lg:z-auto',
          'transition-transform duration-300 lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
            <Link href="/" className="flex items-center gap-2" onClick={onClose}>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15">
                <Camera className="h-4 w-4 text-primary" />
              </span>
              <span className="font-display text-lg font-bold text-foreground">NexusVision</span>
            </Link>
            <button
              className="rounded-lg p-1.5 hover:bg-accent lg:hidden"
              onClick={onClose}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main navigation">
            {navigation.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.name}</span>
                  {isActive ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" /> : null}
                </Link>
              );
            })}
          </nav>

          <Separator />

          {/* User Menu */}
          <div className="shrink-0 p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-auto w-full justify-start gap-3 py-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/20 text-xs text-primary">{initials || <User className="h-4 w-4" />}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="truncate text-sm font-medium">{displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                <DropdownMenuItem asChild>
                  <Link href="/settings" onClick={onClose}>
                    <User className="mr-2 h-4 w-4" />
                    Account & Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => signOut({ callbackUrl: '/auth/login' })}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>
    </>
  );
}
