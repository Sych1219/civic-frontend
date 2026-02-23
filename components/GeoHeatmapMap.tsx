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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>({
    mode: 'heatmap',
    zoom: 11
  });

  // Extract the GeoJSON FeatureCollection directly from an ApiResponse
  const getMapGeoJson = useCallback((data: ApiResponse): GeoJSON.FeatureCollection => {
    return (data.data as MapData).geojson;
  }, []);

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
          // Increase weight for higher density
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'point_count'],
            0, 0,
            6, 1
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
          // Adjust radius by zoom level
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0, 2,
            12, 20
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
        const properties = e.features[0].properties || {};

        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
          coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        const propRows = Object.entries(properties)
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
              <h3 style="margin:0 0 8px 0;font-weight:bold;font-size:13px;">Station Details</h3>
              <table style="border-collapse:collapse;">${propRows || '<tr><td style="font-size:11px;color:#999;">No properties</td></tr>'}</table>
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
    if (externalData && map.current && map.current.getSource('geodata')) {
      const geoJson = getMapGeoJson(externalData);
      const source = map.current.getSource('geodata') as mapboxgl.GeoJSONSource;
      source.setData(geoJson);

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
    }
  }, [externalData, getMapGeoJson]);

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
    <div className="relative w-full h-full">
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

      {/* Legend and info panel */}
      {!loading && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-10 min-w-[240px]">
          <div className="space-y-3">
            {/* Current mode */}
            <div className="border-b pb-3">
              <h3 className="font-bold text-gray-900 text-sm mb-2">Current View</h3>
              <div className="flex items-center justify-between">
                <span className="text-blue-600 font-semibold">{getModeLabel(visualizationMode.mode)}</span>
                <span className="text-xs text-gray-500">z: {visualizationMode.zoom}</span>
              </div>
              <p className="text-xs text-gray-600 mt-1">{getModeDescription(visualizationMode.mode)}</p>
            </div>

            {/* Visualization modes legend */}
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

            {/* Last updated */}
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
    </div>
  );
}
