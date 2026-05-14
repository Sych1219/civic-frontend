'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { CONGESTION_LABEL, type CameraItem, type CongestionLevel } from '@/types/camera';

const CONGESTION_COLORS: Record<string, string> = {
  free_flow: '#22c55e',
  light:     '#eab308',
  moderate:  '#f97316',
  heavy:     '#ef4444',
  standstill: '#7f1d1d',
};

function congestionColor(level: string | undefined): string {
  return CONGESTION_COLORS[level ?? ''] ?? '#6b7280';
}

interface CameraMapProps {
  mapboxToken: string;
  cameras: CameraItem[];
  selectedCamera?: CameraItem | null;
  onCameraClick: (camera: CameraItem) => void;
}

export default function CameraMap({
  mapboxToken,
  cameras,
  selectedCamera,
  onCameraClick,
}: CameraMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const onCameraClickRef = useRef(onCameraClick);
  onCameraClickRef.current = onCameraClick;

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [103.8198, 1.3521],
      zoom: 11,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]);

  // Rebuild markers whenever cameras or selection changes
  const buildMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    cameras.forEach(camera => {
      const isSelected = selectedCamera?.cameraId === camera.cameraId;
      const color = congestionColor(camera.analysis?.congestion);
      const size = isSelected ? 20 : 14;

      const el = document.createElement('div');
      el.style.cssText = `
        width: ${size}px; height: ${size}px;
        background: ${color};
        border: ${isSelected ? 3 : 2}px solid ${isSelected ? '#fff' : 'rgba(255,255,255,0.6)'};
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 0 ${isSelected ? 10 : 4}px ${color};
        transition: all 0.2s;
      `;

      const congestionKey = camera.analysis?.congestion as CongestionLevel | undefined;
      const congestionLabel = congestionKey ? CONGESTION_LABEL[congestionKey] : 'No data';
      const title = camera.locationName || `Camera ${camera.cameraId}`;
      const popup = new mapboxgl.Popup({ offset: 22, closeButton: false, focusAfterOpen: false, maxWidth: '360px' }).setHTML(`
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:2px;width:320px">
          ${camera.latestImage
            ? `<img src="${camera.latestImage}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;display:block;margin-bottom:8px;background:#0f172a" />`
            : `<div style="width:100%;height:120px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:11px;margin-bottom:8px">No image available</div>`}
          <p style="font-weight:600;margin:0 0 6px;font-size:13px;color:#0f172a;line-height:1.3">${title}</p>
          <div style="display:flex;align-items:center;gap:6px;font-size:11px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
            <span style="color:#475569">${congestionLabel}</span>
            <span style="color:#94a3b8;margin-left:auto">Click to expand</span>
          </div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([camera.longitude, camera.latitude])
        .addTo(map);

      el.addEventListener('mouseenter', () => popup.setLngLat([camera.longitude, camera.latitude]).addTo(map));
      el.addEventListener('mouseleave', () => popup.remove());
      el.addEventListener('click', () => onCameraClickRef.current(camera));
      markersRef.current.push(marker);
    });
  }, [cameras, selectedCamera]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      buildMarkers();
    } else {
      map.once('load', buildMarkers);
    }
  }, [buildMarkers]);

  // Fly to selected camera
  useEffect(() => {
    if (!selectedCamera || !mapRef.current) return;
    mapRef.current.flyTo({
      center: [selectedCamera.longitude, selectedCamera.latitude],
      zoom: 14,
      duration: 800,
    });
  }, [selectedCamera]);

  return <div ref={containerRef} className="w-full h-full" />;
}
