'use client';

import { useState, useCallback, useRef } from 'react';
import { MapPin } from 'lucide-react';
import ChatPanel from '@/components/ChatPanel';
import GeoHeatmapMap from '@/components/GeoHeatmapMap';
import CameraMap from '@/components/camera/CameraMap';
import CorridorMap from '@/components/camera/CorridorMap';
import CameraDetail from '@/components/camera/CameraDetail';
import AlertsPanel from '@/components/camera/AlertsPanel';
import type { ChatResponse, ZoneGeometryData, CameraArtifactData } from '@/types/api';
import { getTaxiData } from '@/types/api';
import type { CameraItem } from '@/types/camera';

const JAVA_BACKEND_URL = process.env.NEXT_PUBLIC_JAVA_BACKEND_URL || 'http://localhost:8080/api/v1';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000/api/v1/chat';
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export default function DashboardPage() {
  // 1. State
  const [layers, setLayers] = useState<Record<string, ChatResponse>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [zoneGeometries, setZoneGeometries] = useState<Record<string, ZoneGeometryData>>({});
  const [selectedCamera, setSelectedCamera] = useState<CameraItem | null>(null);
  const layerCounter = useRef(0);

  // 2. Side effects (data fetching)
  // Zone geometry is fetched reactively inside handleDataReceived when a taxi
  // response includes a zone context — no useEffect needed here.

  // 3. Event handlers
  const handleDataReceived = useCallback((response: ChatResponse) => {
    const layerId = `layer-${++layerCounter.current}`;
    setLayers(prev => ({ ...prev, [layerId]: response }));
    setVisibility(prev => (layerId in prev ? prev : { ...prev, [layerId]: true }));

    const artifact = response.artifacts?.[0];

    if (artifact?.type === 'traffic_cameras') {
      const cameraData = artifact.data as CameraArtifactData;
      const cameras = cameraData.cameras as CameraItem[];
      if ((cameraData.view_type === 'camera_detail' || cameraData.view_type === 'snapshot') && cameras.length > 0) {
        setSelectedCamera(cameras[0]);
      } else {
        setSelectedCamera(null);
      }
    }

    if (artifact?.type === 'taxi_data') {
      const taxiData = getTaxiData(response);
      const ctx = (taxiData?.type === 'spatial_query' || taxiData?.type === 'timeline') ? taxiData.context : null;
      if (ctx?.type === 'zone' && ctx.zone_name) {
        fetch(`${JAVA_BACKEND_URL}/zones/${encodeURIComponent(ctx.zone_name)}/geometry`)
          .then(res => { if (res.ok) return res.json(); throw new Error(`${res.status}`); })
          .then((envelope: { success: boolean; data: ZoneGeometryData }) => {
            if (envelope.success && envelope.data) {
              setZoneGeometries(prev => ({ ...prev, [layerId]: envelope.data }));
            }
          })
          .catch(err => console.warn(`Failed to fetch zone geometry for "${ctx.zone_name}":`, err));
      }
    }
  }, []);

  const handleToggle = useCallback((layerId: string) => {
    setVisibility(prev => ({ ...prev, [layerId]: !prev[layerId] }));
  }, []);

  const handleRemove = useCallback((layerId: string) => {
    setLayers(prev => { const next = { ...prev }; delete next[layerId]; return next; });
    setVisibility(prev => { const next = { ...prev }; delete next[layerId]; return next; });
    setZoneGeometries(prev => { const next = { ...prev }; delete next[layerId]; return next; });
  }, []);

  const handleCameraClick = useCallback((camera: CameraItem) => {
    setSelectedCamera(camera);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedCamera(null);
  }, []);

  // 4. Render UI
  if (!MAPBOX_TOKEN) {
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

  const hasLayers = Object.keys(layers).length > 0;
  const layerEntries = Object.entries(layers);
  const latestResponse = layerEntries[layerEntries.length - 1]?.[1];
  const latestArtifact = latestResponse?.artifacts?.[0];
  const latestArtifactType = latestArtifact?.type;

  const taxiData = latestResponse ? getTaxiData(latestResponse) : null;
  const latestCtx = (taxiData?.type === 'spatial_query' || taxiData?.type === 'timeline') ? taxiData.context : null;
  const contextLabel = latestCtx?.zone_name ?? latestCtx?.road_name ?? taxiData?.type
    ?? (latestArtifactType === 'traffic_cameras' ? (latestArtifact?.data as CameraArtifactData)?.view_type : null)
    ?? 'area';
  const latestTaxiCount = taxiData?.type === 'spatial_query' ? taxiData.taxi_count : null;

  const renderCameraPanel = () => {
    const cameraData = latestArtifact?.data as CameraArtifactData | undefined;
    const cameras = (cameraData?.cameras ?? []) as CameraItem[];
    const viewType = cameraData?.view_type;

    if (viewType === 'alerts') {
      return <AlertsPanel cameras={cameras} onCameraClick={handleCameraClick} />;
    }
    if (viewType === 'corridor') {
      return (
        <>
          <CorridorMap
            mapboxToken={MAPBOX_TOKEN}
            cameras={cameras}
            selectedCamera={selectedCamera}
            onCameraClick={handleCameraClick}
          />
          {selectedCamera && (
            <CameraDetail
              camera={selectedCamera}
              nearbyCameras={cameras.filter(c => c.cameraId !== selectedCamera.cameraId)}
              onClose={handleCloseDetail}
              onCameraClick={handleCameraClick}
            />
          )}
        </>
      );
    }
    return (
      <>
        <CameraMap
          mapboxToken={MAPBOX_TOKEN}
          cameras={cameras}
          selectedCamera={selectedCamera}
          onCameraClick={handleCameraClick}
        />
        {selectedCamera && (
          <CameraDetail
            camera={selectedCamera}
            isHistorical={viewType === 'snapshot'}
            nearbyCameras={cameras.filter(c => c.cameraId !== selectedCamera.cameraId)}
            onClose={handleCloseDetail}
            onCameraClick={handleCameraClick}
          />
        )}
      </>
    );
  };

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-slate-100">
      {/* Left Panel — Chat */}
      <div className="w-[400px] flex-shrink-0 border-r border-slate-200 shadow-lg">
        <ChatPanel
          onDataReceived={handleDataReceived}
          backendUrl={BACKEND_URL}
        />
      </div>

      {/* Right Panel — Map */}
      <div className="flex-1 relative overflow-hidden">
        {!hasLayers ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-3 select-none">
            <MapPin className="w-12 h-12 opacity-30" />
            <p className="text-sm">Ask a question to see data on the map</p>
          </div>
        ) : latestArtifactType === 'traffic_cameras' ? (
          renderCameraPanel()
        ) : (
          <GeoHeatmapMap
            mapboxToken={MAPBOX_TOKEN}
            javaBackendUrl={JAVA_BACKEND_URL}
            layers={layers}
            visibility={visibility}
            zoneGeometries={zoneGeometries}
            onToggle={handleToggle}
            onRemove={handleRemove}
          />
        )}

        {/* Live-data badge */}
        {hasLayers && (
          <div className="absolute top-4 left-4 bg-white/95 backdrop-blur rounded-lg shadow-lg px-4 py-2 z-10 pointer-events-none">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-slate-700">
                {latestTaxiCount !== null ? `${latestTaxiCount} taxis · ` : ''}{contextLabel}
              </span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
