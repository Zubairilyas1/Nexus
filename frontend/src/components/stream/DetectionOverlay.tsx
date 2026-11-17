import React from 'react';

export interface Detection {
  track_id: number;
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: [number, number, number, number]; // x, y, width, height (source coords)
}

interface DetectionOverlayProps {
  detections: Detection[];
  frameWidth: number | null;
  frameHeight: number | null;
}

const CLASS_COLORS: Record<string, string> = {
  car: '#06b6d4',
  person: '#10b981',
  truck: '#f59e0b',
  bus: '#8b5cf6',
  motorcycle: '#f43f5e',
  bicycle: '#eab308',
};

export const DetectionOverlay: React.FC<DetectionOverlayProps> = ({
  detections,
  frameWidth,
  frameHeight,
}) => {
  if (!detections || detections.length === 0) return null;

  // Fallback to 16:9 1080p if frame dimensions are unknown
  const fw = frameWidth || 1920;
  const fh = frameHeight || 1080;

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {detections.map((det) => {
        const [x, y, w, h] = det.bbox;
        const color = CLASS_COLORS[det.class_name?.toLowerCase()] || '#ffffff';
        
        const left = `${(x / fw) * 100}%`;
        const top = `${(y / fh) * 100}%`;
        const width = `${(w / fw) * 100}%`;
        const height = `${(h / fh) * 100}%`;

        return (
          <div
            key={det.track_id}
            className="absolute border-2 transition-all duration-75"
            style={{
              left,
              top,
              width,
              height,
              borderColor: color,
            }}
          >
            <div
              className="absolute -top-6 left-[-2px] px-1 py-0.5 text-[10px] font-bold text-white whitespace-nowrap rounded-t-sm"
              style={{ backgroundColor: color }}
            >
              {det.class_name} {Math.round(det.confidence * 100)}% #{det.track_id}
            </div>
          </div>
        );
      })}
    </div>
  );
};
