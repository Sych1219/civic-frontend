# Traffic Camera UI Design

> **Cross-repo docs** — this file covers the frontend UI for the traffic camera feature.
> - Backend design: `gov-data` → `docs/traffic-image-design-doc.md`
> - Taxi dashboard design: `civic-frontend` → `docs/design.md`
> - API contract: `civic-frontend` → `docs/apis-data-contract.md`
> - Full index: `civic-frontend` → `docs/cross-repo-index.md`

---

## 1. Design Principles

Same overall pattern as the taxi dashboard (`docs/design.md`): a **chat panel on the left**, a **map on the right**. The user types a natural-language query; the backend returns a plain-English answer and structured camera/traffic data; the right panel renders cameras and congestion on the map.

1. **Chat-driven** — All interactions start from natural language queries in the left panel
2. **Split-panel layout** — Identical to the taxi dashboard: chat left, map right (see `docs/design.md`)
3. **Location-driven, not ID-driven** — Users say "Woodlands", not "camera 2701"
4. **Map-always right panel** — The right panel is always a Mapbox map; query results change what is rendered on it (camera markers, corridor overlays, congestion lines, etc.)
5. **Complement, don't compete** — No route planning, no ETA, no navigation

---

## 2. Page Layout (Desktop, Split-Panel)

Identical split-panel layout to the taxi dashboard (`/dashboard`). The traffic camera page lives at `/cameras`.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Left Panel (400px fixed)         │  Right Panel (flex)             │
│  ┌─────────────────────────────┐  │  ┌───────────────────────────┐  │
│  │  ChatPanel                  │  │  │  CameraMap                │  │
│  │                             │  │  │  (always a Mapbox map)    │  │
│  │  ┌───────────────────────┐  │  │  │                           │  │
│  │  │ 3 quick suggestions:  │  │  │  │  Overlays change based    │  │
│  │  │ "Is CTE jammed?"     │  │  │  │  on query result:         │  │
│  │  │ "BKE corridor"       │  │  │  │                           │  │
│  │  │ "My commute briefing" │  │  │  │  • camera_map  — dots     │  │
│  │  └───────────────────────┘  │  │  │  • corridor   — route     │  │
│  │                             │  │  │  • fusion     — +taxis    │  │
│  │  ┌─ assistant ───────────┐  │  │  │                           │  │
│  │  │ CTE is moderately     │  │  │  │  + LayerToggle (bottom-   │  │
│  │  │ congested. Braddell   │  │  │  │    left, same as taxi     │  │
│  │  │ to AMK is severe...   │  │  │  │    dashboard)             │  │
│  │  └───────────────────────┘  │  │  │                           │  │
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
| `ChatPanel` | Shared | Same chat UI, different backend endpoint / tools |
| `MapBase` (from `GeoHeatmapMap`) | Shared | Common Mapbox setup, dark-v11 style, controls |
| Split layout | Shared | Same 400px left / flex right pattern |
| `LayerToggle` | Shared | Same floating panel for layer management |

---

## 3. Right Panel — Map View

The right panel is **always a Mapbox map**, following the same pattern as `GeoHeatmapMap` in the taxi dashboard. The map content is driven by the backend response's `view_type` field, which determines what layers are rendered on the map.

### Empty State (no query yet)

The map is shown immediately with Singapore centered, but no camera markers. Same pattern as the taxi dashboard showing an empty map before any query.

```
┌───────────────────────────────────┐
│                                   │
│         (Mapbox map,              │
│          Singapore centered,      │
│          no overlays)             │
│                                   │
└───────────────────────────────────┘
```

### `camera_map` — All Cameras

Triggered by queries like "Show all cameras", "Which cameras are online?":

- Camera markers color-coded by status: **green** (online) / **yellow** (frozen) / **red** (offline)
- Click marker → popup with location, status, last-updated time
- Active alerts shown as a collapsible overlay bar (same pattern as `LayerToggle`)

```
┌───────────────────────────────────┐
│  [Mapbox map]                     │
│         📷   📷                   │  ← camera markers
│    📷          📷                 │     green/yellow/red by status
│        📷  📷     📷              │
│   📷         📷                   │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ LayerToggle (bottom-left)   │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

### `corridor` — Corridor / Expressway View

Triggered by queries like "Is CTE jammed?" or "BKE cameras":

- Map zooms/fits to the corridor bounding box
- Camera markers on the route, color-coded by congestion: **green** (free) / **yellow** (light) / **orange** (moderate) / **red** (heavy)
- GeoJSON LineString connecting cameras along the route, segmented and colored by congestion (same approach as the taxi dashboard's zone boundary overlay)
- Click marker → popup with congestion level and camera thumbnail

```
┌───────────────────────────────────┐
│  [Mapbox map — zoomed to CTE]     │
│                                   │
│         [1701] 🟢                 │
│        /                          │
│     [1702] 🟢                     │
│       \                           │
│      [1703] 🟡  [1704] 🟠         │
│          \  /                     │
│        [1705] 🔴  ← worst         │
│           \                       │
│         [1706] 🔴                 │
│          |                        │
│       [1707]...[1711] 🟠→🟡→🟢   │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ LayerToggle                 │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

The LLM summary (corridor name, online count, worst segment, suggested alt route) appears as the assistant message in the **left chat panel** — not as a separate right-panel component.

### `fusion` — Camera + Taxi Overlay

Triggered by queries like "Easy to get a taxi near Orchard?":

- Map shows **both** camera markers and taxi position dots on the same layer
- Same multi-layer approach as the taxi dashboard's `layers` record
- `LayerToggle` lets user show/hide camera layer and taxi layer independently

```
┌───────────────────────────────────┐
│  [Mapbox map]                     │
│      📷  📷                       │
│   🚕 🚕    📷   🚕                │
│     🚕  📷    🚕  🚕              │
│  🚕       🚕    📷                │
│                                   │
│  ┌─────────────────────────────┐  │
│  │ LayerToggle                 │  │
│  │  • Cameras (3)  👁           │  │
│  │  • Taxis (23)   👁           │  │
│  └─────────────────────────────┘  │
└───────────────────────────────────┘
```

---

## 4. View Routing

The backend returns a `view_type` field in the response that determines how the map renders. All views use the same Mapbox map instance — only the layers change.

| `view_type` | Map overlay | Trigger examples |
|---|---|---|
| `camera_map` | Camera status markers | "Show all cameras", "Which cameras are online?" |
| `corridor` | Route line + congestion markers | "Is CTE jammed?", "BKE cameras" |
| `fusion` | Camera markers + taxi dots (two layers) | "Taxi near Orchard?", "Compare traffic and taxi on CTE" |

Other informational responses (commute briefing, camera detail, replay, historical patterns, alerts) are rendered as rich content in the **chat panel** (left side) — not as separate right-panel components. The map may zoom to a relevant location, but the visual answer lives in the chat.

---

## 5. Data Flow

Same flow as the taxi dashboard (see `docs/design.md` § Data Flow):

1. User types a query → `ChatPanel` sends `POST /api/v1/camera-query` to the backend
2. Backend returns `{ answer, view_type, data, metadata }`
3. `ChatPanel` displays `answer` as the assistant message (may include inline camera cards, briefing summaries, etc.)
4. `CamerasPage` inspects `view_type` and updates the map layers accordingly
5. `LayerToggle` reflects active layers; user can show/hide or remove

---

## 6. Project Structure (Proposed)

```
civic-frontend/
├── app/
│   ├── dashboard/
│   │   └── page.tsx               # Taxi dashboard (existing)
│   ├── cameras/
│   │   └── page.tsx               # Traffic camera page (new)
├── components/
│   ├── ChatPanel.tsx              # Shared chat UI
│   ├── GeoHeatmapMap.tsx          # Taxi map (existing)
│   ├── LayerToggle.tsx            # Shared layer panel
│   └── camera/
│       └── CameraMap.tsx          # Camera map (Mapbox, same pattern as GeoHeatmapMap)
├── types/
│   ├── api.ts                     # Taxi API types (existing)
│   └── camera.ts                  # Camera API types (new)
├── docs/
│   ├── design.md                  # Taxi dashboard design (existing)
│   ├── traffic-camera-ui-design.md # This file
│   └── apis-data-contract.md      # API contract
```

---

## 7. Tech Stack

Same as the taxi dashboard — see [design.md](design.md#tech-stack). No additional dependencies required for the base implementation.
