// ────────────────────────────────────────────────────────────────────────────
// Camera API types matching the backend contract (docs/traffic-camera-ui-design.md)
// ────────────────────────────────────────────────────────────────────────────

export type CameraViewType = 'camera_map' | 'corridor' | 'camera_detail' | 'snapshot' | 'alerts';

export type CongestionLevel = 'free_flow' | 'light' | 'moderate' | 'heavy' | 'standstill';

export type VehicleDensity = 'sparse' | 'light' | 'moderate' | 'dense' | 'packed';

export type IncidentType = 'none' | 'stalled_vehicle' | 'accident' | 'possible_incident' | 'roadwork' | 'flooding';

export type WeatherCondition = 'clear' | 'cloudy' | 'rain' | 'heavy_rain' | 'foggy';

export type RoadSurface = 'dry' | 'wet' | 'flooded';

export interface CameraAnalysis {
  congestion: CongestionLevel;
  vehicle_density: VehicleDensity;
  incidents: IncidentType;
  weather: WeatherCondition;
  road_surface: RoadSurface;
  summary: string;
}

export interface CameraItem {
  cameraId: number;
  locationName: string | null;
  latitude: number;
  longitude: number;
  latestImage: string;
  timestamp: string;
  resolution: string;
  analysis: CameraAnalysis | null;
}

export interface CameraResponse {
  answer: string;
  view_type: CameraViewType;
  cameras: CameraItem[];
}
