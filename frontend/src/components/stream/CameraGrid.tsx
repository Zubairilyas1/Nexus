'use client';

import { useEffect, useRef } from 'react';

interface CameraGridProps {
  streamIds: string[];
  layout: '2x2' | '3x3' | '1+5';
}

function getGridLayout(layout: string, count: number): string {
  switch (layout) {
    case '2x2':
      return 'grid-cols-2 grid-rows-2';
    case '3x3':
      return 'grid-cols-3 grid-rows-3';
    case '1+5':
      return count <= 1 ? 'grid-cols-1' : 'grid-cols-3 grid-rows-2';
    default:
      return 'grid-cols-2 grid-rows-2';
  }
}

function getStreamUrl(streamId: string): string {
  return `/api/streams/${streamId}/mjpeg`;
}

function CameraCell({ streamId, isMain }: { streamId: string; isMain?: boolean }) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    let retryCount = 0;
    const maxRetries = 3;

    const handleError = () => {
      if (retryCount < maxRetries) {
        retryCount++;
        setTimeout(() => {
          if (img) {
            img.src = getStreamUrl(streamId) + '?t=' + Date.now();
          }
        }, 1000 * retryCount);
      }
    };

    img.onerror = handleError;
    return () => {
      img.onerror = null;
    };
  }, [streamId]);

  return (
    <div className={`relative bg-black rounded-lg overflow-hidden ${isMain ? 'col-span-2 row-span-2' : ''}`}>
      <img
        ref={imgRef}
        src={getStreamUrl(streamId)}
        alt={`Stream ${streamId}`}
        className="w-full h-full object-contain"
        loading="lazy"
      />
      <div className="absolute top-2 left-2">
        <span className="bg-black/70 text-white text-xs px-2 py-1 rounded">
          {streamId}
        </span>
      </div>
    </div>
  );
}

export function CameraGrid({ streamIds, layout }: CameraGridProps) {
  if (streamIds.length === 0) {
    return (
      <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
        <p className="text-muted-foreground">No cameras selected</p>
      </div>
    );
  }

  const gridClass = getGridLayout(layout, streamIds.length);

  if (layout === '1+5' && streamIds.length > 1 && streamIds[0]) {
    return (
      <div className="grid grid-cols-3 grid-rows-2 gap-2 aspect-video">
        <div className="col-span-2 row-span-2">
          <CameraCell streamId={streamIds[0]} isMain />
        </div>
        {streamIds.slice(1, 6).map(id => (
          <CameraCell key={id} streamId={id} />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid ${gridClass} gap-2 aspect-video`}>
      {streamIds.map(id => (
        <CameraCell key={id} streamId={id} />
      ))}
    </div>
  );
}
