'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { ApiResponse, MapData, VisualizationMode } from '@/types/api';

interface GeoHeatmapMapProps {
  mapboxToken: string;
  externalData?: ApiResponse | null;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function GeoHeatmapMap({
  mapboxToken,
  externalData = null,
  // autoRefresh and refreshInterval are reserved for future standalone-mode use
}: GeoHeatmapMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const pendingData = useRef<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>({
    mode: 'heatmap',
    zoom: 11
  });

  // ── Temporal-mode state ──────────────────────────────────────────────────
  const [isTemporalMode, setIsTemporalMode] = useState(false);
  const [temporalTimestamps, setTemporalTimestamps] = useState<string[]>([]);
  const [timeProgress, setTimeProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [temporalUnit, setTemporalUnit] = useState('°C');
  const [temporalRange, setTemporalRange] = useState<[number, number]>([0, 50]);
  const temporalStationValues = useRef<Map<string, number>[]>([]);
  const animFrameRef = useRef<number>(0);

  /**
   * Expand a MapData GeoJSON into individual Point features suitable for
   * Mapbox heatmap / cluster / unclustered layers.
   *
   * The backend may return a single MultiPoint feature whose properties
   * are parallel arrays (one entry per station).  We unpack those arrays
   * so every Point gets its own scalar properties plus the latest `value`
   * from the temporal series.
   */
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
        // Use the most-recent reading as the per-point heatmap weight
        const latestValue =
          (feature.properties?.temporal?.series as { value: number }[] | undefined)?.[0]
            ?.value ?? null;

        coords.forEach((coord, i) => {
          // Flatten parallel arrays: e.g. staticProps.name[i] → name
          const perPoint: Record<string, unknown> = {};
          for (const [key, arr] of Object.entries(staticProps)) {
            perPoint[key] = Array.isArray(arr) ? arr[i] : arr;
          }
          if (latestValue !== null) perPoint['value'] = latestValue;

          points.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coord },
            properties: perPoint,
          });
        });
      }
    }

    return { type: 'FeatureCollection', features: points };
  }, []);

  /**
   * Parse the temporal series from a map_temporal response.
   * Detects station blocks automatically (timestamps run newest→oldest
   * within each block) and returns per-station value maps.
   */
  const parseTemporalData = useCallback((data: ApiResponse) => {
    const mapData = data.data as MapData;
    const feature = mapData.geojson.features[0];
    console.log('[parseTemporalData] feature:', feature ? 'exists' : 'null', 'geometry:', feature?.geometry?.type);
    if (!feature) return null;

    const featureTemporal = feature.properties?.temporal as
      | { series: { time: string; value: number }[]; unit?: string }
      | undefined;
    const series = featureTemporal?.series ?? mapData.temporal?.series ?? [];
    const unit = (featureTemporal?.unit ?? mapData.temporal?.unit ?? '°C')
      .replace('deg C', '°C')
      .replace('deg F', '°F');

    const coords = (feature.geometry as GeoJSON.MultiPoint)?.coordinates ?? [];
    console.log('[parseTemporalData] coords:', coords.length, 'series:', series.length);
    if (coords.length === 0 || series.length === 0) return null;

    const numStations = coords.length;

    // Find block boundaries: a new station block starts when time goes FORWARD
    // (i.e. series[i].time >= series[i-1].time signals a timestamp reset).
    const blockStarts: number[] = [0];
    for (let i = 1; i < series.length; i++) {
      if (series[i].time >= series[i - 1].time) {
        blockStarts.push(i);
      }
    }
    blockStarts.push(series.length); // sentinel

    // Build per-station arrays; fall back to equal-split if count mismatches
    const rawBlocks: { time: string; value: number }[][] = [];
    if (blockStarts.length - 1 === numStations) {
      for (let s = 0; s < numStations; s++) {
        rawBlocks.push(series.slice(blockStarts[s], blockStarts[s + 1]));
      }
    } else {
      const blockSize = Math.floor(series.length / numStations);
      for (let s = 0; s < numStations; s++) {
        rawBlocks.push(series.slice(s * blockSize, (s + 1) * blockSize));
      }
    }

    // Build per-station Map<timestamp, value> and compute global range
    let globalMin = Infinity;
    let globalMax = -Infinity;
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
    return {
      timestamps,
      stationValues,
      range: [globalMin, globalMax] as [number, number],
      unit,
    };
  }, []);

  /**
   * Build a FeatureCollection for a (possibly fractional) time-progress value.
   * Linearly interpolates values between adjacent time-steps for smooth
   * colour transitions when dragging or during playback.
   */
  const buildTemporalGeoJson = useCallback(
    (
      data: ApiResponse,
      timestamps: string[],
      stationValues: Map<string, number>[],
      progress: number,
    ): GeoJSON.FeatureCollection => {
      const mapData = data.data as MapData;
      const feature = mapData.geojson.features[0];
      if (!feature || feature.geometry.type !== 'MultiPoint')
        return { type: 'FeatureCollection', features: [] };

      const coords = (feature.geometry as GeoJSON.MultiPoint).coordinates;
      const staticProps = (feature.properties?.static ?? {}) as Record<
        string,
        unknown[]
      >;

      const idx = Math.min(Math.floor(progress), timestamps.length - 1);
      const nextIdx = Math.min(idx + 1, timestamps.length - 1);
      const frac = progress - idx;
      const ts = timestamps[idx];
      const tsNext = timestamps[nextIdx];

      const features: GeoJSON.Feature<GeoJSON.Point>[] = coords.map(
        (coord, i) => {
          const perPoint: Record<string, unknown> = {};
          for (const [key, arr] of Object.entries(staticProps)) {
            perPoint[key] = Array.isArray(arr) ? arr[i] : arr;
          }
          const v0 = stationValues[i]?.get(ts) ?? 0;
          const v1 = stationValues[i]?.get(tsNext) ?? v0;
          perPoint['value'] = Math.round((v0 + (v1 - v0) * frac) * 10) / 10;
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coord },
            properties: perPoint,
          };
        },
      );

      return { type: 'FeatureCollection', features };
    },
    [],
  );

  // Update visualization mode based on zoom
  const updateVisualizationMode = useCallback((zoom: number) => {
    let mode: VisualizationMode['mode'];
    
    if (zoom < 12) {
      mode = 'heatmap';
    } else if (zoom < 15) {
      mode = 'clusters';
    } else {
      mode = 'points';
    }
    
    setVisualizationMode({ mode, zoom: Math.round(zoom * 10) / 10 });
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [103.8198, 1.3521], // Singapore center
      zoom: 11,
      pitch: 0
    });

    map.current.on('load', () => {
      if (!map.current) return;

      // Start with empty data — populated when user queries via chatbot
      const emptyData: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: []
      };

      // Add source with clustering
      map.current.addSource('geodata', {
        type: 'geojson',
        data: emptyData,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });

      // Layer 1: Heatmap layer (low zoom)
      map.current.addLayer({
        id: 'geodata-heat',
        type: 'heatmap',
        source: 'geodata',
        maxzoom: 12,
        paint: {
          // Weight by numeric 'value' property (e.g. temperature);
          // falls back to 1 when the property is absent (density-only mode)
          'heatmap-weight': [
            'case',
            ['has', 'value'],
            [
              'interpolate',
              ['linear'],
              ['get', 'value'],
              0, 0,
              50, 1
            ],
            1
          ],
          // Increase intensity as zoom level increases
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 1,
            12, 3
          ],
          // Color ramp for heatmap
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(33,102,172,0)',
            0.2, 'rgb(103,169,207)',
            0.4, 'rgb(209,229,240)',
            0.6, 'rgb(253,219,199)',
            0.8, 'rgb(239,138,98)',
            1, 'rgb(178,24,43)'
          ],
          // Adjust radius — wider radii ensure sparse sensor stations are visible
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 8,
            12, 50
          ],
          // Transition from heatmap to circle layer
          'heatmap-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            7, 1,
            12, 0
          ]
        }
      });

      // Layer 2: Cluster circles (mid zoom)
      map.current.addLayer({
        id: 'geodata-clusters',
        type: 'circle',
        source: 'geodata',
        filter: ['has', 'point_count'],
        minzoom: 12,
        maxzoom: 15,
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#51bbd6', // Small clusters
            100,
            '#f1f075', // Medium clusters
            750,
            '#f28cb1'  // Large clusters
          ],
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            20,  // Small clusters
            100,
            30,  // Medium clusters
            750,
            40   // Large clusters
          ],
          'circle-opacity': 0.8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff'
        }
      });

      // Layer 3: Cluster count labels
      map.current.addLayer({
        id: 'geodata-cluster-count',
        type: 'symbol',
        source: 'geodata',
        filter: ['has', 'point_count'],
        minzoom: 12,
        maxzoom: 15,
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 12
        },
        paint: {
          'text-color': '#ffffff'
        }
      });

      // Layer 4: Unclustered points (high zoom)
      map.current.addLayer({
        id: 'geodata-unclustered',
        type: 'circle',
        source: 'geodata',
        filter: ['!', ['has', 'point_count']],
        minzoom: 15,
        paint: {
          'circle-color': '#11b4da',
          'circle-radius': 6,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.9
        }
      });

      // Add click handler for unclustered points
      map.current.on('click', 'geodata-unclustered', (e) => {
        if (!e.features || e.features.length === 0) return;

        const coordinates = (e.features[0].geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        const props = e.features[0].properties || {};

        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        // Promoted fields shown at the top; everything else in the table
        const name = props['name'] ?? props['id'] ?? null;
        const value = props['value'] != null ? Number(props['value']).toFixed(1) : null;

        const skipKeys = new Set(['name', 'id', 'value']);
        const otherRows = Object.entries(props)
          .filter(([k]) => !skipKeys.has(k))
          .map(
            ([k, v]) =>
              `<tr><td style="padding:2px 8px 2px 0;font-size:11px;color:#666;">${k}</td>` +
              `<td style="padding:2px 0;font-size:11px;">${v}</td></tr>`
          )
          .join('');

        new mapboxgl.Popup()
          .setLngLat(coordinates)
          .setHTML(
            `<div style="padding:8px;max-width:240px;">
              ${name ? `<h3 style="margin:0 0 6px 0;font-weight:bold;font-size:13px;">${name}</h3>` : ''}
              ${value != null ? `<p style="margin:0 0 8px 0;font-size:14px;color:#e05c2a;font-weight:600;">${value} <span style="font-size:11px;color:#888;font-weight:normal;">${props['unit'] ?? '°C'}</span></p>` : ''}
              ${otherRows ? `<table style="border-collapse:collapse;">${otherRows}</table>` : ''}
              <p style="margin:6px 0 0;font-size:10px;color:#999;">Lat: ${coordinates[1].toFixed(5)}, Lng: ${coordinates[0].toFixed(5)}</p>
            </div>`
          )
          .addTo(map.current!);
      });

      // Change cursor on hover
      map.current.on('mouseenter', 'geodata-unclustered', () => {
        if (map.current) map.current.getCanvas().style.cursor = 'pointer';
      });

      map.current.on('mouseleave', 'geodata-unclustered', () => {
        if (map.current) map.current.getCanvas().style.cursor = '';
      });

      // Update visualization mode on zoom
      map.current.on('zoom', () => {
        if (map.current) {
          updateVisualizationMode(map.current.getZoom());
        }
      });

      // Set initial visualization mode
      updateVisualizationMode(map.current.getZoom());
      setLoading(false);

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-left');

      // ── Temporal-mode source & layers (hidden until map_temporal data) ──
      map.current.addSource('temporal-geodata', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Outer glow ring for temporal points
      map.current.addLayer({
        id: 'temporal-glow',
        type: 'circle',
        source: 'temporal-geodata',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 18,
          'circle-color': [
            'interpolate', ['linear'], ['get', 'value'],
            0, '#2166ac', 12.5, '#67a9cf', 25, '#f7f7f7',
            37.5, '#ef8a62', 50, '#b2182b',
          ],
          'circle-opacity': 0.25,
          'circle-blur': 1,
        },
      });

      // Main temporal points
      map.current.addLayer({
        id: 'temporal-points',
        type: 'circle',
        source: 'temporal-geodata',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': 9,
          'circle-color': [
            'interpolate', ['linear'], ['get', 'value'],
            0, '#2166ac', 12.5, '#67a9cf', 25, '#f7f7f7',
            37.5, '#ef8a62', 50, '#b2182b',
          ],
          'circle-opacity': 0.92,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.8)',
        },
      });

      // Value labels above temporal points
      map.current.addLayer({
        id: 'temporal-labels',
        type: 'symbol',
        source: 'temporal-geodata',
        layout: {
          visibility: 'none',
          'text-field': ['concat', ['to-string', ['round', ['get', 'value']]], '°'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 11,
          'text-offset': [0, -1.6],
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': 'rgba(0,0,0,0.6)',
          'text-halo-width': 1,
        },
      });

      // Apply data that arrived before the map finished loading
      if (pendingData.current) {
        const pData = pendingData.current;
        const isTemporal = pData.visualization_type === 'map_temporal';
        console.log('[GeoHeatmapMap] pendingData processing, isTemporal:', isTemporal);
        setIsTemporalMode(isTemporal);

        if (isTemporal) {
          const parsed = parseTemporalData(pData);
          console.log('[GeoHeatmapMap] pendingData parsed:', parsed ? { timestamps: parsed.timestamps.length, stations: parsed.stationValues.length } : null);
          if (parsed) {
            temporalStationValues.current = parsed.stationValues;
            setTemporalTimestamps(parsed.timestamps);
            setTemporalRange(parsed.range);
            setTemporalUnit(parsed.unit);
            setTimeProgress(0);
            setIsPlaying(false);

            // Update colour ramp
            const [lo, hi] = parsed.range;
            const colorRamp: mapboxgl.Expression = [
              'interpolate', ['linear'], ['get', 'value'],
              lo, '#2166ac',
              lo + (hi - lo) * 0.25, '#67a9cf',
              lo + (hi - lo) * 0.5, '#f7f7f7',
              lo + (hi - lo) * 0.75, '#ef8a62',
              hi, '#b2182b',
            ];
            if (map.current!.getLayer('temporal-glow'))
              map.current!.setPaintProperty('temporal-glow', 'circle-color', colorRamp);
            if (map.current!.getLayer('temporal-points'))
              map.current!.setPaintProperty('temporal-points', 'circle-color', colorRamp);

            // Build initial GeoJSON
            const geoJson = buildTemporalGeoJson(pData, parsed.timestamps, parsed.stationValues, 0);
            const src = map.current!.getSource('temporal-geodata') as mapboxgl.GeoJSONSource | undefined;
            if (src) src.setData(geoJson);

            // Show temporal layers, hide default layers
            for (const id of ['geodata-heat', 'geodata-clusters', 'geodata-cluster-count', 'geodata-unclustered']) {
              if (map.current!.getLayer(id)) map.current!.setLayoutProperty(id, 'visibility', 'none');
            }
            for (const id of ['temporal-glow', 'temporal-points', 'temporal-labels']) {
              if (map.current!.getLayer(id)) map.current!.setLayoutProperty(id, 'visibility', 'visible');
            }
          }
        } else {
          const geoJson = getMapGeoJson(pData);
          (map.current!.getSource('geodata') as mapboxgl.GeoJSONSource).setData(geoJson);
        }

        const center = (pData.data as MapData).center;
        if (center) map.current!.flyTo({ center: [center.lon, center.lat], essential: true });
        setLastUpdated(new Date());
        pendingData.current = null;
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [mapboxToken, updateVisualizationMode]);

  // Handle external data updates
  useEffect(() => {
    if (!externalData) return;

    // Map not loaded yet — store and apply once the 'load' event fires
    if (!map.current || !map.current.getSource('geodata')) {
      pendingData.current = externalData;
      return;
    }

    const isTemporal = externalData.visualization_type === 'map_temporal';
    console.log('[GeoHeatmapMap] visualization_type:', externalData.visualization_type, 'isTemporal:', isTemporal);
    setIsTemporalMode(isTemporal);

    if (isTemporal) {
      // ── Temporal-mode setup ─────────────────────────────────────────
      const parsed = parseTemporalData(externalData);
      console.log('[GeoHeatmapMap] parsed result:', parsed ? { timestamps: parsed.timestamps.length, stations: parsed.stationValues.length, range: parsed.range } : null);
      if (parsed) {
        // Store ref first so rAF loop never reads stale values
        temporalStationValues.current = parsed.stationValues;

        // Update all React state — this is what renders the slider panel
        setTemporalTimestamps(parsed.timestamps);
        setTemporalRange(parsed.range);
        setTemporalUnit(parsed.unit);
        setTimeProgress(0);
        setIsPlaying(false);

        // Update the colour ramp to match the actual data range
        const [lo, hi] = parsed.range;
        const mid = lo + (hi - lo) * 0.5;
        const q1  = lo + (hi - lo) * 0.25;
        const q3  = lo + (hi - lo) * 0.75;
        const colorRamp: mapboxgl.Expression = [
          'interpolate', ['linear'], ['get', 'value'],
          lo, '#2166ac',
          q1, '#67a9cf',
          mid, '#f7f7f7',
          q3, '#ef8a62',
          hi, '#b2182b',
        ];
        if (map.current.getLayer('temporal-glow'))
          map.current.setPaintProperty('temporal-glow', 'circle-color', colorRamp);
        if (map.current.getLayer('temporal-points'))
          map.current.setPaintProperty('temporal-points', 'circle-color', colorRamp);

        // Build initial GeoJSON at t = 0
        const geoJson = buildTemporalGeoJson(
          externalData, parsed.timestamps, parsed.stationValues, 0,
        );
        const src = map.current.getSource('temporal-geodata') as mapboxgl.GeoJSONSource | undefined;
        if (src) src.setData(geoJson);

        // Hide default layers, show temporal layers
        for (const id of ['geodata-heat', 'geodata-clusters', 'geodata-cluster-count', 'geodata-unclustered']) {
          if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', 'none');
        }
        for (const id of ['temporal-glow', 'temporal-points', 'temporal-labels']) {
          if (map.current.getLayer(id)) map.current.setLayoutProperty(id, 'visibility', 'visible');
        }
      } else {
        console.warn('[GeoHeatmapMap] parseTemporalData returned null — check series shape');
      }
    } else {
      // ── Default (heatmap / cluster) mode ────────────────────────────
      for (const id of ['geodata-heat', 'geodata-clusters', 'geodata-cluster-count', 'geodata-unclustered']) {
        if (map.current!.getLayer(id)) map.current!.setLayoutProperty(id, 'visibility', 'visible');
      }
      for (const id of ['temporal-glow', 'temporal-points', 'temporal-labels']) {
        if (map.current!.getLayer(id)) map.current!.setLayoutProperty(id, 'visibility', 'none');
      }

      const geoJson = getMapGeoJson(externalData);
      const source = map.current.getSource('geodata') as mapboxgl.GeoJSONSource;
      source.setData(geoJson);
    }

    // Fly to the data centre if provided
    const mapData = externalData.data as MapData;
    if (mapData.center) {
      map.current.flyTo({
        center: [mapData.center.lon, mapData.center.lat],
        essential: true,
      });
    }

    setLastUpdated(new Date());
    setError(null);
  }, [externalData, getMapGeoJson, parseTemporalData, buildTemporalGeoJson]);

  // ── Update temporal source whenever timeProgress changes ─────────────────
  useEffect(() => {
    if (
      !isTemporalMode ||
      !map.current ||
      !externalData ||
      temporalTimestamps.length === 0
    )
      return;

    const geoJson = buildTemporalGeoJson(
      externalData,
      temporalTimestamps,
      temporalStationValues.current,
      timeProgress,
    );
    const src = map.current.getSource('temporal-geodata') as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (src) src.setData(geoJson);
  }, [timeProgress, isTemporalMode, externalData, temporalTimestamps, buildTemporalGeoJson]);

  // ── Play / pause animation loop ──────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || temporalTimestamps.length < 2) return;

    let last = performance.now();
    const speed = 3; // time-steps per second

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTimeProgress((prev) => {
        const next = prev + dt * speed;
        if (next >= temporalTimestamps.length - 1) {
          setIsPlaying(false);
          return temporalTimestamps.length - 1;
        }
        return next;
      });
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, temporalTimestamps.length]);

  const getModeLabel = (mode: VisualizationMode['mode']) => {
    switch (mode) {
      case 'heatmap':
        return 'Heatmap View';
      case 'clusters':
        return 'Cluster View';
      case 'points':
        return 'Individual Points';
    }
  };

  const getModeDescription = (mode: VisualizationMode['mode']) => {
    switch (mode) {
      case 'heatmap':
        return 'Zoom < 12';
      case 'clusters':
        return 'Zoom 12-15';
      case 'points':
        return 'Zoom ≥ 15';
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* ── Map area ──────────────────────────────────────────────────── */}
      <div className="relative flex-1 min-h-0">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
            <div className="bg-white rounded-lg p-6 shadow-xl">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="text-lg font-medium text-gray-900">Loading map...</span>
              </div>
            </div>
          </div>
        )}

        {/* Error notification */}
        {error && !loading && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-20 max-w-md">
            <p className="font-medium">⚠️ Error loading data</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Legend — default (heatmap / clusters / points) */}
        {!loading && !isTemporalMode && (
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-10 min-w-[240px]">
            <div className="space-y-3">
              <div className="border-b pb-3">
                <h3 className="font-bold text-gray-900 text-sm mb-2">Current View</h3>
                <div className="flex items-center justify-between">
                  <span className="text-blue-600 font-semibold">{getModeLabel(visualizationMode.mode)}</span>
                  <span className="text-xs text-gray-500">z: {visualizationMode.zoom}</span>
                </div>
                <p className="text-xs text-gray-600 mt-1">{getModeDescription(visualizationMode.mode)}</p>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-gray-900 text-xs uppercase tracking-wide">Zoom Levels</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-blue-500 to-red-500"></div>
                    <span className="text-gray-700">Heatmap (low zoom)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-[#51bbd6]"></div>
                    <span className="text-gray-700">Clusters (mid zoom)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-[#11b4da]"></div>
                    <span className="text-gray-700">Points (high zoom)</span>
                  </div>
                </div>
              </div>

              {lastUpdated && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-gray-500">
                    <span className="font-medium">Last updated:</span>
                    <br />
                    {lastUpdated.toLocaleTimeString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Legend — temporal mode */}
        {!loading && isTemporalMode && temporalTimestamps.length > 0 && (
          <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur rounded-lg shadow-lg p-4 z-10 min-w-[200px] text-white">
            <div className="space-y-2">
              <h3 className="font-bold text-sm">🕒 Temporal View</h3>
              <p className="text-xs text-slate-300">
                {temporalTimestamps.length} time steps &middot;{' '}
                {(externalData?.data as MapData | undefined)?.features_count ?? '–'} stations
              </p>
              <div
                className="w-full h-2 rounded-full"
                style={{
                  background:
                    'linear-gradient(to right,#2166ac,#67a9cf,#fddbc7,#ef8a62,#b2182b)',
                }}
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{temporalRange[0].toFixed(1)} {temporalUnit}</span>
                <span>{temporalRange[1].toFixed(1)} {temporalUnit}</span>
              </div>
              {lastUpdated && (
                <div className="pt-2 border-t border-slate-700">
                  <p className="text-[10px] text-slate-400">
                    Updated: {lastUpdated.toLocaleTimeString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Temporal time slider ─────────────────────────────────────── */}
      {isTemporalMode && temporalTimestamps.length > 0 && (
        <div className="flex-shrink-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700 px-5 py-3 space-y-2">
          {/* Header row: play button · current time · colour legend */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (timeProgress >= temporalTimestamps.length - 1)
                  setTimeProgress(0);
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
                const idx = Math.min(
                  Math.round(timeProgress),
                  temporalTimestamps.length - 1,
                );
                return new Date(temporalTimestamps[idx]).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });
              })()}
            </span>

            <div className="flex items-center gap-2 ml-auto text-xs text-slate-300">
              <span>{temporalRange[0].toFixed(1)} {temporalUnit}</span>
              <div
                className="w-28 h-2 rounded-full"
                style={{
                  background:
                    'linear-gradient(to right,#2166ac,#67a9cf,#fddbc7,#ef8a62,#b2182b)',
                }}
              />
              <span>{temporalRange[1].toFixed(1)} {temporalUnit}</span>
            </div>
          </div>

          {/* Slider */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-400 font-mono min-w-[48px]">
              {new Date(temporalTimestamps[0]).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <input
              type="range"
              min={0}
              max={temporalTimestamps.length - 1}
              step={0.05}
              value={timeProgress}
              onChange={(e) => {
                setIsPlaying(false);
                setTimeProgress(parseFloat(e.target.value));
              }}
              className="flex-1 h-1.5 accent-blue-500 cursor-pointer"
            />
            <span className="text-[10px] text-slate-400 font-mono min-w-[48px] text-right">
              {new Date(
                temporalTimestamps[temporalTimestamps.length - 1],
              ).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
