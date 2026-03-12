# Civic Frontend — Design Overview

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
5. `data` (tagged union) is inspected per layer: `data.locations` for spatial queries or `data.snapshots[].locations` for timelines
6. All active layers are passed to `GeoHeatmapMap`, each rendered on the shared map
7. `LayerToggle` (bottom-left of map) reflects the current layer list; visibility and removal are applied immediately
8. The visualisation panel updates without page navigation

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

When the response carries a `timeline` payload, `GeoHeatmapMap` switches into **temporal mode**: the heatmap/cluster layers are hidden and a **time slider panel** appears below the map. The slider scrubs through `data.snapshots[]`, swapping the active `locations` GeoJSON source on each tick so taxi positions update frame-by-frame.

#### Data shape consumed

```
data.snapshots[]
  .timestamp   → displayed in the slider timestamp label
  .taxi_count  → shown in the snapshot count badge
  .locations   → GeoJSON FeatureCollection pushed to the map source
```

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
| Active source | Mapbox GeoJSON source updated to `snapshots[snapshotIndex].locations` on each index change |

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
- `timeline` → `timelineData={data}`

Also handles missing configuration (e.g. no Mapbox token) and shows a live-data indicator badge.

---

## API Contract

The visualisation panel is data-driven by the backend response fields:

| Field | Used for |
|---|---|
| `answer` | Displayed as the assistant chat message |
| `data.type` | Discriminator — `"spatial_query"`, `"timeline"`, or `"zone_geometry"` |
| `data.locations` | GeoJSON FeatureCollection rendered on the map *(spatial_query)* |
| `data.snapshots[].locations` | Per-snapshot GeoJSON for timeline slider *(timeline)* |
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
- **Temporal map view** — taxi positions scraped through time using a slider; play/pause, manual scrubbing, per-snapshot count badge, and `from_time` / `to_time` range labels
- **Multi-layer overlay** — each chat response adds a new named layer; layers stack on the same map
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
