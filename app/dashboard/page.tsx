'use client';

import { useState, useCallback, useRef } from 'react';
import { MapPin, ArrowLeft } from 'lucide-react';
import ChatPanel from '@/components/ChatPanel';
import GeoHeatmapMap from '@/components/GeoHeatmapMap';
import LayerToggle from '@/components/LayerToggle';
import CameraMap from '@/components/camera/CameraMap';
import CorridorMap from '@/components/camera/CorridorMap';
import CameraDetail from '@/components/camera/CameraDetail';
import AlertsPanel from '@/components/camera/AlertsPanel';
import type { ChatResponse, ZoneGeometryData, CameraArtifactData } from '@/types/api';
import { getTaxiData } from '@/types/api';
import { CONGESTION_LABEL, type CameraItem } from '@/types/camera';

const JAVA_BACKEND_URL = process.env.NEXT_PUBLIC_JAVA_BACKEND_URL || 'http://localhost:8080/api/v1';
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000/api/v1/chat';
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

// ── Dedup helpers ──────────────────────────────────────────────────────────────

function artifactHash(artifact: import('@/types/api').Artifact | undefined): string {
  if (!artifact) return 'empty';
  const str = JSON.stringify(artifact.data);
  return `${artifact.type}:${str.length}:${str.slice(0, 80)}:${str.slice(-80)}`;
}

function getArtifactKey(artifact: import('@/types/api').Artifact | undefined): string | null {
  if (!artifact) return null;
  if (artifact.type === 'taxi_data') {
    const raw = (artifact.data as import('@/types/api').TaxiArtifactData).raw;
    if (!raw || raw.type === 'zone_geometry') return null;
    const ctx = raw.context;
    const contextKey = ctx?.zone_name ?? ctx?.road_name ?? ctx?.type ?? 'unknown';
    return `taxi:${raw.type}:${contextKey}`;
  }
  if (artifact.type === 'traffic_cameras') {
    const data = artifact.data as CameraArtifactData;
    return `camera:${data.view_type}`;
  }
  return null;
}

export default function DashboardPage() {
  // 1. State
  const [layers, setLayers] = useState<Record<string, ChatResponse>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [zoneGeometries, setZoneGeometries] = useState<Record<string, ZoneGeometryData>>({});
  const [selectedCamera, setSelectedCamera] = useState<CameraItem>();
  const [leftWidth, setLeftWidth] = useState(400);
  const layerCounter = useRef(0);
  const layerHashesRef = useRef<Map<string, string>>(new Map());
  const layerKeysRef = useRef<Map<string, string>>(new Map());
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = leftWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientX - dragStartX.current;
      const next = Math.max(260, Math.min(window.innerWidth - 320, dragStartWidth.current + delta));
      setLeftWidth(next);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [leftWidth]);

  // 2. Side effects (data fetching)
  // Zone geometry is fetched reactively inside handleDataReceived when a taxi
  // response includes a zone context — no useEffect needed here.

  // 3. Event handlers
  const handleDataReceived = useCallback((response: ChatResponse) => {
    // Each artifact becomes its own map layer so multiple domains render independently.
    const artifacts = response.artifacts?.length > 0 ? response.artifacts : [undefined];

    artifacts.forEach((artifact) => {
      const hash = artifactHash(artifact);
      const semanticKey = getArtifactKey(artifact);

      // Skip exact duplicates — same content already on the map
      if ([...layerHashesRef.current.values()].includes(hash)) return;

      // Find existing layer with the same semantic key to replace
      let existingLayerId: string | null = null;
      if (semanticKey) {
        for (const [id, key] of layerKeysRef.current) {
          if (key === semanticKey) { existingLayerId = id; break; }
        }
      }

      const layerId = existingLayerId ?? `layer-${++layerCounter.current}`;
      const layerResponse: ChatResponse = {
        answer: response.answer,
        artifacts: artifact ? [artifact] : [],
      };

      setLayers(prev => ({ ...prev, [layerId]: layerResponse }));
      if (!existingLayerId) setVisibility(prev => ({ ...prev, [layerId]: true }));

      layerHashesRef.current.set(layerId, hash);
      if (semanticKey) layerKeysRef.current.set(layerId, semanticKey);

      if (artifact?.type === 'traffic_cameras') {
        const cameraData = artifact.data as CameraArtifactData;
        const cameras = cameraData.cameras as CameraItem[];
        if ((cameraData.view_type === 'camera_detail' || cameraData.view_type === 'snapshot') && cameras.length > 0) {
          setSelectedCamera(cameras[0]);
        } else {
          setSelectedCamera(undefined);
        }
      }

      if (artifact?.type === 'taxi_data') {
        const taxiData = getTaxiData(layerResponse);
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
    });
  }, []);

  const handleToggle = useCallback((layerId: string) => {
    setVisibility(prev => ({ ...prev, [layerId]: !prev[layerId] }));
  }, []);

  const handleRemove = useCallback((layerId: string) => {
    setLayers(prev => { const next = { ...prev }; delete next[layerId]; return next; });
    setVisibility(prev => { const next = { ...prev }; delete next[layerId]; return next; });
    setZoneGeometries(prev => { const next = { ...prev }; delete next[layerId]; return next; });
    layerHashesRef.current.delete(layerId);
    layerKeysRef.current.delete(layerId);
  }, []);

  const handleCameraClick = useCallback((camera: CameraItem) => {
    setSelectedCamera(camera);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedCamera(undefined);
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

  const hasTaxiLayers = layerEntries.some(([, r]) => r.artifacts[0]?.type === 'taxi_data');
  const hasCameraLayers = layerEntries.some(([, r]) => r.artifacts[0]?.type === 'traffic_cameras');

  const visibleCameraItems = layerEntries
    .filter(([id, r]) => visibility[id] !== false && r.artifacts[0]?.type === 'traffic_cameras')
    .flatMap(([, r]) => ((r.artifacts[0]?.data as CameraArtifactData)?.cameras ?? []) as import('@/types/camera').CameraItem[]);

  // Latest response of each type for badges and context labels
  const latestCameraEntry = [...layerEntries].reverse().find(([, r]) => r.artifacts[0]?.type === 'traffic_cameras');
  const latestCameraArtifact = latestCameraEntry?.[1]?.artifacts?.[0];
  const latestTaxiEntry = [...layerEntries].reverse().find(([, r]) => r.artifacts[0]?.type === 'taxi_data');
  const latestTaxiResponse = latestTaxiEntry?.[1];

  const taxiData = latestTaxiResponse ? getTaxiData(latestTaxiResponse) : null;
  const latestCtx = (taxiData?.type === 'spatial_query' || taxiData?.type === 'timeline') ? taxiData.context : null;
  const contextLabel = latestCtx?.zone_name ?? latestCtx?.road_name ?? taxiData?.type
    ?? (latestCameraArtifact ? (latestCameraArtifact.data as CameraArtifactData)?.view_type : null)
    ?? 'area';
  const latestTaxiCount = taxiData?.type === 'spatial_query' ? taxiData.taxi_count : null;

  const renderCameraPanel = (artifact = latestCameraArtifact) => {
    const cameraData = artifact?.data as CameraArtifactData | undefined;
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
      <div className="flex-shrink-0 border-r border-slate-200 shadow-lg" style={{ width: leftWidth }}>
        <ChatPanel
          onDataReceived={handleDataReceived}
          backendUrl={BACKEND_URL}
        />
      </div>

      {/* Draggable Divider */}
      <div
        onMouseDown={handleDividerMouseDown}
        className="relative w-1 flex-shrink-0 bg-slate-200 hover:bg-blue-400 active:bg-blue-500 cursor-col-resize transition-colors z-20 group"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-10 bg-slate-300 group-hover:bg-blue-400 rounded-full flex flex-col items-center justify-center gap-1 transition-colors pointer-events-none">
          <div className="w-px h-3 bg-white/70 rounded-full" />
          <div className="w-px h-3 bg-white/70 rounded-full" />
        </div>
      </div>

      {/* Right Panel — Map */}
      <div className="flex-1 relative overflow-hidden">
        {!hasLayers ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-5 select-none px-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
              <MapPin className="w-8 h-8 text-slate-300" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-medium text-slate-500">Your map is ready</p>
              <p className="text-sm text-slate-400">Ask a question on the left to see live data appear here</p>
            </div>
            <div className="flex flex-col gap-2 text-xs text-slate-400 w-full max-w-xs">
              {['How many taxis in Orchard?', 'Is CTE congested right now?', 'Show cameras near Bugis'].map(ex => (
                <div key={ex} className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                  <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0 text-blue-300" />
                  <span>{ex}</span>
                </div>
              ))}
            </div>
          </div>
        ) : hasCameraLayers && !hasTaxiLayers ? (
          <>
            {renderCameraPanel()}
            <LayerToggle
              layers={layers}
              visibility={visibility}
              onToggle={handleToggle}
              onRemove={handleRemove}
            />
          </>
        ) : hasTaxiLayers ? (
          <div className="flex h-full">
            <div className="flex-1 relative overflow-hidden">
              <GeoHeatmapMap
                mapboxToken={MAPBOX_TOKEN}
                javaBackendUrl={JAVA_BACKEND_URL}
                layers={layers}
                visibility={visibility}
                zoneGeometries={zoneGeometries}
                onToggle={handleToggle}
                onRemove={handleRemove}
                cameraItems={visibleCameraItems}
                selectedCamera={selectedCamera ?? null}
                onCameraClick={handleCameraClick}
              />
              {selectedCamera && visibleCameraItems.some(c => c.cameraId === selectedCamera.cameraId) && (
                <CameraDetail
                  camera={selectedCamera}
                  nearbyCameras={visibleCameraItems.filter(c => c.cameraId !== selectedCamera.cameraId)}
                  onClose={handleCloseDetail}
                  onCameraClick={handleCameraClick}
                />
              )}
            </div>
            {visibleCameraItems.length > 0 && !selectedCamera && (
              <div className="w-64 flex-shrink-0 bg-slate-900 border-l border-slate-700 overflow-y-auto">
                <p className="sticky top-0 bg-slate-900 text-xs font-semibold text-slate-400 uppercase tracking-widest px-4 py-3 border-b border-slate-700">
                  Traffic Cameras ({visibleCameraItems.length})
                </p>
                <div className="p-2 space-y-1">
                  {visibleCameraItems.map(cam => (
                    <button
                      key={cam.cameraId}
                      onClick={() => handleCameraClick(cam)}
                      className="w-full flex items-center gap-2 p-2 hover:bg-slate-800 rounded-lg text-left transition-colors"
                    >
                      {cam.latestImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cam.latestImage} alt="" className="w-16 h-10 object-cover rounded flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-200 truncate">{cam.locationName}</p>
                        <p className="text-xs text-slate-500">
                          {cam.analysis ? CONGESTION_LABEL[cam.analysis.congestion] : 'No data'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          renderCameraPanel()
        )}

        {/* Live-data badge */}
        {hasLayers && (
          <div className="absolute top-4 right-4 bg-white/95 backdrop-blur rounded-lg shadow-lg px-4 py-2 z-10 pointer-events-none">
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
