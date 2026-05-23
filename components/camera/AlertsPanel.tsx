'use client';

import { AlertTriangle, ChevronRight } from 'lucide-react';
import { CONGESTION_LABEL, CONGESTION_COLORS, type CameraItem } from '@/types/camera';

interface AlertsPanelProps {
  cameras: CameraItem[];
  onCameraClick: (camera: CameraItem) => void;
}

export default function AlertsPanel({ cameras, onCameraClick }: AlertsPanelProps) {
  const alertCameras = cameras.filter(
    c => c.analysis && c.analysis.incidents !== 'none',
  );

  if (alertCameras.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-900 text-slate-400 space-y-3 select-none">
        <AlertTriangle className="w-12 h-12 opacity-30" />
        <p className="text-sm">No active alerts</p>
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-900 flex flex-col overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700 flex-shrink-0">
        <h2 className="text-white font-semibold">Active Alerts</h2>
        <p className="text-slate-400 text-sm mt-0.5">
          {alertCameras.length} camera{alertCameras.length !== 1 ? 's' : ''} with incidents
        </p>
      </div>

      <ul className="flex-1 overflow-y-auto divide-y divide-slate-800">
        {alertCameras.map(camera => {
          const congestionColor =
            CONGESTION_COLORS[camera.analysis!.congestion] ?? '#6b7280';

          return (
            <li key={camera.cameraId}>
              <button
                onClick={() => onCameraClick(camera)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-800 transition-colors text-left"
              >
                {camera.latestImage && (
                  <img
                    src={camera.latestImage}
                    alt={camera.locationName ?? undefined}
                    className="w-16 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">
                    {camera.locationName}
                  </p>
                  <p className="text-red-400 text-xs mt-0.5 capitalize">
                    {camera.analysis!.incidents.replace('_', ' ')}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: congestionColor }}
                    />
                    <span className="text-slate-400 text-xs">
                      {CONGESTION_LABEL[camera.analysis!.congestion]}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
