'use client';

import { useState, useCallback } from 'react';
import CameraChatPanel from '@/components/camera/CameraChatPanel';
import CameraMap from '@/components/camera/CameraMap';
import CorridorMap from '@/components/camera/CorridorMap';
import CameraDetail from '@/components/camera/CameraDetail';
import AlertsPanel from '@/components/camera/AlertsPanel';
import type { CameraResponse, CameraItem } from '@/types/camera';

export default function CamerasPage() {
  const [cameraResponse, setCameraResponse] = useState<CameraResponse | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<CameraItem | null>(null);

  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';
  const backendUrl =
    process.env.NEXT_PUBLIC_CAMERA_BACKEND_URL ?? 'http://localhost:8000/api/traffic-chat';

  const handleDataReceived = useCallback((response: CameraResponse) => {
    setCameraResponse(response);
    // Auto-select first camera when the API directly returns a detail or snapshot view
    if (
      (response.view_type === 'camera_detail' || response.view_type === 'snapshot') &&
      response.cameras.length > 0
    ) {
      setSelectedCamera(response.cameras[0]);
    } else {
      setSelectedCamera(null);
    }
  }, []);

  const handleCameraClick = useCallback((camera: CameraItem) => {
    setSelectedCamera(camera);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedCamera(null);
  }, []);

  if (!mapboxToken) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md">
          <h1 className="text-xl font-bold text-gray-900 mb-4">Configuration Error</h1>
          <p className="text-gray-700 mb-4">
            Mapbox token is not configured. Please add it to your environment.
          </p>
          <pre className="bg-gray-900 text-green-400 p-3 rounded text-xs overflow-x-auto">
            NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here
          </pre>
        </div>
      </div>
    );
  }

  const cameras = cameraResponse?.cameras ?? [];
  const viewType = cameraResponse?.view_type;

  const renderRightPanel = () => {
    // Alerts — full-panel list, no map
    if (viewType === 'alerts') {
      return <AlertsPanel cameras={cameras} onCameraClick={handleCameraClick} />;
    }

    // Corridor — route line + markers + optional detail overlay
    if (viewType === 'corridor') {
      return (
        <>
          <CorridorMap
            mapboxToken={mapboxToken}
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

    // camera_map, camera_detail, snapshot — all use CameraMap as the base
    // (for camera_detail/snapshot the API puts the target camera first; it is auto-selected)
    return (
      <>
        <CameraMap
          mapboxToken={mapboxToken}
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
        <CameraChatPanel onDataReceived={handleDataReceived} backendUrl={backendUrl} />
      </div>

      {/* Right Panel — Map / Alerts */}
      <div className="flex-1 relative overflow-hidden">
        {renderRightPanel()}
      </div>
    </main>
  );
}
