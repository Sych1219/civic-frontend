'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import LayerToggle from '@/components/LayerToggle';
import type { ApiResponse, MapData, VisualizationMode } from '@/types/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface TemporalState {
  timestamps: string[];
  stationValues: Map<string, number>[];
  range: [number, number];
  unit: string;
}

interface LayerRuntime {
  temporal?: TemporalState;
}

interface GeoHeatmapMapProps {
  mapboxToken: string;
  /** All accumulated map-type responses keyed by layer_id */
  layers?: Record<string, ApiResponse>;
  /** Visibility override per layer_id; defaults to true */
  visibility?: Record<string, boolean>;
  onToggleLayer?: (layerId: string) => void;
  onRemoveLayer?: (layerId: string) => void;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

// ── Mapbox ID helpers ────────────────────────────────────────────────────────

const sourceId      = (lid: string) => `geodata-${lid}`;
const heatmapId     = (lid: string) => `heatmap-${lid}`;
const clustersId    = (lid: string) => `clusters-${lid}`;
const clusterCntId  = (lid: string) => `cluster-count-${lid}`;
const pointsId      = (lid: string) => `points-${lid}`;
const temporalSrcId = (lid: string) => `temporal-geodata-${lid}`;
const temporalGlow  = (lid: string) => `temporal-glow-${lid}`;
const temporalPts   = (lid: string) => `temporal-points-${lid}`;
const temporalLbls  = (lid: string) => `temporal-labels-${lid}`;

const staticLayerIds   = (lid: string) => [heatmapId(lid), clustersId(lid), clusterCntId(lid), pointsId(lid)];
const temporalLayerIds = (lid: string) => [temporalGlow(lid), temporalPts(lid), temporalLbls(lid)];
const allLayerIds      = (lid: string) => [...staticLayerIds(lid), ...temporalLayerIds(lid)];

// ── Component ────────────────────────────────────────────────────────────────

export default function GeoHeatmapMap({
  mapboxToken,
  layers = {},
  visibility = {},
  onToggleLayer,
  onRemoveLayer,
}: GeoHeatmapMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const pendingLayers = useRef<Record<string, ApiResponse>>({});
  const layerRuntimes = useRef<Record<string, LayerRuntime>>({});

  const [loading, setLoading] = useState(true);
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>({ mode: 'heatmap', zoom: 11 });

  // Active temporal layer drives the time-slider UI
  const [activeTemporalLayerId, setActiveTemporalLayerId] = useState<string | null>(null);
  const [timeProgress, setTimeProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const animFrameRef = useRef<number>(0);

  // ── Pure helpers ─────────────────────────────────────────────────────────

  const getMapGeoJson = useCallback((data: ApiResponse): GeoJSON.FeatureCollection => {
    const fc = (data.data as MapData).geojson;
    const points: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const feature of fc.features) {
      if (feature.geometry.type === 'Point') {
        points.push(feature as GeoJSON.Feature<GeoJSON.Point>);
        continue;
      }
      if (feature.geometry.type === 'MultiPoint') {
        const coords = (feature.geometry as GeoJSON.MultiPoint).coordinates;
        const staticProps = (feature.properties?.static ?? {}) as Record<string, unknown[]>;
        const latestValue =
          (feature.properties?.temporal?.series as { value: number }[] | undefined)?.[0]?.value ?? null;
        coords.forEach((coord, i) => {
          const perPoint: Record<string, unknown> = {};
          for (const [key, arr] of Object.entries(staticProps)) {
            perPoint[key] = Array.isArray(arr) ? arr[i] : arr;
          }
          if (latestValue !== null) perPoint['value'] = latestValue;
          points.push({ type: 'Feature', geometry: { type: 'Point', coordinates: coord }, properties: perPoint });
        });
      }
    }
    return { type: 'FeatureCollection', features: points };
  }, []);

  const parseTemporalData = useCallback((data: ApiResponse): TemporalState | null => {
    const mapData = data.data as MapData;
    const feature = mapData.geojson.features[0];
    if (!feature) return null;
    const featureTemporal = feature.properties?.temporal as
      | { series: { time: string; value: number }[]; unit?: string }
      | undefined;
    const series = featureTemporal?.series ?? mapData.temporal?.series ?? [];
    const unit = (featureTemporal?.unit ?? mapData.temporal?.unit ?? '°C')
      .replace('deg C', '°C').replace('deg F', '°F');
    const coords = (feature.geometry as GeoJSON.MultiPoint)?.coordinates ?? [];
    if (coords.length === 0 || series.length === 0) return null;
    const numStations = coords.length;
    const blockStarts: number[] = [0];
    for (let i = 1; i < series.length; i++) {
      if (series[i].time >= series[i - 1].time) blockStarts.push(i);
    }
    blockStarts.push(series.length);
    const rawBlocks: { time: string; value: number }[][] = [];
    if (blockStarts.length - 1 === numStations) {
      for (let s = 0; s < numStations; s++) rawBlocks.push(series.slice(blockStarts[s], blockStarts[s + 1]));
    } else {
      const blockSize = Math.floor(series.length / numStations);
      for (let s = 0; s < numStations; s++) rawBlocks.push(series.slice(s * blockSize, (s + 1) * blockSize));
    }
    let globalMin = Infinity, globalMax = -Infinity;
    const stationValues: Map<string, number>[] = rawBlocks.map((block) => {
      const m = new Map<string, number>();
      for (const entry of block) {
        m.set(entry.time, entry.value);
        if (entry.value < globalMin) globalMin = entry.value;
        if (entry.value > globalMax) globalMax = entry.value;
      }
      return m;
    });
    const timestamps = [...new Set(series.map((s) => s.time))].sort();
    return { timestamps, stationValues, range: [globalMin, globalMax], unit };
  }, []);

  const buildTemporalGeoJson = useCallback((
    data: ApiResponse,
    temporal: TemporalState,
    progress: number,
  ): GeoJSON.FeatureCollection => {
    const mapData = data.data as MapData;
    const feature = mapData.geojson.features[0];
    if (!feature || feature.geometry.type !== 'MultiPoint') return { type: 'FeatureCollection', features: [] };
    const coords = (feature.geometry as GeoJSON.MultiPoint).coordinates;
    const staticProps = (feature.properties?.static ?? {}) as Record<string, unknown[]>;
    const { timestamps, stationValues } = temporal;
    const idx = Math.min(Math.floor(progress), timestamps.length - 1);
    const nextIdx = Math.min(idx + 1, timestamps.length - 1);
    const frac = progress - idx;
    const ts = timestamps[idx];
    const tsNext = timestamps[nextIdx];
    const features: GeoJSON.Feature<GeoJSON.Point>[] = coords.map((coord, i) => {
      const perPoint: Record<string, unknown> = {};
      for (const [key, arr] of Object.entries(staticProps)) {
        perPoint[key] = Array.isArray(arr) ? arr[i] : arr;
      }
      const v0 = stationValues[i]?.get(ts) ?? 0;
      const v1 = stationValues[i]?.get(tsNext) ?? v0;
      perPoint['value'] = Math.round((v0 + (v1 - v0) * frac) * 10) / 10;
      return { type: 'Feature', geometry: { type: 'Point', coordinates: coord }, properties: perPoint };
    });
    return { type: 'FeatureCollection', features };
  }, []);

  const updateVisualizationMode = useCallback((zoom: number) => {
    let mode: VisualizationMode['mode'];
    if (zoom < 12) mode = 'heatmap';
    else if (zoom < 15) mode = 'clusters';
    else mode = 'points';
    setVisualizationMode({ mode, zoom: Math.round(zoom * 10) / 10 });
  }, []);

  // ── Register one layer's Mapbox sources + layers ──────────────────────────

  const registerMapboxLayer = useCallback((
    m: mapboxgl.Map,
    lid: string,
    data: ApiResponse,
    vis: boolean,
  ) => {
    const isTemporal = data.visualization_type === 'map_temporal';
    const visStr = vis ? 'visible' : 'none';

    if (!m.getSource(sourceId(lid))) {
      m.addSource(sourceId(lid), {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true, clusterMaxZoom: 14, clusterRadius: 50,
      });
    }
    if (!m.getLayer(heatmapId(lid))) {
      m.addLayer({
        id: heatmapId(lid), type: 'heatmap', source: sourceId(lid), maxzoom: 12,
        layout: { visibility: isTemporal ? 'none' : visStr },
        paint: {
          'heatmap-weight': ['case', ['has', 'value'],
            ['interpolate', ['linear'], ['get', 'value'], 0, 0, 50, 1], 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 3],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(33,102,172,0)', 0.2, 'rgb(103,169,207)', 0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)', 0.8, 'rgb(239,138,98)', 1, 'rgb(178,24,43)'],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 12, 50],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 1, 12, 0],
        },
      });
    }
    if (!m.getLayer(clustersId(lid))) {
      m.addLayer({
        id: clustersId(lid), type: 'circle', source: sourceId(lid),
        filter: ['has', 'point_count'], minzoom: 12, maxzoom: 15,
        layout: { visibility: isTemporal ? 'none' : visStr },
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#51bbd6', 100, '#f1f075', 750, '#f28cb1'],
          'circle-radius': ['step', ['get', 'point_count'], 20, 100, 30, 750, 40],
          'circle-opacity': 0.8, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff',
        },
      });
    }
    if (!m.getLayer(clusterCntId(lid))) {
      m.addLayer({
        id: clusterCntId(lid), type: 'symbol', source: sourceId(lid),
        filter: ['has', 'point_count'], minzoom: 12, maxzoom: 15,
        layout: {
          visibility: isTemporal ? 'none' : visStr,
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: { 'text-color': '#ffffff' },
      });
    }
    if (!m.getLayer(pointsId(lid))) {
      m.addLayer({
        id: pointsId(lid), type: 'circle', source: sourceId(lid),
        filter: ['!', ['has', 'point_count']], minzoom: 15,
        layout: { visibility: isTemporal ? 'none' : visStr },
        paint: {
          'circle-color': '#11b4da', 'circle-radius': 6,
          'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9,
        },
      });
    }
    m.on('click', pointsId(lid), (e) => {
      if (!e.features || e.features.length === 0) return;
      const coordinates = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      const props = e.features[0].properties || {};
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180)
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      const name = props['name'] ?? props['id'] ?? null;
      const value = props['value'] != null ? Number(props['value']).toFixed(1) : null;
      const skipKeys = new Set(['name', 'id', 'value']);
      const otherRows = Object.entries(props)
        .filter(([k]) => !skipKeys.has(k))
        .map(([k, v]) =>
          `<tr><td style="padding:2px 8px 2px 0;font-size:11px;color:#666;">${k}</td>` +
          `<td style="padding:2px 0;font-size:11px;">${v}</td></tr>`)
        .join('');
      new mapboxgl.Popup().setLngLat(coordinates).setHTML(
        `<div style="padding:8px;max-width:240px;">
          ${name ? `<h3 style="margin:0 0 6px 0;font-weight:bold;font-size:13px;">${name}</h3>` : ''}
          ${value != null ? `<p style="margin:0 0 8px 0;font-size:14px;color:#e05c2a;font-weight:600;">${value} <span style="font-size:11px;color:#888;font-weight:normal;">${props['unit'] ?? '°C'}</span></p>` : ''}
          ${otherRows ? `<table style="border-collapse:collapse;">${otherRows}</table>` : ''}
          <p style="margin:6px 0 0;font-size:10px;color:#999;">Lat: ${coordinates[1].toFixed(5)}, Lng: ${coordinates[0].toFixed(5)}</p>
        </div>`).addTo(m);
    });
    m.on('mouseenter', pointsId(lid), () => { m.getCanvas().style.cursor = 'pointer'; });
    m.on('mouseleave', pointsId(lid), () => { m.getCanvas().style.cursor = ''; });

    if (!m.getSource(temporalSrcId(lid))) {
      m.addSource(temporalSrcId(lid), { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!m.getLayer(temporalGlow(lid))) {
      m.addLayer({
        id: temporalGlow(lid), type: 'circle', source: temporalSrcId(lid),
        layout: { visibility: isTemporal ? visStr : 'none' },
        paint: {
          'circle-radius': 18,
          'circle-color': ['interpolate', ['linear'], ['get', 'value'],
            0, '#2166ac', 12.5, '#67a9cf', 25, '#f7f7f7', 37.5, '#ef8a62', 50, '#b2182b'],
          'circle-opacity': 0.25, 'circle-blur': 1,
        },
      });
    }
    if (!m.getLayer(temporalPts(lid))) {
      m.addLayer({
        id: temporalPts(lid), type: 'circle', source: temporalSrcId(lid),
        layout: { visibility: isTemporal ? visStr : 'none' },
        paint: {
          'circle-radius': 9,
          'circle-color': ['interpolate', ['linear'], ['get', 'value'],
            0, '#2166ac', 12.5, '#67a9cf', 25, '#f7f7f7', 37.5, '#ef8a62', 50, '#b2182b'],
          'circle-opacity': 0.92, 'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(255,255,255,0.8)',
        },
      });
    }
    if (!m.getLayer(temporalLbls(lid))) {
      m.addLayer({
        id: temporalLbls(lid), type: 'symbol', source: temporalSrcId(lid),
        layout: {
          visibility: isTemporal ? visStr : 'none',
          'text-field': ['concat', ['to-string', ['round', ['get', 'value']]], '°'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 11, 'text-offset': [0, -1.6], 'text-allow-overlap': true,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.6)', 'text-halo-width': 1 },
      });
    }
  }, []);

  const populateLayer = useCallback((m: mapboxgl.Map, lid: string, data: ApiResponse) => {
    const isTemporal = data.visualization_type === 'map_temporal';
    if (isTemporal) {
      const parsed = parseTemporalData(data);
      if (!parsed) return;
      layerRuntimes.current[lid] = { temporal: parsed };
      const [lo, hi] = parsed.range;
      const colorRamp: mapboxgl.Expression = [
        'interpolate', ['linear'], ['get', 'value'],
        lo, '#2166ac', lo + (hi - lo) * 0.25, '#67a9cf',
        lo + (hi - lo) * 0.5, '#f7f7f7', lo + (hi - lo) * 0.75, '#ef8a62',
        hi, '#b2182b',
      ];
      if (m.getLayer(temporalGlow(lid))) m.setPaintProperty(temporalGlow(lid), 'circle-color', colorRamp);
      if (m.getLayer(temporalPts(lid)))  m.setPaintProperty(temporalPts(lid),  'circle-color', colorRamp);
      const geoJson = buildTemporalGeoJson(data, parsed, 0);
      const src = m.getSource(temporalSrcId(lid)) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(geoJson);
      setActiveTemporalLayerId(lid);
      setTimeProgress(0);
      setIsPlaying(false);
    } else {
      layerRuntimes.current[lid] = {};
      const geoJson = getMapGeoJson(data);
      const src = m.getSource(sourceId(lid)) as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(geoJson);
    }
  }, [parseTemporalData, buildTemporalGeoJson, getMapGeoJson]);

  const unregisterMapboxLayer = useCallback((m: mapboxgl.Map, lid: string) => {
    for (const id of allLayerIds(lid)) { if (m.getLayer(id)) m.removeLayer(id); }
    if (m.getSource(sourceId(lid)))      m.removeSource(sourceId(lid));
    if (m.getSource(temporalSrcId(lid))) m.removeSource(temporalSrcId(lid));
    delete layerRuntimes.current[lid];
  }, []);

  const applyVisibility = useCallback((m: mapboxgl.Map, lid: string, data: ApiResponse, vis: boolean) => {
    const isTemporal = data.visualization_type === 'map_temporal';
    for (const layId of staticLayerIds(lid)) {
      if (m.getLayer(layId)) m.setLayoutProperty(layId, 'visibility', (vis && !isTemporal) ? 'visible' : 'none');
    }
    for (const layId of temporalLayerIds(lid)) {
      if (m.getLayer(layId)) m.setLayoutProperty(layId, 'visibility', (vis && isTemporal) ? 'visible' : 'none');
    }
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
      setLoading(false);
      const pending = pendingLayers.current;
      pendingLayers.current = {};
      for (const [lid, data] of Object.entries(pending)) {
        registerMapboxLayer(map.current, lid, data, true);
        populateLayer(map.current, lid, data);
        const center = (data.data as MapData).center;
        if (center) map.current.flyTo({ center: [center.lon, center.lat], essential: true });
      }
    });
    return () => { if (map.current) { map.current.remove(); map.current = null; } };
  }, [mapboxToken, updateVisualizationMode, registerMapboxLayer, populateLayer]);

  // ── React to layers / visibility changes ─────────────────────────────────

  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) {
      for (const [lid, data] of Object.entries(layers)) pendingLayers.current[lid] = data;
      return;
    }
    const currentIds = new Set(Object.keys(layerRuntimes.current));
    const incomingIds = new Set(Object.keys(layers));

    for (const lid of currentIds) {
      if (!incomingIds.has(lid)) unregisterMapboxLayer(m, lid);
    }
    for (const [lid, data] of Object.entries(layers)) {
      const vis = visibility[lid] ?? true;
      if (!currentIds.has(lid)) {
        registerMapboxLayer(m, lid, data, vis);
        populateLayer(m, lid, data);
        const center = (data.data as MapData).center;
        if (center) m.flyTo({ center: [center.lon, center.lat], essential: true });
      } else {
        populateLayer(m, lid, data);
      }
      applyVisibility(m, lid, data, vis);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, visibility]);

  // ── Update temporal source on timeProgress ────────────────────────────────

  useEffect(() => {
    if (!activeTemporalLayerId || !map.current) return;
    const data = layers[activeTemporalLayerId];
    const runtime = layerRuntimes.current[activeTemporalLayerId];
    if (!data || !runtime?.temporal) return;
    const geoJson = buildTemporalGeoJson(data, runtime.temporal, timeProgress);
    const src = map.current.getSource(temporalSrcId(activeTemporalLayerId)) as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(geoJson);
  }, [timeProgress, activeTemporalLayerId, layers, buildTemporalGeoJson]);

  // ── Animation loop ────────────────────────────────────────────────────────

  useEffect(() => {
    const temporal = activeTemporalLayerId ? layerRuntimes.current[activeTemporalLayerId]?.temporal : null;
    if (!isPlaying || !temporal || temporal.timestamps.length < 2) return;
    let last = performance.now();
    const speed = 3;
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTimeProgress((prev) => {
        const next = prev + dt * speed;
        if (next >= temporal.timestamps.length - 1) { setIsPlaying(false); return temporal.timestamps.length - 1; }
        return next;
      });
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, activeTemporalLayerId]);

  // ── Derived temporal state for the slider ────────────────────────────────

  const activeTemporalState =
    activeTemporalLayerId && (visibility[activeTemporalLayerId] ?? true)
      ? layerRuntimes.current[activeTemporalLayerId]?.temporal ?? null
      : null;


  return (
    <div className="w-full h-full flex flex-col">
      <div className="relative flex-1 min-h-0">
        <div ref={mapContainer} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
            <div className="bg-white rounded-lg p-6 shadow-xl flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <span className="text-lg font-medium text-gray-900">Loading map…</span>
            </div>
          </div>
        )}

        {/* Layer toggle — positioned inside map area so it doesn't overlap the time slider */}
        {!loading && onToggleLayer && onRemoveLayer && (
          <LayerToggle
            layers={layers}
            visibility={visibility}
            onToggle={onToggleLayer}
            onRemove={onRemoveLayer}
          />
        )}

        {/* Legend — temporal layer */}
        {!loading && activeTemporalState && (
          <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur rounded-lg shadow-lg p-4 z-10 min-w-[200px] text-white">
            <div className="space-y-2">
              <h3 className="font-bold text-sm">🕒 Temporal View</h3>
              <p className="text-xs text-slate-300">
                {activeTemporalState.timestamps.length} time steps &middot;{' '}
                {activeTemporalState.stationValues.length} stations
              </p>
              <div
                className="w-full h-2 rounded-full"
                style={{ background: 'linear-gradient(to right,#2166ac,#67a9cf,#fddbc7,#ef8a62,#b2182b)' }}
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{activeTemporalState.range[0].toFixed(1)} {activeTemporalState.unit}</span>
                <span>{activeTemporalState.range[1].toFixed(1)} {activeTemporalState.unit}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Time slider */}
      {activeTemporalState && activeTemporalState.timestamps.length > 0 && (
        <div className="flex-shrink-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 px-5 py-3 space-y-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (timeProgress >= activeTemporalState.timestamps.length - 1) setTimeProgress(0);
                setIsPlaying((p) => !p);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 text-white transition-colors flex-shrink-0"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 4h3v12H5V4zm7 0h3v12h-3V4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.5 3.5v13l11-6.5-11-6.5z" />
                </svg>
              )}
            </button>
            <span className="text-white font-mono text-sm min-w-[160px]">
              {(() => {
                const idx = Math.min(Math.round(timeProgress), activeTemporalState.timestamps.length - 1);
                return new Date(activeTemporalState.timestamps[idx]).toLocaleTimeString([], {
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                });
              })()}
            </span>
            <div className="flex items-center gap-2 ml-auto text-xs text-slate-300">
              <span>{activeTemporalState.range[0].toFixed(1)} {activeTemporalState.unit}</span>
              <div className="w-28 h-2 rounded-full"
                style={{ background: 'linear-gradient(to right,#2166ac,#67a9cf,#fddbc7,#ef8a62,#b2182b)' }} />
              <span>{activeTemporalState.range[1].toFixed(1)} {activeTemporalState.unit}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-400 font-mono min-w-[48px]">
              {new Date(activeTemporalState.timestamps[0]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <input
              type="range" min={0} max={activeTemporalState.timestamps.length - 1} step={0.05}
              value={timeProgress}
              onChange={(e) => { setIsPlaying(false); setTimeProgress(parseFloat(e.target.value)); }}
              className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 font-mono min-w-[48px] text-right">
              {new Date(activeTemporalState.timestamps[activeTemporalState.timestamps.length - 1]).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
