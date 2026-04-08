'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { CameraItem } from '@/types/camera';

const CONGESTION_COLORS: Record<string, string> = {
  free_flow:  '#22c55e',
  light:      '#eab308',
  moderate:   '#f97316',
  heavy:      '#ef4444',
  standstill: '#7f1d1d',
};

function congestionColor(level: string | undefined): string {
  return CONGESTION_COLORS[level ?? ''] ?? '#6b7280';
}


interface CorridorMapProps {
  mapboxToken: string;
  cameras: CameraItem[];
  selectedCamera?: CameraItem | null;
  onCameraClick: (camera: CameraItem) => void;
}

export default function CorridorMap({
  mapboxToken,
  cameras,
  selectedCamera,
  onCameraClick,
}: CorridorMapProps) {
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

  const buildOverlays = useCallback(() => {
    const map = mapRef.current;
    if (!map || cameras.length === 0) return;

    // ── Markers ──────────────────────────────────────────────────────────────
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

      const popup = new mapboxgl.Popup({ offset: 22, closeButton: false }).setHTML(`
        <div style="font-family:sans-serif;padding:4px 2px">
          <p style="font-weight:600;margin:0 0 4px;font-size:12px">${camera.locationName}</p>
          ${camera.latestImage ? `<img src="${camera.latestImage}" style="width:150px;border-radius:4px;margin-bottom:4px" />` : ''}
          <p style="margin:0;font-size:11px;color:#888;text-transform:capitalize">${camera.analysis?.congestion ?? 'No data'}</p>
          ${camera.analysis?.summary ? `<p style="margin:4px 0 0;font-size:10px;color:#aaa">${camera.analysis.summary}</p>` : ''}
        </div>
      `);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([camera.longitude, camera.latitude])
        .setPopup(popup)
        .addTo(map);

      el.addEventListener('click', () => onCameraClickRef.current(camera));
      markersRef.current.push(marker);
    });


    // ── Fit bounds to all cameras ─────────────────────────────────────────────
    if (cameras.length === 1) {
      map.flyTo({ center: [cameras[0].longitude, cameras[0].latitude], zoom: 14 });
    } else {
      const bounds = cameras.reduce(
        (b, c) => b.extend([c.longitude, c.latitude] as [number, number]),
        new mapboxgl.LngLatBounds([cameras[0].longitude, cameras[0].latitude], [cameras[0].longitude, cameras[0].latitude]),
      );
      map.fitBounds(bounds, { padding: 80, duration: 800 });
    }
  }, [cameras, selectedCamera]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      buildOverlays();
    } else {
      map.once('load', buildOverlays);
    }
  }, [buildOverlays]);

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
