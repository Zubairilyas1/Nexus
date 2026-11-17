'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar - fixed on mobile, static flex child on desktop */}
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} />

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mx-auto w-full max-w-[1600px] p-4 md:p-6 lg:p-8"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
