'use client';

import * as React from 'react';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { AuthProvider } from './providers/AuthProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </TooltipProvider>
  );
}
