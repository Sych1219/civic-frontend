# Civic Frontend — Design Overview

> **Cross-repo docs** — when updating this file, also check:
> - `civic-app` → `design-docs/MVP-taxi-spatial-qa.md` — `POST /api/v1/query` endpoint (§Data Flow), `{answer, data, metadata}` envelope, `data.type` discriminator (visualisation mode), `context.type` (label derivation), `layer_id`/`layer_label` fields
> - `civic-frontend` → `docs/apis-data-contract.md` — API contract that this design implements
> - Full index: `civic-frontend/docs/cross-repo-index.md`

A chat-driven dashboard built with Next.js. The user types a natural-language query; the backend returns a plain-English answer and structured GeoJSON data; the right panel renders the appropriate visualisation — map with point clusters, heatmap, individual markers, or a temporal slider for time-series data. Multiple queries can be overlaid as independent, toggleable layers on the same map.

---

## Architecture

The dashboard is a split-panel layout: a **chat interface** on the left and a **dynamic visualisation panel** on the right.

```
┌──────────────────────────────────────────────────────────┐
│  Dashboard Page (/dashboard) — Split Layout              │
│  ┌──────────────┐  ┌────────────────────────────────────┐│
│  │              │  │  Visualisation Panel               ││
│  │  ChatPanel   │  │                                    ││
│  │              │  │  GeoHeatmapMap                     ││
│  │  - Messages  │  │    (Heatmap / Clusters / Points)   ││
│  │  - Input     │  │    + Time Slider when timeline     ││
│  │  - API call  │  │                                    ││
│  │              │  │  ┌──────────────┐                  ││
│  │              │  │  │ LayerToggle  │ ← bottom-left    ││
│  │              │  │  │  • Layer A ● │                  ││
│  │              │  │  │  • Layer B ● │                  ││
│  │              │  │  └──────────────┘                  ││
│  └──────────────┘  └────────────────────────────────────┘│
│         │                        ↑                        │
│         └────────────────────────┘                        │
│  data.type selects rendering; layer_id accumulates layers │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

1. User types a query → `ChatPanel` sends `POST /api/v1/query` to the backend
2. Backend returns `{ answer, data, metadata }`, optionally including `layer_id` and `layer_label`
3. `ChatPanel` displays `answer` as the assistant message
4. `DashboardPage` stores the response in a `layers` record keyed by `layer_id` (falls back to a generated ID if absent)
5. `data` (tagged union) is inspected per layer: `data.locations` for spatial queries; for timelines, `data.snapshots[]` provides metadata only (no geometry — positions are fetched as MVT tiles)
6. If `data.type === "timeline"`, `DashboardPage` stores the snapshot metadata and configures a Mapbox vector tile source pointing at the Java backend's tile endpoint (`GET /tiles/taxis/{snapshotId}/{z}/{x}/{y}.pbf`). When the user scrubs the slider, the tile source URL is swapped to the new `snapshotId`.
7. If `data.context.type === "zone"` and `zone_name` is present, `DashboardPage` fires a secondary request to fetch the zone boundary geometry from the Java backend and attaches it to the layer. For timeline tile requests, the `zone` query parameter is also passed to filter positions spatially.
8. All active layers (including any zone boundary geometry) are passed to `GeoHeatmapMap`, each rendered on the shared map
9. `LayerToggle` (bottom-left of map) reflects the current layer list; visibility and removal are applied immediately (boundary overlays follow their parent layer)
10. The visualisation panel updates without page navigation

---

## Visualisation Mode

### `spatial_query` — Static GeoJSON map

`data.type = "spatial_query"`

Automatically switches layers based on zoom level:

| Zoom Level | Mode | Description |
|---|---|---|
| **< 12** | Heatmap | Colour-coded density map (blue → red) |
| **12 – 14** | Clusters | Grouped markers with counts (blue < 100, yellow < 750, pink 750+) |
| **≥ 15** | Points | Individual data points — click for details |

---

### `timeline` — Temporal map with time slider

`data.type = "timeline"`

When the response carries a `timeline` payload, `GeoHeatmapMap` switches into **temporal mode**: the heatmap/cluster layers are hidden and a **time slider panel** appears below the map. The slider scrubs through `data.snapshots[]`; on each tick, the Mapbox vector tile source URL is swapped to point to the current snapshot's tile endpoint, so taxi positions update per-snapshot.

#### Data shape consumed

```
data.snapshots[]
  .snapshot_id → used to construct the MVT tile URL for this snapshot
  .timestamp   → displayed in the slider timestamp label
  .taxi_count  → shown in the snapshot count badge
```

#### MVT tile source

Instead of embedding GeoJSON `locations` in each snapshot, the frontend fetches spatial data as Mapbox Vector Tiles directly from the Java backend:

```
GET {JAVA_BACKEND_URL}/tiles/taxis/{snapshotId}/{z}/{x}/{y}.pbf?zone={zone}
```

Mapbox GL JS automatically computes `z`, `x`, `y` from the current viewport. When the user scrubs to a new snapshot, the tile source URL is updated:

```typescript
map.removeSource('timeline-taxis');
map.addSource('timeline-taxis', {
  type: 'vector',
  tiles: [`${javaBackendUrl}/tiles/taxis/${snapshot.snapshot_id}/{z}/{x}/{y}.pbf?zone=${zone}`],
});
```

Adjacent snapshots can be prefetched for smooth playback. Tiles are cached by the browser via `Cache-Control: max-age=300`.

#### Time slider panel

| Element | Description |
|---|---|
| ▶ / ⏸ button | Starts / pauses animation; resets to beginning if already at the last snapshot |
| Snapshot counter | `current / total` snapshot index |
| Timestamp label | Current snapshot time formatted as `HH:MM` (SGT) |
| `<input type="range">` | Scrub slider — one step per snapshot; dragging pauses playback |
| Start / end labels | `from_time` and `to_time` formatted as `HH:MM` |

#### Playback behaviour

- Playback advances one snapshot per animation frame tick (rate configurable).
- Dragging the slider pauses auto-play and jumps directly to the selected snapshot.
- When the last snapshot is reached, playback stops; pressing ▶ restarts from index 0.

---

## Zone Boundary Overlay

When a response carries a `context` with `type: "zone"` (including districts and highways), the frontend automatically fetches the zone's boundary geometry from the Java backend and renders it as an overlay on the map. This gives users a clear visual reference for where the queried zone is.

### Trigger

The overlay is triggered whenever `data.context` satisfies either condition:

| `context.type` | Relevant fields | Example |
|---|---|---|
| `zone` | `zone_name`, `category: "district"` | `{ "type": "zone", "zone_name": "cbd", "category": "district" }` |
| `zone` | `zone_name`, `category: "highway"` | `{ "type": "zone", "zone_name": "aye", "category": "highway" }` |

This applies to **both** `spatial_query` and `timeline` responses — any response whose context contains a `zone_name` will trigger the boundary fetch.

### Data Flow

1. `DashboardPage` receives a response and inspects `data.context`
2. If `context.type === "zone"` and `context.zone_name` is present, issue a secondary request to the Java backend: `GET /api/v1/zones/{zone_name}/geometry` (or equivalent query endpoint)
3. The backend returns a `ZoneGeometryData` response:
   - `category: "district"` → `geometry` is a **Polygon**
   - `category: "highway"` → `geometry` is a **LineString**
4. The geometry is stored alongside the layer and passed to `GeoHeatmapMap` for rendering

### Map Rendering

| Category | Geometry type | Style |
|---|---|---|
| `district` | Polygon | Dashed outline stroke (e.g. 2 px, layer colour), semi-transparent fill (≈ 0.08 opacity) |
| `highway` | LineString | Solid or dashed line stroke (e.g. 3 px, layer colour, distinct dash pattern) |

The boundary layer is tied to its parent data layer — toggling or removing a layer in `LayerToggle` also toggles/removes its boundary overlay.

### Component Changes

- **`DashboardPage`** — after storing a new layer, checks `data.context` for `zone_name`; if present, fetches zone geometry and attaches it to the layer record (e.g. `layers[id].zoneGeometry`)
- **`GeoHeatmapMap`** — for each active layer with `zoneGeometry`, adds a Mapbox `fill` + `line` source/layer (district) or a `line` source/layer (highway); visibility is synchronised with the parent layer

---

## Multi-Layer Support

Each chat response can carry an optional `layer_id` (and human-readable `layer_label`). `DashboardPage` accumulates responses into a `layers: Record<string, ApiResponse>` map so that successive queries are **additive** — each result appears as its own layer on the map rather than replacing the previous one.

A parallel `visibility: Record<string, boolean>` map tracks which layers are currently shown. `GeoHeatmapMap` reads both maps and applies Mapbox `visibility` layout properties per layer accordingly.

---

## Layer Toggle Panel

`LayerToggle` is a floating panel rendered inside `GeoHeatmapMap`, anchored to the **bottom-left** of the map container. It is only shown when at least one layer is present.

| Element | Description |
|---|---|
| Colour dot | Unique colour per layer (cycles through 8 preset colours) |
| Label | `layer_label` from the API response; if absent, derived as `data.context.zone_name ?? data.context.road_name ?? data.type` |
| Eye / EyeOff button | Toggles layer visibility on/off; dot and label dim when hidden |
| × button | Removes the layer entirely (hover to reveal) |

Layer colours are assigned by index position in the `layers` record and are consistent for the lifetime of the layer.

---

## Components

### ChatPanel (`components/ChatPanel.tsx`)

Responsible for all user interaction: sending queries, displaying the conversation, and forwarding response data up to the parent page.

| Prop | Type | Required | Description |
|---|---|---|---|
| `onDataReceived` | `(data: ApiResponse) => void` | Yes | Called with the full backend response; parent uses it to update the visualisation panel |
| `backendUrl` | `string` | No | Backend API endpoint; defaults to `NEXT_PUBLIC_BACKEND_URL` |

### Map Visualisation Component (`components/GeoHeatmapMap.tsx`)

Renders GeoJSON point data on a Mapbox map. Branches on `data.type`:

- **`spatial_query`** — zoom-based layer switching (heatmap → clusters → points)
- **`timeline`** — temporal mode with time slider; one snapshot rendered at a time

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `mapboxToken` | `string` | Yes | — | Mapbox GL access token |
| `geojson` | `GeoJSON FeatureCollection \| null` | No | `null` | Static point features (`spatial_query` mode) |
| `timelineData` | `TimelineData \| null` | No | `null` | Snapshot array for temporal mode |
| `autoRefresh` | `boolean` | No | `true` | Enable periodic data refresh (standalone mode) |
| `refreshInterval` | `number` | No | `30000` | Refresh interval in milliseconds |

**Key internal state (temporal mode):**

| State | Description |
|---|---|
| `snapshotIndex` | Current position in `timelineData.snapshots[]` |
| `isPlaying` | Whether auto-advance is active |
| Active source | Mapbox vector tile source; URL swapped to `tiles/taxis/{snapshots[snapshotIndex].snapshot_id}/{z}/{x}/{y}.pbf` on each index change |

### Layer Toggle (`components/LayerToggle.tsx`)

Floating panel positioned at `bottom-left` inside the map, rendered by `GeoHeatmapMap`. Receives the full `layers` record, the `visibility` map, an `onToggle` callback, and an `onRemove` callback.

| Prop | Type | Description |
|---|---|---|
| `layers` | `Record<string, ApiResponse>` | All active layers keyed by `layer_id` |
| `visibility` | `Record<string, boolean>` | Current visibility state per layer |
| `onToggle` | `(layerId: string) => void` | Show/hide a layer |
| `onRemove` | `(layerId: string) => void` | Delete a layer from the map |

Returns `null` when `layers` is empty (panel auto-hides).

### Dashboard Page (`app/dashboard/page.tsx`)

Owns the split layout and layer state. On each `onDataReceived` call:
- Derives a `layer_id` from the response (or generates one)
- Upserts the response into `layers`
- Initialises `visibility[layer_id] = true` for new layers

Reads `data.type` per layer and passes the appropriate props to `GeoHeatmapMap`:
- `spatial_query` → `geojson={data.locations}`
- `timeline` → `timelineData={data}` (metadata only; tile URL constructed from `snapshot_id` + Java backend base URL)

Also handles missing configuration (e.g. no Mapbox token) and shows a live-data indicator badge.

---

## API Contract

The visualisation panel is data-driven by the backend response fields:

| Field | Used for |
|---|---|
| `answer` | Displayed as the assistant chat message |
| `data.type` | Discriminator — `"spatial_query"`, `"timeline"`, or `"zone_geometry"` |
| `data.locations` | GeoJSON FeatureCollection rendered on the map *(spatial_query)* |
| `data.snapshots[].snapshot_id` | Used to construct MVT tile URL for each snapshot *(timeline)* |
| `data.taxi_count` | Shown in the chat message summary *(spatial_query)* |
| `data.snapshot_time` | Shown as the data timestamp *(spatial_query)* |
| `data.context` | Query parameters (zone name, radius, etc.) for map title / context label |
| `layer_id` *(optional)* | Stable identifier used as the key in the `layers` record; auto-generated if absent |
| `layer_label` *(optional)* | Human-readable display name shown in the `LayerToggle` panel; if absent, the frontend derives it as `data.context.zone_name ?? data.context.road_name ?? data.type` |

Full request/response schema: [apis-data-contract.md](apis-data-contract.md)

---

## Project Structure

```
civic-frontend/
├── app/
│   ├── api/chat/              # Chat API route
│   ├── dashboard/
│   │   └── page.tsx           # Split layout + layer state management
│   └── taxi-heatmap/
│       └── page.tsx           # Standalone map page
├── components/
│   ├── ChatPanel.tsx          # Chat UI + backend integration
│   ├── GeoHeatmapMap.tsx      # Map visualisation component (static + temporal + multi-layer)
│   └── LayerToggle.tsx        # Floating layer panel (show/hide/remove per layer)
├── types/
│   └── api.ts                 # TypeScript type definitions
├── public/
└── docs/
    ├── design.md              # Design overview (this file)
    └── apis-data-contract.md  # API request/response schema
```

---

## Tech Stack

| Area | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | Tailwind CSS |
| Icons | Lucide React |
| Map | Mapbox GL JS |
| HTTP | Fetch API |

### Key Packages

| Package | Purpose |
|---|---|
| `mapbox-gl` | Map rendering |
| `@types/mapbox-gl` | TypeScript definitions |
| `lucide-react` | Modern icons |

---

## Features

### Chat Interface (Left Panel)

- Message bubbles (user + assistant)
- Real-time backend API integration
- Loading states and error handling

### Visualisation Panel (Right Panel)

- **Static map view** — dynamic heatmap, zoom-based layer switching (heatmap → clusters → individual points), interactive popups
- **Temporal map view** — taxi positions scrubbed through time using a slider; positions loaded as MVT tiles per snapshot (not GeoJSON); play/pause, manual scrubbing, per-snapshot count badge, and `from_time` / `to_time` range labels
- **Multi-layer overlay** — each chat response adds a new named layer; layers stack on the same map
- **Zone boundary overlay** — when the query targets a zone or highway, the boundary is fetched from the Java backend and rendered as a dashed outline (district polygon) or line (highway) on the map
- **Layer Toggle panel** — floating bottom-left panel to show/hide or remove individual layers
- Updates instantly from chat responses
- Auto-refresh on a configurable interval (standalone mode)

---

## Chat Examples

Try these queries in the dashboard chat:

- "How many taxis are in Punggol?"
- "Show taxi availability in Jurong"
- "Show me taxi activity near CBD from 8am to 9am"
- Any natural-language question about taxi availability by zone or time range

---

## Customisation

### Adjust Zoom Thresholds

Edit `components/GeoHeatmapMap.tsx`:

```tsx
const updateVisualizationMode = useCallback((zoom: number) => {
  if (zoom < 12) {
    mode = 'heatmap';
  } else if (zoom < 15) {
    mode = 'clusters';
  } else {
    mode = 'points';
  }
}, []);
```

Remember to update corresponding `minzoom` and `maxzoom` properties on each layer as well.
