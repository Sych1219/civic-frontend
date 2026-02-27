// ────────────────────────────────────────────────────────────────────────────
// API response types matching the backend contract (docs/apis-data-contract.md)
// ────────────────────────────────────────────────────────────────────────────

export type VisualizationType = 'map' | 'map_temporal' | 'time_series' | 'generic' | 'error';

// ── Chart types ──────────────────────────────────────────────────────────────

export interface ChartConfig {
  type: 'line' | 'bar' | 'scatter' | string;
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

// ── Time-series / generic response data ─────────────────────────────────────

export interface TimeSeriesData {
  records: Record<string, unknown>[];
  summary_stats: Record<string, SummaryStats>;
  chart_configs: ChartConfig[];
  columns: string[];
}

// ── Map / GeoJSON response data ──────────────────────────────────────────────

export interface TemporalDataPoint {
  time: string;
  value: number;
  attribute: string;
}

export interface TemporalData {
  series: TemporalDataPoint[];
  unit: string;
}

export interface MapData {
  geojson: GeoJSON.FeatureCollection;
  bounds: [[number, number], [number, number]];
  center: { lat: number; lon: number };
  features_count: number;
  property_type?: 'temporal' | 'static';
  temporal?: TemporalData;
}

// ── Data context (matched endpoint metadata) ────────────────────────────────

export interface DataContext {
  endpoint_id: string;
  endpoint_description: string;
  confidence: number;
  triggered_at: string;
}

// ── Top-level response ───────────────────────────────────────────────────────

export interface ApiResponse {
  status: 'success' | 'error';
  /** MapData for map/map_temporal; TimeSeriesData for time_series/generic; {} on error */
  data: MapData | TimeSeriesData | Record<string, never>;
  visualization_type: VisualizationType;
  error: string | null;
  /** Stable machine identifier for the layer, e.g. "temperature", "taxi", "pm25" */
  layer_id?: string | null;
  /** Human-readable name shown in the LayerToggle panel, e.g. "Air Temperature" */
  layer_label?: string | null;
  /** LLM-generated plain-English summary; an LLM apology when status is "error". Always present. */
  content: string;
  /** Echoed or newly created session UUID. Always present. */
  session_id: string;
  /** Server-generated UUID v4 for this response turn. Always present. */
  message_id: string;
  /** API call metadata; null when status is "error". */
  data_context: DataContext | null;
}

// ── Map visualisation modes (used by GeoHeatmapMap) ─────────────────────────

export interface VisualizationMode {
  mode: 'heatmap' | 'clusters' | 'points';
  zoom: number;
}
