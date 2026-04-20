'use client';

import { Eye, EyeOff, X } from 'lucide-react';
import type { ChatResponse, CameraArtifactData } from '@/types/api';
import { getTaxiData } from '@/types/api';

// One colour per layer index — cycles if there are more than 8 layers
const LAYER_COLOURS = [
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
];

interface LayerToggleProps {
  layers: Record<string, ChatResponse>;
  visibility: Record<string, boolean>;
  onToggle: (layerId: string) => void;
  onRemove: (layerId: string) => void;
}

export default function LayerToggle({
  layers,
  visibility,
  onToggle,
  onRemove,
}: LayerToggleProps) {
  const layerIds = Object.keys(layers);

  if (layerIds.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-10 bg-slate-900 backdrop-blur rounded-xl shadow-2xl overflow-hidden min-w-[200px] max-w-[260px]">
      <div className="px-4 py-2.5 border-b border-slate-700">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Layers</p>
      </div>
      <ul className="py-1">
        {layerIds.map((id, idx) => {
          const layer = layers[id];
          const artifact = layer.artifacts?.[0];
          const taxiData = getTaxiData(layer);
          const ctx = (taxiData?.type === 'spatial_query' || taxiData?.type === 'timeline') ? taxiData.context : null;
          const cameraViewType = artifact?.type === 'traffic_cameras'
            ? (artifact.data as CameraArtifactData).view_type
            : null;
          const label = ctx?.zone_name ?? ctx?.road_name ?? taxiData?.type ?? cameraViewType ?? id;
          const isVisible = visibility[id] ?? true;
          const colour = LAYER_COLOURS[idx % LAYER_COLOURS.length];

          return (
            <li
              key={id}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-800/60 transition-colors group"
            >
              {/* Colour dot */}
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: colour, opacity: isVisible ? 1 : 0.35 }}
              />

              {/* Label */}
              <span
                className={`flex-1 text-xs font-medium truncate transition-opacity ${
                  isVisible ? 'text-slate-200' : 'text-slate-500'
                }`}
                title={label}
              >
                {label}
              </span>

              {/* Visibility toggle */}
              <button
                onClick={() => onToggle(id)}
                className="p-0.5 text-slate-400 hover:text-slate-100 transition-colors"
                aria-label={isVisible ? `Hide ${label}` : `Show ${label}`}
              >
                {isVisible ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Remove button */}
              <button
                onClick={() => onRemove(id)}
                className="p-0.5 text-slate-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                aria-label={`Remove ${label}`}
              >
                <X className="w-3 h-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
