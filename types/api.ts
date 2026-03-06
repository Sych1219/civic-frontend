// ────────────────────────────────────────────────────────────────────────────
// API response types matching the backend contract (docs/apis-data-contract.md)
// ────────────────────────────────────────────────────────────────────────────

// ── Taxi data ────────────────────────────────────────────────────────────────

export interface TaxiData {
  zone: string;
  locations: GeoJSON.FeatureCollection;
  taxi_count: number;
  snapshot_time: string;
}

// ── Top-level response ───────────────────────────────────────────────────────

export interface ApiResponse {
  answer: string;
  data: TaxiData | null;
  metadata: {
    execution_time_ms: number;
  };
}

// ── Map visualisation modes (used by GeoHeatmapMap) ─────────────────────────

export interface VisualizationMode {
  mode: 'heatmap' | 'clusters' | 'points';
  zoom: number;
}
