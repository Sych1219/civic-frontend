// ────────────────────────────────────────────────────────────────────────────
// API response types matching the backend contract (docs/apis-data-contract.md)
// ────────────────────────────────────────────────────────────────────────────

// ── Taxi data ────────────────────────────────────────────────────────────────

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

export interface TaxiSnapshot {
  timestamp: string;
  taxi_count: number;
  locations: GeoJSON.FeatureCollection;
}

export interface TaxiData {
  type: 'spatial_query' | 'timeline';
  taxi_count: number;
  snapshot_time: string;
  context: TaxiQueryContext | null;
  locations: GeoJSON.FeatureCollection;
  // timeline-specific fields
  from_time?: string;
  to_time?: string;
  window_minutes?: number;
  snapshots?: TaxiSnapshot[];
}

// Narrowed type for timeline responses — all timeline fields are required
export interface TimelineData {
  type: 'timeline';
  taxi_count: number;
  snapshot_time: string;
  context: TaxiQueryContext | null;
  locations: GeoJSON.FeatureCollection;
  from_time: string;
  to_time: string;
  window_minutes?: number;
  snapshots: TaxiSnapshot[];
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
  data: TaxiData | null;
  metadata: {
    execution_time_ms: number;
    llm_latency_ms: number | null;
  };
  layer_id?: string;
  layer_label?: string;
}

// ── Chart / time-series types (used by ChartPanel) ──────────────────────────

export interface ChartConfig {
  type: 'line' | 'bar' | 'scatter';
  title: string;
  x_axis: string;
  y_axis: string;
  x_label: string;
  y_label: string;
}

export interface SummaryStats {
  mean: number;
  min: number;
  max: number;
  std: number;
}

export interface TimeSeriesData {
  records: Record<string, unknown>[];
  chart_configs: ChartConfig[];
  summary_stats?: { value: SummaryStats };
  columns: string[];
}

// ── Map visualisation modes (used by GeoHeatmapMap) ─────────────────────────

export interface VisualizationMode {
  mode: 'heatmap' | 'clusters' | 'points';
  zoom: number;
}
