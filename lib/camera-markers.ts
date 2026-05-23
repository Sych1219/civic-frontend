import mapboxgl from 'mapbox-gl';
import { getCongestionColor, CONGESTION_LABEL, type CameraItem, type CongestionLevel } from '@/types/camera';

/**
 * Clears existing markers and rebuilds camera markers on the given map.
 * Returns the new marker array (caller is responsible for storing it in a ref).
 */
export function buildCameraMarkers(
  map: mapboxgl.Map,
  cameras: CameraItem[],
  selectedCamera: CameraItem | null | undefined,
  onCameraClick: (camera: CameraItem) => void,
  currentMarkers: mapboxgl.Marker[],
): mapboxgl.Marker[] {
  currentMarkers.forEach(m => m.remove());

  return cameras.map(camera => {
    const isSelected = selectedCamera?.cameraId === camera.cameraId;
    const color = getCongestionColor(camera.analysis?.congestion);
    const size = isSelected ? 36 : 28;
    const iconSize = Math.round(size * 0.55);

    const el = document.createElement('div');
    el.style.cssText = `
      width: ${size}px; height: ${size}px;
      background: ${color};
      border: ${isSelected ? 3 : 2}px solid ${isSelected ? '#fff' : 'rgba(255,255,255,0.5)'};
      border-radius: 8px;
      cursor: pointer;
      box-shadow: 0 2px ${isSelected ? 12 : 5}px ${color}99;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;

    const congestionKey = camera.analysis?.congestion as CongestionLevel | undefined;
    const congestionLabel = congestionKey ? CONGESTION_LABEL[congestionKey] : 'No data';
    const title = camera.locationName || `Camera ${camera.cameraId}`;

    const popup = new mapboxgl.Popup({
      offset: 22,
      closeButton: false,
      focusAfterOpen: false,
      maxWidth: '360px',
    }).setHTML(`
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:2px;width:320px">
        ${camera.latestImage
          ? `<img src="${camera.latestImage}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;display:block;margin-bottom:8px;background:#0f172a" />`
          : `<div style="width:100%;height:120px;background:#0f172a;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:11px;margin-bottom:8px">No image available</div>`}
        <p style="font-weight:600;margin:0 0 6px;font-size:13px;color:#0f172a;line-height:1.3">${title}</p>
        <div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-bottom:${camera.analysis?.summary ? '6px' : '0'}">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
          <span style="color:#475569">${congestionLabel}</span>
          <span style="color:#94a3b8;margin-left:auto">Click to expand</span>
        </div>
        ${camera.analysis?.summary ? `<p style="margin:0;font-size:11px;color:#64748b;line-height:1.4">${camera.analysis.summary}</p>` : ''}
      </div>
    `);

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([camera.longitude, camera.latitude])
      .addTo(map);

    el.addEventListener('mouseenter', () => popup.setLngLat([camera.longitude, camera.latitude]).addTo(map));
    el.addEventListener('mouseleave', () => popup.remove());
    el.addEventListener('click', () => onCameraClick(camera));

    return marker;
  });
}
