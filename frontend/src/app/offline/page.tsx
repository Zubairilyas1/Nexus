'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function OfflinePage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-80px] h-72 w-[560px] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-card">
            <WifiOff className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
        <h1 className="mb-2 text-heading-lg font-semibold text-foreground">You&apos;re offline</h1>
        <p className="mb-8 text-body-sm text-muted-foreground">
          No internet connection detected. Some features may be unavailable. Cached data will be
          displayed when possible.
        </p>
        <Button onClick={() => window.location.reload()} className="gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </div>
  );
}
