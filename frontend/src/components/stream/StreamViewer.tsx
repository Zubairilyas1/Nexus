'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { 
  Maximize2, 
  Minimize2, 
  Camera, 
  Wifi, 
  WifiOff, 
  Circle,
  Play,
  Pause,
  RotateCw,
  Settings,
  ChevronDown,
  RotateCcw,
  Copy,
  Download,
  X,
  Loader2
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import { TooltipProvider } from '@radix-ui/react-tooltip';

import { Button } from '@/components/ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/DropdownMenu';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';


interface StreamViewerProps {
  streamId: string;
  mjpegUrl: string;
  wsUrl?: string;
  className?: string;
  showControls?: boolean;
  showStatus?: boolean;
  onError?: (error: Error) => void;
  onLoad?: () => void;
  children?: React.ReactNode;
}

interface StreamStatus {
  connected: boolean;
  fps: number;
  resolution: string;
  bitrate: number;
  recording: boolean;
}

export function StreamViewer({
  streamId,
  mjpegUrl,
  wsUrl,
  className,
  showControls = true,
  showStatus = true,
  onError,
  onLoad,
  children,
}: StreamViewerProps) {
  const [status, setStatus] = React.useState<StreamStatus>({
    connected: false,
    fps: 0,
    resolution: '0x0',
    bitrate: 0,
    recording: false,
  });
  const [fullscreen, setFullscreen] = React.useState(false);
  const [imageError, setImageError] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const frameCountRef = React.useRef(0);
  const lastTimeRef = React.useRef(performance.now());

  // FPS calculation
  React.useEffect(() => {
    let animationId: number;
    const calculateFps = () => {
      frameCountRef.current++;
      const now = performance.now();
      if (now - lastTimeRef.current >= 1000) {
        setStatus(prev => ({ ...prev, fps: frameCountRef.current }));
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }
      animationId = requestAnimationFrame(calculateFps);
    };
    if (status.connected) {
      animationId = requestAnimationFrame(calculateFps);
    }
    return () => cancelAnimationFrame(animationId);
  }, [status.connected]);

  const handleImageLoad = () => {
    setImageError(false);
    setRetryCount(0);
    setStatus(prev => ({ ...prev, connected: true }));
    onLoad?.();
  };

  const handleImageError = () => {
    setImageError(true);
    setStatus(prev => ({ ...prev, connected: false }));
    onError?.(new Error('Stream connection failed'));
    
    // Auto-retry with exponential backoff
    if (retryCount < 5) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      setTimeout(() => {
        setRetryCount(c => c + 1);
        if (imgRef.current) {
          imgRef.current.src = `${mjpegUrl}?t=${Date.now()}`;
        }
      }, delay);
    }
  };

  const handleImgOnLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > 0) {
      setStatus(prev => ({ 
        ...prev, 
        resolution: `${img.naturalWidth}x${img.naturalHeight}`,
        bitrate: Math.round((img.naturalWidth * img.naturalHeight * 24 * status.fps) / 1000 / 1000 * 100) / 100,
      }));
    }
    handleImageLoad();
  };

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(console.error);
      } else {
        document.exitFullscreen();
      }
    }
    setFullscreen(!fullscreen);
  };

  const handleFullscreenChange = () => {
    setFullscreen(!!document.fullscreenElement);
  };

  React.useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <TooltipProvider>
      <div
        ref={containerRef}
        className={cn(
          'relative bg-black rounded-xl overflow-hidden max-w-full mx-auto',
          fullscreen && 'fixed inset-0 z-50 w-screen h-screen rounded-none',
          className
        )}
        style={{ aspectRatio: '16/9' }}
      >
        <div className="relative w-full h-full bg-black">
          <AnimatePresence mode="wait">
            {!imageError ? (
              <motion.img
                key={mjpegUrl}
                ref={imgRef}
                src={mjpegUrl}
                alt={`Live stream ${streamId}`}
                className="w-full h-full object-cover"
                onLoad={handleImgOnLoad}
                onError={handleImageError}
                style={{ opacity: imageError ? 0 : 1 }}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute inset-0 flex items-center justify-center bg-black/80"
              >
                <div className="text-center p-8">
                  <Camera className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">Stream Unavailable</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {retryCount > 0 
                      ? `Reconnecting... (attempt ${retryCount}/5)`
                      : 'Unable to connect to stream'}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setImageError(false);
                        setRetryCount(0);
                        if (imgRef.current) {
                          imgRef.current.src = `${mjpegUrl}?t=${Date.now()}`;
                        }
                      }}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Retry Now
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => window.open(mjpegUrl, '_blank')}
                    >
                      Open Directly
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Status overlay */}
          {showStatus && (
            <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 p-3 glass rounded-xl">
              <div className="flex items-center gap-3">
                <Badge 
                  variant={status.connected ? 'success' : 'destructive'}
                  className="gap-1.5"
                >
                  <span className="relative flex h-2 w-2 rounded-full" style={{
                    backgroundColor: status.connected ? 'hsl(var(--status-online))' : 'hsl(var(--status-destructive))'
                  }}>
                    <span className="absolute inset-0 rounded-full animate-pulse-slow" style={{
                      backgroundColor: status.connected ? 'hsl(var(--status-online))' : 'hsl(var(--status-destructive))'
                    }} />
                  </span>
                  {status.connected ? 'LIVE' : 'OFFLINE'}
                </Badge>
                
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                  <Camera className="h-3 w-3" />
                  <span>{status.resolution}</span>
                </div>
                
                <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                  <span>{status.fps}</span>
                  <span>FPS</span>
                </div>
                
                {status.bitrate > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                    <span>{status.bitrate.toFixed(1)}</span>
                    <span>Mbps</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {showControls && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={toggleFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
                          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}</TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="Stream settings">
                              <Settings className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[160px]">
                            <DropdownMenuItem 
                              onClick={() => imgRef.current?.src && (imgRef.current.src = `${mjpegUrl}?t=${Date.now()}`)}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Refresh Stream
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              <span className="flex items-center gap-2">
                                <Badge variant={status.connected ? 'success' : 'destructive'} className="mr-2">
                                  {status.connected ? 'Connected' : 'Disconnected'}
                                </Badge>
                                <span>{status.fps} FPS</span>
                              </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <span className="flex items-center gap-2">
                                <span className="w-8 text-right">{status.resolution}</span>
                                <span>Resolution</span>
                              </span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TooltipTrigger>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          )}

            {/* Recording indicator */}
            {status.recording && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-red-500/90 text-red-50 text-xs font-medium rounded-full"
              >
                <Circle className="h-3 w-3 animate-pulse" />
                <span>REC</span>
              </motion.div>
            )}

          {/* Children (overlay) */}
          {children}
        </div>
      </div>
    </TooltipProvider>
  );
}

StreamViewer.displayName = 'StreamViewer';

export default StreamViewer;



