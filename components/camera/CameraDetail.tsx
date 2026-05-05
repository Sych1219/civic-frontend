'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CameraItem } from '@/types/camera';

interface CameraDetailProps {
  camera: CameraItem;
  isHistorical?: boolean;
  timestamp?: string;
  nearbyCameras?: CameraItem[];
  onClose: () => void;
  onCameraClick?: (camera: CameraItem) => void;
}

const CONGESTION_COLORS: Record<string, string> = {
  free_flow:  '#22c55e',
  light:      '#eab308',
  moderate:   '#f97316',
  heavy:      '#ef4444',
  standstill: '#7f1d1d',
};

export default function CameraDetail({
  camera,
  isHistorical,
  timestamp,
  nearbyCameras,
  onClose,
  onCameraClick,
}: CameraDetailProps) {
  const congestionColor = CONGESTION_COLORS[camera.analysis?.congestion ?? ''] ?? '#6b7280';
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxOpen]);

  return (
    <>
    <div className="absolute top-4 right-4 bottom-4 w-72 bg-slate-900/95 backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden flex flex-col z-20 border border-slate-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">{camera.locationName}</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            Cam {camera.cameraId}
            {isHistorical && (
              <span className="ml-1 text-amber-400">
                {timestamp ? `· ${timestamp} ` : ''}(historical)
              </span>
            )}
          </p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex-shrink-0"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Camera image */}
        {camera.latestImage && (
          <div className="p-3 pb-0">
            <img
              src={camera.latestImage}
              alt={camera.locationName ?? undefined}
              className="w-full rounded-lg object-cover cursor-zoom-in"
              onClick={() => setLightboxOpen(true)}
            />
          </div>
        )}


        {/* Analysis */}
        {camera.analysis ? (
          <div className="p-4 space-y-3">
            {/* Congestion badge */}
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: congestionColor }}
              />
              <span className="text-sm font-medium text-white capitalize">
                {camera.analysis.congestion.replace('_', ' ')}
              </span>
              <span className="text-slate-500 text-xs">·</span>
              <span className="text-slate-400 text-xs capitalize">
                {camera.analysis.vehicle_density}
              </span>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div>
                <span className="text-slate-500">Weather</span>
                <p className="text-slate-300 capitalize mt-0.5">
                  {camera.analysis.weather.replace('_', ' ')}
                </p>
              </div>
              <div>
                <span className="text-slate-500">Road surface</span>
                <p className="text-slate-300 capitalize mt-0.5">{camera.analysis.road_surface}</p>
              </div>
            </div>

            {/* Incident alert */}
            {camera.analysis.incidents !== 'none' && (
              <div className="bg-red-950/60 border border-red-800/60 rounded-lg px-3 py-2">
                <p className="text-red-400 text-xs font-medium capitalize">
                  {camera.analysis.incidents.replace('_', ' ')}
                </p>
              </div>
            )}

            {/* Summary */}
            <p className="text-slate-400 text-xs leading-relaxed italic">
              &ldquo;{camera.analysis.summary}&rdquo;
            </p>
          </div>
        ) : (
          <div className="p-4">
            <p className="text-slate-500 text-xs">No analysis available</p>
          </div>
        )}

        {/* Nearby cameras */}
        {nearbyCameras && nearbyCameras.length > 0 && (
          <div className="px-4 pb-4">
            <p className="text-slate-500 text-xs mb-2 uppercase tracking-wide">Nearby</p>
            <div className="flex gap-2 flex-wrap">
              {nearbyCameras.slice(0, 4).map(nearby => (
                <button
                  key={nearby.cameraId}
                  onClick={() => onCameraClick?.(nearby)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  {nearby.cameraId}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>

    {lightboxOpen && camera.latestImage && createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={() => setLightboxOpen(false)}
      >
        <button
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 transition-colors"
          onClick={() => setLightboxOpen(false)}
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <img
          src={camera.latestImage}
          alt={camera.locationName ?? undefined}
          className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl object-contain"
          onClick={e => e.stopPropagation()}
        />
        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-slate-300 text-sm bg-slate-900/70 px-3 py-1 rounded-full pointer-events-none">
          {camera.locationName} · Cam {camera.cameraId}
        </p>
      </div>,
      document.body
    )}
    </>
  );
}
