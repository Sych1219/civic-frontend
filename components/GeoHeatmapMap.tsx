'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Play, Pause } from 'lucide-react';
import LayerToggle from './LayerToggle';
import type { ApiResponse, SpatialQueryData, TimelineData, VisualizationMode, ZoneGeometryData } from '@/types/api';

interface GeoHeatmapMapProps {
  mapboxToken: string;
  javaBackendUrl: string;
  layers: Record<string, ApiResponse>;
  visibility: Record<string, boolean>;
  zoneGeometries?: Record<string, ZoneGeometryData>;
  onToggle: (layerId: string) => void;
  onRemove: (layerId: string) => void;
}

const PLAYBACK_INTERVAL_MS = 600;

// ── Per-layer Mapbox ID helpers ───────────────────────────────────────────────

function spatialIds(layerId: string) {
  return {
    source:       `geodata-${layerId}`,
    heatmap:      `heatmap-${layerId}`,
    clusters:     `clusters-${layerId}`,
    clusterCount: `cluster-count-${layerId}`,
    points:       `points-${layerId}`,
  };
}

function timelineIds(layerId: string) {
  return {
    source: `timeline-${layerId}`,
    points: `timeline-points-${layerId}`,
  };
}

function zoneBoundaryIds(layerId: string) {
  return {
    source: `zone-boundary-${layerId}`,
    fill:   `zone-fill-${layerId}`,
    line:   `zone-line-${layerId}`,
  };
}

function addZoneBoundaryMbLayer(m: mapboxgl.Map, layerId: string, geo: ZoneGeometryData) {
  const ids = zoneBoundaryIds(layerId);
  const geojson: GeoJSON.Feature = { type: 'Feature', geometry: geo.geometry, properties: { name: geo.name, category: geo.category } };
  if (!m.getSource(ids.source)) {
    m.addSource(ids.source, { type: 'geojson', data: geojson });
  }
  if (geo.geometry.type === 'Polygon') {
    if (!m.getLayer(ids.fill)) {
      m.addLayer({
        id: ids.fill, type: 'fill', source: ids.source,
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.08 },
      });
    }
    if (!m.getLayer(ids.line)) {
      m.addLayer({
        id: ids.line, type: 'line', source: ids.source,
        paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [4, 3] },
      });
    }
  } else {
    // LineString — highway / road
    if (!m.getLayer(ids.line)) {
      m.addLayer({
        id: ids.line, type: 'line', source: ids.source,
        paint: { 'line-color': '#f59e0b', 'line-width': 3, 'line-dasharray': [6, 4] },
      });
    }
  }
}

function removeZoneBoundaryMbLayer(m: mapboxgl.Map, layerId: string) {
  const ids = zoneBoundaryIds(layerId);
  [ids.fill, ids.line].forEach(id => { if (m.getLayer(id)) m.removeLayer(id); });
  if (m.getSource(ids.source)) m.removeSource(ids.source);
}

function applyZoneBoundaryVisibility(m: mapboxgl.Map, layerId: string, isVisible: boolean) {
  const ids = zoneBoundaryIds(layerId);
  const vis = isVisible ? 'visible' : 'none';
  [ids.fill, ids.line].forEach(id => { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis); });
}

// ── Mapbox layer add / remove helpers (module-level, no hooks) ───────────────

function addSpatialMbLayer(m: mapboxgl.Map, layerId: string, geojson: GeoJSON.FeatureCollection) {
  const ids = spatialIds(layerId);
  if (!m.getSource(ids.source)) {
    m.addSource(ids.source, {
      type: 'geojson', data: geojson,
      cluster: true, clusterMaxZoom: 14, clusterRadius: 50,
    });
  }
  if (!m.getLayer(ids.heatmap)) {
    m.addLayer({
      id: ids.heatmap, type: 'heatmap', source: ids.source, maxzoom: 12,
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
  if (!m.getLayer(ids.clusters)) {
    m.addLayer({
      id: ids.clusters, type: 'circle', source: ids.source,
      filter: ['has', 'point_count'], minzoom: 12, maxzoom: 15,
      paint: {
        'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 100, '#f1f075', 750, '#f28cb1'],
        'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40],
        'circle-opacity': 0.8, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
      },
    });
  }
  if (!m.getLayer(ids.clusterCount)) {
    m.addLayer({
      id: ids.clusterCount, type: 'symbol', source: ids.source,
      filter: ['has', 'point_count'], minzoom: 12, maxzoom: 15,
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 12,
      },
      paint: { 'text-color': '#ffffff' },
    });
  }
  if (!m.getLayer(ids.points)) {
    m.addLayer({
      id: ids.points, type: 'circle', source: ids.source,
      filter: ['!', ['has', 'point_count']], minzoom: 15,
      paint: {
        'circle-color': '#11b4da', 'circle-radius': 6,
        'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9,
      },
    });
  }
  m.on('click', ids.points, (e) => {
    if (!e.features?.length) return;
    const coords = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
    while (Math.abs(e.lngLat.lng - coords[0]) > 180)
      coords[0] += e.lngLat.lng > coords[0] ? 360 : -360;
    new mapboxgl.Popup().setLngLat(coords).setHTML(
      `<div style="padding:8px;"><p style="margin:0;font-size:11px;color:#999;">Lat: ${coords[1].toFixed(5)}, Lng: ${coords[0].toFixed(5)}</p></div>`
    ).addTo(m);
  });
  m.on('mouseenter', ids.points, () => { m.getCanvas().style.cursor = 'pointer'; });
  m.on('mouseleave', ids.points, () => { m.getCanvas().style.cursor = ''; });
}

function removeSpatialMbLayer(m: mapboxgl.Map, layerId: string) {
  const ids = spatialIds(layerId);
  [ids.points, ids.clusterCount, ids.clusters, ids.heatmap].forEach(id => {
    if (m.getLayer(id)) m.removeLayer(id);
  });
  if (m.getSource(ids.source)) m.removeSource(ids.source);
}

// ── Timeline MVT helpers (batched — all snapshots in a single tile request) ──

function buildBatchedTileUrl(
  javaBackendUrl: string,
  snapshotIds: number[],
  zone?: string,
): string {
  const ids = snapshotIds.join(',');
  let url = `${javaBackendUrl}/tiles/taxis/timeline/{z}/{x}/{y}.pbf?snapshots=${ids}`;
  if (zone) url += `&zone=${encodeURIComponent(zone)}`;
  return url;
}

function addTimelineMbLayer(
  m: mapboxgl.Map,
  layerId: string,
  snapshotIds: number[],
  initialSnapshotId: number,
  javaBackendUrl: string,
  zone?: string,
) {
  const ids = timelineIds(layerId);
  if (!m.getSource(ids.source)) {
    m.addSource(ids.source, {
      type: 'vector',
      tiles: [buildBatchedTileUrl(javaBackendUrl, snapshotIds, zone)],
    });
  }
  if (!m.getLayer(ids.points)) {
    m.addLayer({
      id: ids.points, type: 'circle', source: ids.source, 'source-layer': 'taxis',
      filter: ['==', ['get', 'snapshot_id'], initialSnapshotId],
      paint: {
        'circle-color': '#11b4da', 'circle-radius': 6,
        'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9,
      },
    });
  }
}

function setTimelineSnapshotFilter(
  m: mapboxgl.Map,
  layerId: string,
  snapshotId: number,
) {
  const ids = timelineIds(layerId);
  if (m.getLayer(ids.points)) {
    m.setFilter(ids.points, ['==', ['get', 'snapshot_id'], snapshotId]);
  }
}

function removeTimelineMbLayer(m: mapboxgl.Map, layerId: string) {
  const ids = timelineIds(layerId);
  if (m.getLayer(ids.points)) m.removeLayer(ids.points);
  if (m.getSource(ids.source)) m.removeSource(ids.source);
}

function applyLayerVisibility(
  m: mapboxgl.Map,
  layerId: string,
  type: 'spatial_query' | 'timeline',
  isVisible: boolean,
) {
  const vis = isVisible ? 'visible' : 'none';
  if (type === 'spatial_query') {
    const ids = spatialIds(layerId);
    [ids.heatmap, ids.clusters, ids.clusterCount, ids.points].forEach(id => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', vis);
    });
  } else {
    const ids = timelineIds(layerId);
    if (m.getLayer(ids.points)) m.setLayoutProperty(ids.points, 'visibility', vis);
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function formatHHMM(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-SG', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore',
    });
  } catch {
    return iso;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GeoHeatmapMap({
  mapboxToken,
  javaBackendUrl,
  layers,
  visibility,
  zoneGeometries = {},
  onToggle,
  onRemove,
}: GeoHeatmapMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const addedLayerTypes = useRef<Map<string, 'spatial_query' | 'timeline'>>(new Map());
  const addedBoundaries = useRef<Set<string>>(new Set());

  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>({ mode: 'heatmap', zoom: 11 });

  // Timeline state — driven by the first visible timeline layer
  const [snapshotIndex, setSnapshotIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const timelineEntry = Object.entries(layers).find(
    ([id, r]) => r.data?.type === 'timeline' && (visibility[id] ?? true),
  );
  const activeTimelineId = timelineEntry?.[0] ?? null;
  const timelineData = (timelineEntry?.[1]?.data ?? null) as TimelineData | null;
  const snapshots = timelineData?.snapshots ?? [];

  // ── Map initialisation ────────────────────────────────────────────────────

  const updateVisualizationMode = useCallback((zoom: number) => {
    let mode: VisualizationMode['mode'];
    if (zoom < 12) mode = 'heatmap';
    else if (zoom < 15) mode = 'clusters';
    else mode = 'points';
    setVisualizationMode({ mode, zoom: Math.round(zoom * 10) / 10 });
  }, []);

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
      setLoading(false);
      setMapReady(true);
    });
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        addedLayerTypes.current.clear();
        addedBoundaries.current.clear();
      }
    };
  }, [mapboxToken, updateVisualizationMode]);

  // ── Sync data layers when `layers` record changes ─────────────────────────

  useEffect(() => {
    if (!mapReady || !map.current) return;
    const m = map.current;

    // Remove layers that no longer exist in `layers`
    for (const [layerId, type] of addedLayerTypes.current) {
      if (!layers[layerId]) {
        if (type === 'spatial_query') removeSpatialMbLayer(m, layerId);
        else removeTimelineMbLayer(m, layerId);
        addedLayerTypes.current.delete(layerId);
      }
    }

    // Add newly arrived layers
    for (const [layerId, response] of Object.entries(layers)) {
      if (addedLayerTypes.current.has(layerId) || !response.data) continue;
      const type = response.data.type;
      if (type === 'spatial_query') {
        addSpatialMbLayer(m, layerId, (response.data as SpatialQueryData).locations);
        addedLayerTypes.current.set(layerId, 'spatial_query');
      } else if (type === 'timeline') {
        const tl = response.data as TimelineData;
        if (tl.snapshots.length > 0) {
          const zone = tl.context?.type === 'zone' ? tl.context.zone_name : undefined;
          const allIds = tl.snapshots.map(s => s.snapshot_id);
          addTimelineMbLayer(m, layerId, allIds, allIds[0], javaBackendUrl, zone);
          addedLayerTypes.current.set(layerId, 'timeline');
        }
      }
      if (addedLayerTypes.current.has(layerId)) {
        applyLayerVisibility(m, layerId, type as 'spatial_query' | 'timeline', visibility[layerId] ?? true);
      }
    }
  }, [mapReady, layers]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync zone boundary layers when zoneGeometries changes ─────────────────

  useEffect(() => {
    if (!mapReady || !map.current) return;
    const m = map.current;

    // Remove boundaries whose layer was removed
    for (const layerId of addedBoundaries.current) {
      if (!zoneGeometries[layerId]) {
        removeZoneBoundaryMbLayer(m, layerId);
        addedBoundaries.current.delete(layerId);
      }
    }

    // Add newly arrived boundaries
    for (const [layerId, geo] of Object.entries(zoneGeometries)) {
      if (addedBoundaries.current.has(layerId)) continue;
      addZoneBoundaryMbLayer(m, layerId, geo);
      addedBoundaries.current.add(layerId);
      applyZoneBoundaryVisibility(m, layerId, visibility[layerId] ?? true);
    }
  }, [mapReady, zoneGeometries]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync visibility when toggled ──────────────────────────────────────────

  useEffect(() => {
    if (!mapReady || !map.current) return;
    const m = map.current;
    for (const [layerId, type] of addedLayerTypes.current) {
      applyLayerVisibility(m, layerId, type, visibility[layerId] ?? true);
    }
    for (const layerId of addedBoundaries.current) {
      applyZoneBoundaryVisibility(m, layerId, visibility[layerId] ?? true);
    }
  }, [mapReady, visibility]);

  // ── Timeline: reset on active timeline change ─────────────────────────────

  useEffect(() => {
    setSnapshotIndex(0);
    setIsPlaying(false);
    // Mapbox doesn't auto-detect container size changes when the slider
    // appears/disappears, so we nudge it to recalculate.
    if (map.current) {
      requestAnimationFrame(() => map.current?.resize());
    }
  }, [activeTimelineId]);

  // ── Timeline: switch visible snapshot via filter expression ─────────────

  useEffect(() => {
    if (!mapReady || !map.current || !activeTimelineId || !timelineData) return;
    const snapshot = timelineData.snapshots[snapshotIndex];
    if (!snapshot) return;
    setTimelineSnapshotFilter(map.current, activeTimelineId, snapshot.snapshot_id);
  }, [mapReady, snapshotIndex, activeTimelineId, timelineData]);

  // ── Timeline: playback — advance one snapshot per tick (instant filter) ──

  useEffect(() => {
    if (!isPlaying || snapshots.length === 0) return;

    const timerId = setTimeout(() => {
      setSnapshotIndex(prev => {
        if (prev >= snapshots.length - 1) { setIsPlaying(false); return prev; }
        return prev + 1;
      });
    }, PLAYBACK_INTERVAL_MS);

    return () => clearTimeout(timerId);
  }, [isPlaying, snapshotIndex, snapshots.length]);

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
  const isTimelineMode = activeTimelineId !== null;

  return (
    <div className="w-full h-full relative flex flex-col">
      {/* Mapbox container — must be a direct flex child so it gets proper dimensions */}
      <div ref={mapContainer} className="flex-1" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
          <div className="bg-white rounded-lg p-6 shadow-xl flex items-center space-x-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <span className="text-lg font-medium text-gray-900">Loading map…</span>
          </div>
        </div>
      )}

      {/* Zoom mode indicator (spatial mode only) — absolute over the map */}
      {!loading && !isTimelineMode && (
        <div className="absolute bottom-8 right-4 bg-slate-900/80 backdrop-blur rounded-md px-3 py-1.5 text-xs text-slate-300 pointer-events-none z-10">
          {visualizationMode.mode === 'heatmap' && 'Heatmap view'}
          {visualizationMode.mode === 'clusters' && 'Cluster view'}
          {visualizationMode.mode === 'points' && 'Point view'}
          {' · zoom '}{visualizationMode.zoom}
        </div>
      )}

      {/* Layer toggle panel — bottom-left, raised above timeline slider when it's visible */}
      {!loading && (
        <div
          className="absolute left-0 z-10 transition-all"
          style={{ bottom: isTimelineMode ? '5rem' : '0' }}
        >
          <LayerToggle
            layers={layers}
            visibility={visibility}
            onToggle={onToggle}
            onRemove={onRemove}
          />
        </div>
      )}

      {/* Time slider panel (timeline mode only) */}
      {!loading && isTimelineMode && snapshots.length > 0 && (
        <div className="flex-shrink-0 bg-slate-900/95 backdrop-blur px-5 py-3 z-10">
          <div className="flex items-center gap-4">
            <button
              onClick={handlePlayPause}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            <div className="flex-shrink-0 text-right min-w-[72px]">
              <div className="text-xs text-slate-400">{snapshotIndex + 1} / {snapshots.length}</div>
              <div className="text-sm font-semibold text-white tabular-nums">
                {currentSnapshot ? formatHHMM(currentSnapshot.timestamp) : '--:--'}
              </div>
            </div>

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
