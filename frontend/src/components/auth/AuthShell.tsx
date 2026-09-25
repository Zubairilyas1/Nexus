'use client';

import * as React from 'react';
import { Camera, Network } from 'lucide-react';

interface AuthShellProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ children, footer }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-zinc-950 overflow-hidden text-zinc-100">
      {/* Network Graph Pattern Background */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="networkPattern" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
              <circle cx="50" cy="50" r="2" fill="#22d3ee" />
              <path d="M50 50 L150 100 M50 50 L-50 100 M50 50 L100 -50 M50 50 L-10 10" stroke="#22d3ee" strokeWidth="0.5" opacity="0.5" />
              <path d="M50 50 Q 80 20 120 50 T 180 80" stroke="#0ea5e9" strokeWidth="1" fill="none" opacity="0.3" />
              <circle cx="20" cy="80" r="1.5" fill="#0ea5e9" />
              <path d="M20 80 L50 50" stroke="#0ea5e9" strokeWidth="0.5" opacity="0.4" />
            </pattern>
            <radialGradient id="glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.15" />
              <stop offset="100%" stopColor="transparent" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#networkPattern)" />
          <rect width="100%" height="100%" fill="url(#glow)" />
        </svg>
      </div>

      {/* 4 Live-View Computer Vision Modules */}
      
      {/* Top-Left: Multi-vehicle street view */}
      <div className="absolute top-8 left-8 w-[400px] h-[260px] rounded-xl overflow-hidden border border-zinc-800/60 shadow-2xl z-0 opacity-70">
        <img src="https://images.unsplash.com/photo-1517726591024-38a4425785d1?auto=format&fit=crop&q=80&w=800" alt="Street view" className="w-full h-full object-cover grayscale brightness-75" />
        {/* Bounding boxes */}
        <div className="absolute top-[30%] left-[20%] w-[120px] h-[80px] border-[2px] border-emerald-400">
          <span className="absolute -top-5 left-[-2px] bg-emerald-400 text-zinc-950 text-[10px] font-bold px-1">VEHICLE 98%</span>
        </div>
        <div className="absolute top-[45%] left-[60%] w-[90px] h-[65px] border-[2px] border-cyan-400">
          <span className="absolute -top-5 left-[-2px] bg-cyan-400 text-zinc-950 text-[10px] font-bold px-1">VEHICLE 92%</span>
        </div>
      </div>

      {/* Top-Right: NV Watermark */}
      <div className="absolute top-12 right-12 z-0 opacity-10 pointer-events-none">
        <span className="text-[240px] font-black tracking-tighter leading-none">NV</span>
      </div>

      {/* Bottom-Left: Parking lot pedestrians */}
      <div className="absolute bottom-8 left-8 w-[400px] h-[260px] rounded-xl overflow-hidden border border-zinc-800/60 shadow-2xl z-0 opacity-70">
        <img src="https://images.unsplash.com/photo-1542385151-5d67e6ab6f8e?auto=format&fit=crop&q=80&w=800" alt="Parking lot" className="w-full h-full object-cover grayscale brightness-75" />
        {/* Bounding boxes */}
        <div className="absolute top-[40%] left-[30%] w-[30px] h-[80px] border-[2px] border-emerald-400">
          <span className="absolute -top-5 left-[-2px] bg-emerald-400 text-zinc-950 text-[9px] font-bold px-1">#1042</span>
        </div>
        <div className="absolute top-[35%] left-[55%] w-[25px] h-[70px] border-[2px] border-emerald-400">
          <span className="absolute -top-5 left-[-2px] bg-emerald-400 text-zinc-950 text-[9px] font-bold px-1">#1043</span>
        </div>
        <div className="absolute top-[50%] left-[75%] w-[35px] h-[90px] border-[2px] border-emerald-400">
          <span className="absolute -top-5 left-[-2px] bg-emerald-400 text-zinc-950 text-[9px] font-bold px-1">#1044</span>
        </div>
      </div>

      {/* Bottom-Right: Close-up shelf objects */}
      <div className="absolute bottom-8 right-8 w-[400px] h-[260px] rounded-xl overflow-hidden border border-zinc-800/60 shadow-2xl z-0 opacity-70">
        <img src="https://images.unsplash.com/photo-1550503194-e337190d0b00?auto=format&fit=crop&q=80&w=800" alt="Shelf view" className="w-full h-full object-cover grayscale brightness-75" />
        {/* Bounding boxes */}
        <div className="absolute top-[20%] left-[10%] w-[100px] h-[120px] border-[2px] border-rose-400">
          <span className="absolute -top-5 left-[-2px] bg-rose-400 text-zinc-950 text-[9px] font-bold px-1">BACKPACK</span>
        </div>
        <div className="absolute top-[15%] left-[45%] w-[110px] h-[130px] border-[2px] border-amber-400">
          <span className="absolute -top-5 left-[-2px] bg-amber-400 text-zinc-950 text-[9px] font-bold px-1">BAG</span>
        </div>
        <div className="absolute top-[30%] left-[75%] w-[80px] h-[110px] border-[2px] border-rose-400">
          <span className="absolute -top-5 left-[-2px] bg-rose-400 text-zinc-950 text-[9px] font-bold px-1">BACKPACK</span>
        </div>
      </div>

      {/* Central Glassmorphism Form Panel */}
      <div className="relative z-10 w-full max-w-[420px]">
        <div className="mb-8 flex justify-center items-center gap-3">
          <div className="relative flex items-center justify-center w-12 h-12 bg-cyan-500/20 rounded-xl border border-cyan-400/30">
            <Camera className="w-6 h-6 text-cyan-400 absolute" />
            <Network className="w-7 h-7 text-teal-400 absolute opacity-50 scale-125" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white font-sans">NexusVision</h1>
        </div>

<div className="bg-zinc-900/60 backdrop-blur-xl border border-cyan-500/30 rounded-2xl p-8 shadow-[0_0_40px_-10px_rgba(6,182,212,0.3)]">
          {children}
        </div>
        {footer && (
          <div className="mt-6 text-center text-sm text-zinc-400">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
