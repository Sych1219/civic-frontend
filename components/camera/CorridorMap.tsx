'use client';

import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { type CameraItem } from '@/types/camera';
import { buildCameraMarkers } from '@/lib/camera-markers';

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

    markersRef.current = buildCameraMarkers(map, cameras, selectedCamera, onCameraClickRef.current, markersRef.current);

    // Fit bounds to all cameras
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
