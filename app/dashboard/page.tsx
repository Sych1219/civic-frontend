'use client';

import { useState } from 'react';
import { BarChart2, MapPin, AlertCircle } from 'lucide-react';
import ChatPanel from '@/components/ChatPanel';
import GeoHeatmapMap from '@/components/GeoHeatmapMap';
import ChartPanel from '@/components/ChartPanel';
import type { ApiResponse, MapData, TimeSeriesData } from '@/types/api';

export default function DashboardPage() {
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

  const handleDataReceived = (data: ApiResponse) => {
    setApiResponse(data);
  };

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
          <div className="flex items-center space-x-3 mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h1 className="text-xl font-bold text-gray-900">Configuration Error</h1>
          </div>
          <p className="text-gray-700 mb-4">
            Mapbox token is not configured. Please add your Mapbox access token to continue.
          </p>
          <div className="bg-gray-50 rounded p-4 text-sm">
            <p className="font-mono text-xs mb-2">Create <strong>.env.local</strong> file:</p>
            <pre className="bg-gray-900 text-green-400 p-3 rounded overflow-x-auto">
              NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // ── Visualisation panel ───────────────────────────────────────────────────

  const renderVisualization = () => {
    // No response yet — show a placeholder
    if (!apiResponse) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3 select-none">
          <BarChart2 className="w-12 h-12 opacity-30" />
          <p className="text-sm">Ask a question to see the visualisation here</p>
          <p className="text-xs opacity-60">Supports maps, charts, and more</p>
        </div>
      );
    }

    // Error state
    if (apiResponse.status === 'error' || apiResponse.visualization_type === 'error') {
      return (
        <div className="flex flex-col items-center justify-center h-full text-red-400 space-y-3 px-8">
          <AlertCircle className="w-10 h-10 opacity-60" />
          <p className="text-sm font-medium text-center">{apiResponse.error ?? 'An unknown error occurred.'}</p>
        </div>
      );
    }

    // Map visualisation (map | map_temporal)
    if (
      apiResponse.visualization_type === 'map' ||
      apiResponse.visualization_type === 'map_temporal'
    ) {
      return (
        <GeoHeatmapMap
          mapboxToken={mapboxToken}
          externalData={apiResponse}
        />
      );
    }

    // Chart visualisation (time_series | generic)
    if (
      apiResponse.visualization_type === 'time_series' ||
      apiResponse.visualization_type === 'generic'
    ) {
      return <ChartPanel data={apiResponse.data as TimeSeriesData} />;
    }

    return null;
  };

  const isMapMode =
    apiResponse?.visualization_type === 'map' ||
    apiResponse?.visualization_type === 'map_temporal';

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-slate-100">
      {/* Left Panel — Chat */}
      <div className="w-[400px] flex-shrink-0 border-r border-slate-200 shadow-lg">
        <ChatPanel
          onDataReceived={handleDataReceived}
          backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000/api/query'}
        />
      </div>

      {/* Right Panel — Visualisation */}
      <div className="flex-1 relative overflow-hidden">
        {renderVisualization()}

        {/* Live-data badge — shown for successful responses */}
        {apiResponse?.status === 'success' && (
          <div className="absolute top-4 left-4 bg-white/95 backdrop-blur rounded-lg shadow-lg px-4 py-2 z-10 pointer-events-none">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-slate-700">Live data from chat</span>
              {isMapMode && (
                <>
                  <span className="text-slate-300">·</span>
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-sm text-slate-600">
                    {(apiResponse.data as MapData).features_count} features
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

