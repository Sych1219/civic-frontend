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
  locations: GeoJSON.FeatureCollection | null;
  locations_ref?: string | null;
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

// ── Artifact data shapes ──────────────────────────────────────────────────────

export interface TaxiArtifactData {
  raw: SpatialQueryData | TimelineData | ZoneGeometryData | null;
  locations?: Record<string, GeoJSON.FeatureCollection>;
}

export interface CameraArtifactData {
  view_type: string;
  cameras: unknown[];
}

export interface Artifact {
  type: 'taxi_data' | 'traffic_cameras';
  data: TaxiArtifactData | CameraArtifactData;
}

// ── Unified request / response ────────────────────────────────────────────────

export interface ChatRequest {
  message: string;
  session_id?: string;
  officer_id?: string;
}

export interface ChatResponse {
  answer: string;
  artifacts: Artifact[];
}

// ── Raw Messages types ────────────────────────────────────────────────────────

export type RawMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface RawMessageBlock {
  role: RawMessageRole;
  content: string;
  tool_name?: string;
  tool_call_id?: string;
  is_history?: boolean;
  truncated?: boolean;
}

export interface RawLLMCall {
  phase: 'planner' | 'agent' | 'synthesizer' | 'title';
  agent?: string;
  model: string;
  temperature?: number;
  duration_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  messages: RawMessageBlock[];
  output?: string;
  output_structured?: unknown;
  skipped_reason?: string;
}

export interface RawMessagesPayload {
  calls: RawLLMCall[];
  total_tokens?: number;
  generated_at: string;
}

// ── Feedback types ────────────────────────────────────────────────────────────

export interface MessageFeedback {
  rating: 'up' | 'down';
  comment: string | null;
}

export interface FeedbackRequest {
  rating: 'up' | 'down';
  comment?: string | null;
}

export interface FeedbackResponse {
  ok: boolean;
  hint_generated: boolean;
  experience_written: string | null;
}

// ── SSE event types ───────────────────────────────────────────────────────────

export type SSEEvent =
  | { type: 'tool_start'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_end'; tool: string; output: string }
  | { type: 'token'; content: string }
  | { type: 'new_response' }
  | { type: 'done'; session_id: string; msg_index: number; artifacts: Array<{ type: string; artifact_id?: string }>; answer: string }
  | { type: 'title'; session_id: string; title: string }
  | { type: 'error'; error: string }
  | { type: 'llm_call'; call: RawLLMCall };

// ── Helper — extract taxi data from a ChatResponse ───────────────────────────

export function getTaxiData(r: ChatResponse): SpatialQueryData | TimelineData | ZoneGeometryData | null {
  const a = r.artifacts?.[0];
  if (a?.type !== 'taxi_data') return null;
  const artifactData = a.data as TaxiArtifactData;
  const raw = artifactData.raw;
  if (raw?.type === 'spatial_query' && raw.locations == null && raw.locations_ref) {
    const resolved = artifactData.locations?.[raw.locations_ref];
    if (resolved) return { ...raw, locations: resolved };
  }
  return raw;
}

// ── Map visualisation modes (used by GeoHeatmapMap) ─────────────────────────

export interface VisualizationMode {
  mode: 'heatmap' | 'clusters' | 'points';
  zoom: number;
}
