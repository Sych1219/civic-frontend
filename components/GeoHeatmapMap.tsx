'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Play, Pause } from 'lucide-react';
import type { TimelineData, VisualizationMode } from '@/types/api';

interface GeoHeatmapMapProps {
  mapboxToken: string;
  geojson?: GeoJSON.FeatureCollection | null;
  timelineData?: TimelineData | null;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const SOURCE_ID = 'geodata';
const HEATMAP_ID = 'heatmap';
const CLUSTERS_ID = 'clusters';
const CLUSTER_COUNT_ID = 'cluster-count';
const POINTS_ID = 'points';
const TIMELINE_SOURCE_ID = 'timeline-data';
const TIMELINE_POINTS_ID = 'timeline-points';

const PLAYBACK_INTERVAL_MS = 600;

const SPATIAL_LAYERS = [HEATMAP_ID, CLUSTERS_ID, CLUSTER_COUNT_ID, POINTS_ID];
const TIMELINE_LAYERS = [TIMELINE_POINTS_ID];

function formatHHMM(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-SG', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore',
    });
  } catch {
    return iso;
  }
}

export default function GeoHeatmapMap({
  mapboxToken,
  geojson,
  timelineData,
}: GeoHeatmapMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const pendingGeojson = useRef<GeoJSON.FeatureCollection | null>(null);

  const [loading, setLoading] = useState(true);
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>({ mode: 'heatmap', zoom: 11 });

  // Timeline state
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTimelineModeRef = useRef(false);

  const isTimelineMode = !!timelineData;
  const snapshots = timelineData?.snapshots ?? [];

  // Keep ref in sync for use inside map load callback
  useEffect(() => { isTimelineModeRef.current = isTimelineMode; }, [isTimelineMode]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const updateVisualizationMode = useCallback((zoom: number) => {
    let mode: VisualizationMode['mode'];
    if (zoom < 12) mode = 'heatmap';
    else if (zoom < 15) mode = 'clusters';
    else mode = 'points';
    setVisualizationMode({ mode, zoom: Math.round(zoom * 10) / 10 });
  }, []);

  const syncLayerVisibility = useCallback((m: mapboxgl.Map, isTimeline: boolean) => {
    SPATIAL_LAYERS.forEach(id => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', isTimeline ? 'none' : 'visible');
    });
    TIMELINE_LAYERS.forEach(id => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', isTimeline ? 'visible' : 'none');
    });
  }, []);

  // ── Layer initialisation ──────────────────────────────────────────────────

  const initLayers = useCallback((m: mapboxgl.Map) => {
    // Spatial (clustered) source
    if (!m.getSource(SOURCE_ID)) {
      m.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });
    }
    if (!m.getLayer(HEATMAP_ID)) {
      m.addLayer({
        id: HEATMAP_ID, type: 'heatmap', source: SOURCE_ID, maxzoom: 12,
        paint: {
          'heatmap-weight': 1,
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 3],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(33,102,172,0)', 0.2, 'rgb(103,169,207)', 0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)', 0.8, 'rgb(239,138,98)', 1, 'rgb(178,24,43)'],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 12, 50],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 12, 0],
        },
      });
    }
    if (!m.getLayer(CLUSTERS_ID)) {
      m.addLayer({
        id: CLUSTERS_ID, type: 'circle', source: SOURCE_ID,
        filter: ['has', 'point_count'], minzoom: 12, maxzoom: 15,
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 100, '#f1f075', 750, '#f28cb1'],
          'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40],
          'circle-opacity': 0.8, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
        },
      });
    }
    if (!m.getLayer(CLUSTER_COUNT_ID)) {
      m.addLayer({
        id: CLUSTER_COUNT_ID, type: 'symbol', source: SOURCE_ID,
        filter: ['has', 'point_count'], minzoom: 12, maxzoom: 15,
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });
    }
    if (!m.getLayer(POINTS_ID)) {
      m.addLayer({
        id: POINTS_ID, type: 'circle', source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']], minzoom: 15,
        paint: {
          'circle-color': '#11b4da', 'circle-radius': 6,
          'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9,
        },
      });
    }

    // Timeline (non-clustered) source
    if (!m.getSource(TIMELINE_SOURCE_ID)) {
      m.addSource(TIMELINE_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!m.getLayer(TIMELINE_POINTS_ID)) {
      m.addLayer({
        id: TIMELINE_POINTS_ID, type: 'circle', source: TIMELINE_SOURCE_ID,
        paint: {
          'circle-color': '#11b4da', 'circle-radius': 6,
          'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9,
        },
      });
    }

    // Click/hover handlers for both point layers
    const addPointInteraction = (layerId: string) => {
      m.on('click', layerId, (e) => {
        if (!e.features || e.features.length === 0) return;
        const coordinates = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180)
          coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        new mapboxgl.Popup().setLngLat(coordinates).setHTML(
          `<div style="padding:8px;">
            <p style="margin:0;font-size:11px;color:#999;">Lat: ${coordinates[1].toFixed(5)}, Lng: ${coordinates[0].toFixed(5)}</p>
          </div>`
        ).addTo(m);
      });
      m.on('mouseenter', layerId, () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', layerId, () => { m.getCanvas().style.cursor = ''; });
    };
    addPointInteraction(POINTS_ID);
    addPointInteraction(TIMELINE_POINTS_ID);
  }, []);

  // ── Map initialisation ────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    mapboxgl.accessToken = mapboxToken;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [103.8198, 1.3521],
      zoom: 11,
    });
    map.current.on('load', () => {
      if (!map.current) return;
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-left');
      map.current.on('zoom', () => { if (map.current) updateVisualizationMode(map.current.getZoom()); });
      updateVisualizationMode(map.current.getZoom());
      initLayers(map.current);
      syncLayerVisibility(map.current, isTimelineModeRef.current);
      setLoading(false);
      if (pendingGeojson.current) {
        const src = map.current.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
        if (src) src.setData(pendingGeojson.current);
        pendingGeojson.current = null;
      }
    });
    return () => { if (map.current) { map.current.remove(); map.current = null; } };
  }, [mapboxToken, updateVisualizationMode, initLayers, syncLayerVisibility]);

  // ── Push new GeoJSON to spatial map ──────────────────────────────────────

  useEffect(() => {
    if (!geojson) return;
    const m = map.current;
    if (!m || !m.isStyleLoaded()) {
      pendingGeojson.current = geojson;
      return;
    }
    const src = m.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(geojson);
  }, [geojson]);

  // ── Sync layer visibility when mode changes ───────────────────────────────

  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    syncLayerVisibility(m, isTimelineMode);
  }, [isTimelineMode, syncLayerVisibility]);

  // ── Timeline: reset on new data ───────────────────────────────────────────

  useEffect(() => {
    if (!timelineData) return;
    setSnapshotIndex(0);
    setIsPlaying(false);
    const m = map.current;
    if (!m || !m.isStyleLoaded() || !timelineData.snapshots[0]) return;
    const src = m.getSource(TIMELINE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(timelineData.snapshots[0].locations);
  }, [timelineData]);

  // ── Timeline: update source on snapshot change ────────────────────────────

  useEffect(() => {
    const snapshot = snapshots[snapshotIndex];
    if (!snapshot) return;
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const src = m.getSource(TIMELINE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(snapshot.locations);
  }, [snapshotIndex, snapshots]);

  // ── Timeline: playback interval ───────────────────────────────────────────

  useEffect(() => {
    if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    if (isPlaying && snapshots.length > 0) {
      playIntervalRef.current = setInterval(() => {
        setSnapshotIndex(prev => {
          if (prev >= snapshots.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, PLAYBACK_INTERVAL_MS);
    }
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [isPlaying, snapshots.length]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (snapshotIndex >= snapshots.length - 1) setSnapshotIndex(0);
      setIsPlaying(true);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    setSnapshotIndex(parseInt(e.target.value));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const currentSnapshot = snapshots[snapshotIndex];

  return (
    <div className="w-full h-full relative flex flex-col">
      <div ref={mapContainer} className="flex-1" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
          <div className="bg-white rounded-lg p-6 shadow-xl flex items-center space-x-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="text-lg font-medium text-gray-900">Loading map…</span>
          </div>
        </div>
      )}

      {/* Zoom mode indicator (spatial mode only) */}
      {!loading && !isTimelineMode && (
        <div className="absolute bottom-8 right-4 bg-slate-900/80 backdrop-blur rounded-md px-3 py-1.5 text-xs text-slate-300 pointer-events-none">
          {visualizationMode.mode === 'heatmap' && 'Heatmap view'}
          {visualizationMode.mode === 'clusters' && 'Cluster view'}
          {visualizationMode.mode === 'points' && 'Point view'}
          {' · zoom '}{visualizationMode.zoom}
        </div>
      )}

      {/* Time slider panel (timeline mode only) */}
      {!loading && isTimelineMode && snapshots.length > 0 && (
        <div className="flex-shrink-0 bg-slate-900/95 backdrop-blur px-5 py-3 z-10">
          <div className="flex items-center gap-4">
            {/* Play / Pause */}
            <button
              onClick={handlePlayPause}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            {/* Snapshot counter + timestamp */}
            <div className="flex-shrink-0 text-right min-w-[72px]">
              <div className="text-xs text-slate-400">{snapshotIndex + 1} / {snapshots.length}</div>
              <div className="text-sm font-semibold text-white tabular-nums">
                {currentSnapshot ? formatHHMM(currentSnapshot.timestamp) : '--:--'}
              </div>
            </div>

            {/* Slider + range labels */}
            <div className="flex-1 flex flex-col gap-1">
              <input
                type="range"
                min={0}
                max={snapshots.length - 1}
                value={snapshotIndex}
                onChange={handleSliderChange}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <div className="flex justify-between text-xs text-slate-400 tabular-nums">
                <span>{formatHHMM(timelineData!.from_time)}</span>
                <span>{formatHHMM(timelineData!.to_time)}</span>
              </div>
            </div>

            {/* Count badge */}
            {currentSnapshot && (
              <div className="flex-shrink-0 bg-slate-700 rounded px-2 py-1 text-xs text-slate-200 tabular-nums">
                {currentSnapshot.taxi_count} taxis
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
