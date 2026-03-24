# Traffic Camera UI Design

> **Cross-repo docs** — this file covers the frontend UI for the traffic camera feature.
> - Backend LLM service design: `civic-app` → `design-docs/chat-llm-design.md`
> - Backend data service design: `gov-data` → `docs/traffic-image-design-doc.md`
> - Taxi dashboard design: `civic-frontend` → `docs/design.md`
> - API contract: `civic-frontend` → `docs/apis-data-contract.md`
> - Full index: `civic-frontend` → `docs/cross-repo-index.md`

---

## 1. Design Principles

Same overall pattern as the taxi dashboard (`docs/design.md`): a **chat panel on the left**, a **map on the right**. The user types a natural-language query; the backend returns a plain-English answer and structured camera/traffic data; the right panel renders cameras and congestion on the map.

1. **Chat-driven** — All interactions start from natural language queries in the left panel
2. **Split-panel layout** — Identical to the taxi dashboard: chat left, visual content right (see `docs/design.md`)
3. **Location-driven, not ID-driven** — Users say "Woodlands", not "camera 2701"
4. **`view_type`-driven right panel** — The backend returns a `view_type` field that determines what the right panel renders (map, detail, snapshot, or alerts)

---

## 2. Page Layout (Desktop, Split-Panel)

Identical split-panel layout to the taxi dashboard (`/dashboard`). The traffic camera page lives at `/cameras`.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Left Panel (400px fixed)         │  Right Panel (flex)             │
│  ┌─────────────────────────────┐  │  ┌───────────────────────────┐  │
│  │  ChatPanel                  │  │  │  Content area             │  │
│  │                             │  │  │  (driven by view_type)    │  │
│  │  ┌───────────────────────┐  │  │  │                           │  │
│  │  │ 3 quick suggestions:  │  │  │  │  view_type →              │  │
│  │  │ "Is CTE jammed?"     │  │  │  │  camera_map  → map+dots   │  │
│  │  │ "BKE corridor"       │  │  │  │  corridor    → map+route  │  │
│  │  │ "Any accidents now?" │  │  │  │  camera_detail → overlay  │  │
│  │  └───────────────────────┘  │  │  │  snapshot      → overlay   │  │
│  │                             │  │  │  alerts      → list      │  │
│  │  ┌─ assistant ───────────┐  │  │  │                           │  │
│  │  │ CTE is moderately     │  │  │  │  + LayerToggle (map       │  │
│  │  │ congested. Braddell   │  │  │  │    views only, bottom-    │  │
│  │  │ to AMK is severe...   │  │  │  │    left, same as taxi     │  │
│  │  └───────────────────────┘  │  │  │    dashboard)             │  │
│  │                             │  │  │                           │  │
│  │  ┌─────────────────────┐   │  │  │                           │  │
│  │  │ Ask anything...  [→] │   │  │  │                           │  │
│  │  └─────────────────────┘   │  │  │                           │  │
│  └─────────────────────────────┘  │  └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Shared Infrastructure with Taxi Dashboard

| Component | Reuse | Notes |
|---|---|---|
| `ChatPanel` | Shared | Same chat UI; request field is `message` (not `query`) |
| `MapBase` (from `GeoHeatmapMap`) | Shared | Common Mapbox setup, dark-v11 style, controls |
| Split layout | Shared | Same 400px left / flex right pattern |
| `LayerToggle` | Shared | Same floating panel for layer management (map views only) |

---

## 3. API Contract

The frontend calls the `civic-app` LLM service (see `civic-app` → `design-docs/chat-llm-design.md` for full backend design).

### Request

```
POST /api/traffic-chat
```

```json
{ "message": "Is CTE jammed?" }
```

Note: field name is **`message`** (not `query` as used by the taxi dashboard).

### Response

```json
{
  "answer": "CTE is experiencing heavy congestion from Braddell to AMK. Consider taking PIE instead.",
  "view_type": "corridor",
  "cameras": [
    {
      "camera_id": "1701",
      "location_name": "CTE - Ang Mo Kio",
      "lat": 1.3456,
      "lon": 103.8321,
      "image_url": "https://...",
      "analysis": {
        "congestion": "heavy",
        "vehicle_density": "packed",
        "incidents": "none",
        "weather": "clear",
        "road_surface": "dry",
        "summary": "Heavy bumper-to-bumper traffic in both directions."
      }
    }
  ]
}
```

### Congestion Values

`free_flow | light | moderate | heavy | standstill` (from backend vision analysis)

Map to marker colors: green → yellow → orange → red → dark red

---

## 4. Right Panel — Empty State

Shown on initial load before any query. Same pattern as the taxi dashboard.

```
┌───────────────────────────────────┐
│                                   │
│         (Mapbox map,              │
│          Singapore centered,      │
│          no overlays)             │
│                                   │
└───────────────────────────────────┘
```

---

## 5. Right Panel — `camera_map`

Triggered by: "Show all cameras", "Show me Woodlands", "Cameras near me"

- Mapbox map with camera markers from `cameras[]`
- Markers color-coded by `analysis.congestion` (or neutral grey if no analysis — Phase 2 skipped for `camera_map`)
- Click marker → popup: `location_name`, `image_url` thumbnail, status
- `LayerToggle` at bottom-left (same as taxi dashboard)

```
┌───────────────────────────────────┐
│  [Mapbox map]                     │
│         📷   📷                   │  ← cameras[].lat/lon
│    📷          📷                 │
│        📷  📷     📷              │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ LayerToggle                 │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

---

## 6. Right Panel — `corridor`

Triggered by: "Is CTE jammed?", "BKE cameras"

- Map zooms/fits bounds to the corridor cameras
- Camera markers color-coded by `analysis.congestion`
- GeoJSON LineString connecting cameras in order, segmented and colored by congestion per segment (same approach as taxi dashboard zone boundary overlays)
- Click marker → popup: `location_name`, `image_url` thumbnail, `analysis.summary`
- `LayerToggle` at bottom-left

The LLM corridor summary (`answer`) appears in the **left chat panel** as the assistant message.

```
┌───────────────────────────────────┐
│  [Mapbox map — zoomed to CTE]     │
│                                   │
│         [1701] 🟢 free_flow        │
│        /                          │
│     [1702] 🟢 free_flow            │
│       \                           │
│      [1703] 🟡  [1704] 🟠          │
│          \  /                     │
│        [1705] 🔴 heavy             │
│           \                       │
│         [1706] 🔴 heavy            │
│          |                        │
│       [1707]...[1711] 🟠→🟡→🟢    │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ LayerToggle                 │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

---

## 7. Right Panel — `camera_detail`

Triggered by: clicking a camera marker in `camera_map` / `corridor` view

The map stays visible. The detail card appears as a **floating overlay panel** anchored to the right side of the map. The map zooms/pans to the selected camera's location and highlights its marker.

- Map remains in the background, centered on the selected camera
- Floating panel (right-anchored) shows: camera image, LLM analysis, nearby camera thumbnails
- ← Close button dismisses the panel and returns to the previous map state

```
┌───────────────────────────────────────────────────────┐
│  [Mapbox map — zoomed to camera location]             │
│                                                       │
│   📷 ← highlighted marker                            │
│                                    ┌────────────────┐ │
│                                    │ ← Close        │ │
│                                    │ CTE - Ang Mo   │ │
│                                    │ Kio · Cam 1701 │ │
│                                    │ ┌────────────┐ │ │
│                                    │ │ [img 1701] │ │ │
│                                    │ └────────────┘ │ │
│                                    │ heavy · packed │ │
│                                    │ Weather: clear │ │
│                                    │ "Heavy bumper  │ │
│                                    │  to bumper..." │ │
│                                    │                │ │
│                                    │ Nearby:        │ │
│                                    │ [1702][1703]   │ │
│                                    └────────────────┘ │
└───────────────────────────────────────────────────────┘
```

---

## 8. Right Panel — `snapshot`

Triggered by: "Show Woodlands at 8am"

A historical snapshot view — not a video player. LTA cameras capture periodic still images, so `snapshot` means: *show me the camera image from around that time, with LLM analysis of what it shows*.

Same overlay pattern as `camera_detail`: the map stays visible, a floating panel shows the historical snapshot. The map zooms to the camera location and highlights its marker, with a "historical" timestamp label.

```
┌───────────────────────────────────────────────────────┐
│  [Mapbox map — zoomed to camera location]             │
│                                                       │
│   📷 ← highlighted marker                            │
│                                    ┌────────────────┐ │
│                                    │ ← Close        │ │
│                                    │ Cam 2701 ·     │ │
│                                    │ 08:00 SGT      │ │
│                                    │ (historical)   │ │
│                                    │ ┌────────────┐ │ │
│                                    │ │ [snapshot] │ │ │
│                                    │ └────────────┘ │ │
│                                    │ heavy          │ │
│                                    │ "Heavy conges- │ │
│                                    │  tion at 8am." │ │
│                                    └────────────────┘ │
└───────────────────────────────────────────────────────┘
```

---

## 9. Right Panel — `alerts`

Triggered by: "Any accidents right now?", "Any incidents?"

- List of cameras from `cameras[]` where `analysis.incidents` is not `none`
- Each row: `location_name`, thumbnail, `analysis.incidents`, `analysis.congestion`
- Click row → navigate to `camera_detail` for that camera

```
┌───────────────────────────────────┐
│  Active Alerts                    │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ [img] PIE - Toa Payoh       │  │
│  │       Possible incident     │  │
│  │       Congestion: heavy  →  │  │
│  ├─────────────────────────────┤  │
│  │ [img] CTE - Braddell        │  │
│  │       Stalled vehicle       │  │
│  │       Congestion: standstill│  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

---

## 10. Data Flow

```
User query ("Is CTE jammed?")
  → ChatPanel sends POST /api/traffic-chat { message: "Is CTE jammed?" }
  → civic-app Phase 1: classifies view_type="corridor", fetches CTE cameras
  → civic-app Phase 2: vision analysis in parallel across all cameras
  → Response: { answer, view_type: "corridor", cameras[] }
  → ChatPanel displays answer as assistant message
  → CamerasPage reads view_type → renders CorridorMap with cameras[]
```

Full backend flow: see `civic-app` → `design-docs/chat-llm-design.md` § Query Flow.

---

## 11. View Routing

The `view_type` field in the response drives which right-panel component renders (referenced by `civic-app` → `design-docs/chat-llm-design.md` § `view_type` Values):

| `view_type` | Component | Trigger Examples |
|---|---|---|
| `camera_map` | CameraMap | "Show all cameras", "Cameras near Woodlands" |
| `corridor` | CorridorMap | "Is CTE jammed?", "BKE cameras" |
| `camera_detail` | CameraDetail | "Show camera 1005", click a marker |
| `snapshot` | CameraDetail (with historical label) | "Show Woodlands at 8am" |
| `alerts` | AlertsPanel | "Any accidents right now?" |

---

## 12. Project Structure (Proposed)

```
civic-frontend/
├── app/
│   ├── dashboard/
│   │   └── page.tsx               # Taxi dashboard (existing)
│   ├── cameras/
│   │   └── page.tsx               # Traffic camera page (new)
├── components/
│   ├── ChatPanel.tsx              # Shared chat UI (note: field is "message" not "query")
│   ├── GeoHeatmapMap.tsx          # Taxi map (existing)
│   ├── LayerToggle.tsx            # Shared layer panel
│   └── camera/
│       ├── CameraMap.tsx          # camera_map view — Mapbox + camera markers
│       ├── CorridorMap.tsx        # corridor view — Mapbox + route line + markers
│       ├── CameraDetail.tsx       # camera_detail + snapshot views — image + analysis panel
│       └── AlertsPanel.tsx        # alerts view — incident list
├── types/
│   ├── api.ts                     # Taxi API types (existing)
│   └── camera.ts                  # Camera API types (new): CameraResponse, CameraItem, CameraAnalysis, CameraViewType
├── docs/
│   ├── design.md                  # Taxi dashboard design (existing)
│   ├── traffic-camera-ui-design.md # This file
│   └── apis-data-contract.md      # API contract
```

---

## 13. Tech Stack

Same as the taxi dashboard — see [design.md](design.md#tech-stack). No additional dependencies required.
