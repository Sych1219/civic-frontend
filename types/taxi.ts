export interface TaxiDataResponse {
  status: string;
  data: {
    geojson: GeoJSON.FeatureCollection<GeoJSON.MultiPoint>;
    bounds: any;
    center: {
      lat: number;
      lon: number;
    };
    features_count: number;
  };
  visualization_type: string;
  metadata: {
    timestamp: string;
    endpoint_id: string;
  };
  error: any;
}

export interface TaxiFeatureProperties {
  timestamp?: string;
  taxi_count?: number;
  api_info?: any;
}

export interface VisualizationMode {
  mode: 'heatmap' | 'clusters' | 'points';
  zoom: number;
}
