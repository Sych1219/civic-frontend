// ────────────────────────────────────────────────────────────────────────────
// API response types matching the backend contract (docs/apis-data-contract.md)
// ────────────────────────────────────────────────────────────────────────────

// ── Context Union ─────────────────────────────────────────────────────────────

export interface TaxiQueryContext {
  type: 'radius' | 'nearest' | 'zone' | 'polygon' | 'road' | 'route';
  lat?: number;
  lon?: number;
  radius_m?: number;
  limit?: number;
  zone_name?: string;
  category?: string;
  buffer_m?: number;
  road_name?: string;
  polygon?: object;
  route?: object;
}

// ── Snapshot (timeline metadata only — no geometry) ──────────────────────────

export interface SnapshotEntry {
  snapshot_id: number;
  timestamp: string;
  taxi_count: number;
}

// ── Data Union (tagged) ───────────────────────────────────────────────────────

export interface SpatialQueryData {
  type: 'spatial_query';
  taxi_count: number;
  snapshot_time: string;
  context: TaxiQueryContext | null;
  locations: GeoJSON.FeatureCollection;
}

export interface TimelineData {
  type: 'timeline';
  from_time: string;
  to_time: string;
  context: TaxiQueryContext | null;
  window_minutes?: number;
  snapshots: SnapshotEntry[];
}

// ── Zone geometry (boundary overlay) ─────────────────────────────────────────

export interface ZoneGeometryData {
  type: 'zone_geometry';
  name: string;
  category: 'district' | 'road' | 'highway';
  geometry: GeoJSON.Polygon | GeoJSON.LineString;
}

// ── Top-level response ───────────────────────────────────────────────────────

export interface ApiResponse {
  answer: string;
  data: SpatialQueryData | TimelineData | ZoneGeometryData | null;
  metadata: {
    execution_time_ms: number;
  };
  layer_id?: string;
  layer_label?: string;
}

// ── Map visualisation modes (used by GeoHeatmapMap) ─────────────────────────

export interface VisualizationMode {
  mode: 'heatmap' | 'clusters' | 'points';
  zoom: number;
}
