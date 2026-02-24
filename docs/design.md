# Civic Frontend — Design Overview

A chat-driven dashboard built with Next.js. The user types a natural-language query; the backend returns structured data tagged with a `visualization_type` and a `layer_id`; the right panel renders the most appropriate visualisation — map heatmap, clusters, individual points, line chart, bar chart, and more. Multiple chat responses can coexist on the map simultaneously, each occupying its own named layer (e.g. temperature, taxi, PM2.5).

---

## Architecture

The dashboard is a split-panel layout: a **chat interface** on the left and a **dynamic visualisation panel** on the right. Two key design decisions drive the frontend:

- `visualization_type` selects which component renders the data
- `layer_id` identifies which named layer to create or update, so multiple datasets can coexist on the map at the same time

```
┌──────────────────────────────────────────────────────────┐
│  Dashboard Page (/dashboard) — Split Layout              │
│  ┌──────────────┐  ┌────────────────────────────────────┐│
│  │              │  │  Visualisation Panel               ││
│  │  ChatPanel   │  │                                    ││
│  │              │  │  map / map_temporal →              ││
│  │  - Messages  │  │    GeoHeatmapMap                   ││
│  │  - Input     │  │    (one Mapbox source+layers       ││
│  │  - API call  │  │     per layer_id, all coexist)     ││
│  │              │  │  time_series / generic →           ││
│  │              │  │    Chart (Line / Bar / Scatter …)  ││
│  │              │  │                                    ││
│  │              │  │  LayerToggle panel (map overlay)   ││
│  │              │  │    show/hide per layer_id          ││
│  └──────────────┘  └────────────────────────────────────┘│
│         │                        ↑                        │
│         └────────────────────────┘                        │
│  layer_id + visualization_type together drive the panel   │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

1. User types a query → `ChatPanel` sends `POST /api/query` to the backend
2. Backend returns a response with `visualization_type`, `layer_id`, `layer_label`, and `data`
3. Dashboard page merges the response into its `layers` map keyed by `layer_id` — existing layers are preserved, new ones are added, and an updated layer replaces only its own entry
4. Dashboard page reads `visualization_type` and routes `layers` to the right component:
   - `map` / `map_temporal` → `GeoHeatmapMap` (receives all accumulated map layers)
   - `time_series` / `generic` → Chart component (receives the latest chart response)
5. `GeoHeatmapMap` registers one Mapbox source + layer set per `layer_id`; all coexist on the same map
6. The visualisation panel updates without page navigation

---

## Visualisation Modes

### Map — GeoJSON responses

`visualization_type`: `map` | `map_temporal`

#### `map` — static GeoJSON

Automatically switches layers based on zoom level:

| Zoom Level | Mode | Description |
|---|---|---|
| **< 12** | 🔥 Heatmap | Colour-coded density map (blue → red) |
| **12 – 14** | 🔵 Clusters | Grouped markers with counts (blue < 100, yellow < 750, pink 750+) |
| **≥ 15** | 📍 Points | Individual data points — click for details |

#### `map_temporal` — time-series point map

Displays individual sensor stations as coloured circles whose colours update continuously as the user scrubs through time. The heatmap/cluster layers are hidden and replaced by three dedicated Mapbox layers:

| Layer ID | Type | Purpose |
|---|---|---|
| `temporal-glow` | `circle` | Blurred outer halo (25 % opacity) for a glow effect |
| `temporal-points` | `circle` | Main filled circle, colour-mapped to the current value |
| `temporal-labels` | `symbol` | Rounded value + unit label floating above each point |

Colour ramp is dynamically calibrated to the actual `[min, max]` of the dataset:

```
blue (#2166ac) → light blue (#67a9cf) → white (#f7f7f7) → orange (#ef8a62) → red (#b2182b)
```

**Time slider panel** (rendered below the map when `visualization_type === 'map_temporal'`):

| Element | Description |
|---|---|
| ▶ / ⏸ button | Starts/pauses animation; resets to beginning if already at the end |
| Timestamp display | Shows the current ISO timestamp formatted as `HH:MM:SS` |
| Colour ramp legend | Gradient bar with `min` / `max` value labels |
| `<input type="range">` | Scrub slider — `step=0.05` for sub-frame precision; dragging pauses playback |
| Start / end labels | First and last timestamps in `HH:MM` format |

**Smooth transitions** are achieved by:
1. `timeProgress` is a fractional float (e.g. `12.7`), not an integer index
2. `buildTemporalGeoJson` linearly interpolates each station's value between the two surrounding time-steps before writing it to the GeoJSON `value` property
3. Mapbox's `interpolate` expression on `circle-color` then blends colours in GPU
4. Playback uses `requestAnimationFrame` advancing **3 time-steps / second**

### Charts — time-series / tabular responses

`visualization_type`: `time_series` | `generic`

Driven entirely by the `chart_configs` array in the backend response — the frontend uses it directly to configure axes, labels, and chart type:

| `chart_configs[].type` | Chart | Use case |
|---|---|---|
| `line` | 📈 Line | Sensor readings over time |
| `bar` | 📊 Bar | Comparisons across stations or categories |
| `scatter` | ⚬ Scatter | Correlation between two metrics |

See [apis-data-contract.md](apis-data-contract.md) for the full `chart_configs` schema.

---

## Components

### ChatPanel (`components/ChatPanel.tsx`)

Responsible for all user interaction: sending queries, displaying the conversation, and forwarding response data up to the parent page.

| Prop | Type | Required | Description |
|---|---|---|---|
| `onDataReceived` | `(data: ApiResponse) => void` | ✅ | Called with the full backend response; parent uses it to update the visualisation panel |
| `backendUrl` | `string` | ❌ | Backend API endpoint; defaults to `NEXT_PUBLIC_BACKEND_URL` |

### Map Visualisation Component (`components/GeoHeatmapMap.tsx`)

Renders GeoJSON point data on a Mapbox map. Automatically switches between heatmap, cluster, and individual point layers based on zoom level. When `visualization_type` is `map_temporal`, hides the zoom-based layers and activates the temporal point layers with a time slider below the map. Supports multiple simultaneous datasets by registering one Mapbox source + layer set per `layer_id`.

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `mapboxToken` | `string` | ✅ | — | Mapbox GL access token |
| `layers` | `Record<string, ApiResponse>` | ❌ | `{}` | All accumulated map layer responses keyed by `layer_id`; each entry owns its own Mapbox source and layers |
| `autoRefresh` | `boolean` | ❌ | `true` | Enable periodic data refresh (standalone mode) |
| `refreshInterval` | `number` | ❌ | `30000` | Refresh interval in milliseconds |

**Per-layer Mapbox naming convention** (prefix = `layer_id`):

| Mapbox ID | Pattern | Example |
|---|---|---|
| Source | `geodata-{layer_id}` | `geodata-temperature` |
| Heatmap layer | `heatmap-{layer_id}` | `heatmap-temperature` |
| Cluster layer | `clusters-{layer_id}` | `clusters-taxi` |
| Points layer | `points-{layer_id}` | `points-taxi` |
| Temporal points | `temporal-points-{layer_id}` | `temporal-points-temperature` |
| Temporal glow | `temporal-glow-{layer_id}` | `temporal-glow-temperature` |
| Temporal labels | `temporal-labels-{layer_id}` | `temporal-labels-temperature` |

**Key internal functions:**

| Function | Description |
|---|---|
| `parseTemporalData` | Splits the flat `series` array into per-station blocks by detecting timestamp resets; falls back to equal-split if block count mismatches station count; returns sorted timestamps, per-station `Map<time, value>`, global range, and unit |
| `buildTemporalGeoJson` | Takes a fractional `timeProgress` float, linearly interpolates each station's value between adjacent time-steps, and returns a `FeatureCollection` ready to push to the `temporal-geodata` source |
| `parseTemporalData` (pendingData) | Also called inside the map `load` handler so that temporal data arriving before the map is ready is processed correctly |

### LayerToggle (`components/LayerToggle.tsx`)

A floating panel rendered as a map overlay listing all active layers. Each row shows the `layer_label`, a colour indicator, and a visibility toggle. Removing a layer from the toggle also drops its Mapbox source and layers from the map.

| Prop | Type | Description |
|---|---|
|---|
| `layers` | `Record<string, ApiResponse>` | All active layers keyed by `layer_id` |
| `visibility` | `Record<string, boolean>` | Current show/hide state per `layer_id` |
| `onToggle` | `(layerId: string) => void` | Called when a layer's visibility is toggled |
| `onRemove` | `(layerId: string) => void` | Called when a layer is removed entirely |

### Dashboard Page (`app/dashboard/page.tsx`)

Owns the split layout and the routing logic. Maintains a `layers: Record<string, ApiResponse>` state — each `onDataReceived` call merges the new response into the map by `layer_id` rather than replacing all data. Also tracks per-layer visibility, handles missing configuration (e.g. no Mapbox token), and shows a live-data indicator badge.

---

## API Contract

The visualisation panel is entirely data-driven by the backend response. Two fields together drive all routing and layer management:

### `visualization_type` — selects the component

| `visualization_type` | Component rendered |
|---|---|
| `map` | `GeoHeatmapMap` (static GeoJSON) |
| `map_temporal` | `GeoHeatmapMap` (with time-series data) |
| `time_series` | Chart, configured via `chart_configs` |
| `generic` | Chart, configured via `chart_configs` |
| `error` | Error state |

### `layer_id` + `layer_label` — identify the layer

| Field | Type | Required | Description |
|---|---|---|---|
| `layer_id` | `string` | ✅ | Stable machine identifier for the layer, e.g. `"temperature"`, `"taxi"`, `"pm25"`. Used as the key in the Dashboard `layers` state and as the prefix for all Mapbox source/layer IDs. |
| `layer_label` | `string` | ✅ | Human-readable name shown in the `LayerToggle` panel, e.g. `"Air Temperature"`, `"Taxi Availability"`. |

Each response **upserts** its `layer_id` in the Dashboard state — sending a second temperature query updates the `"temperature"` layer in place; it does not remove the `"taxi"` layer.

Full request/response schema: [apis-data-contract.md](apis-data-contract.md)

---

## Project Structure

```
civic-frontend/
├── app/
│   ├── api/chat/              # Chat API route
│   ├── dashboard/
│   │   └── page.tsx           # Split layout + visualization_type routing
│   ├── geodata-chat/          # Geo data chat page
│   └── taxi-heatmap/
│       └── page.tsx           # Standalone map page
├── components/
│   ├── ChatPanel.tsx          # Chat UI + backend integration
│   ├── GeoHeatmapMap.tsx      # Map visualisation component (multi-layer)
│   └── LayerToggle.tsx        # Floating layer visibility toggle panel
├── types/
│   └── taxi.ts                # TypeScript type definitions
├── public/
└── docs/
    ├── README.md              # Design overview (this file)
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


### 1. Install Dependencies

Key packages (already included):

| Package | Purpose |
|---|---|
| `mapbox-gl` | Map rendering |
| `@types/mapbox-gl` | TypeScript definitions |
| `ai` | Vercel AI SDK |
| `@ai-sdk/react` | React hooks for AI |
| `lucide-react` | Modern icons |


---

## Features

### Chat Interface (Dashboard — Left Panel)

- Modern message bubbles (user + assistant)
- Real-time backend API integration
- Quick suggestion buttons
- Loading states and error handling
- Session-based conversations

### Visualisation Panel (Dashboard — Right Panel / Standalone Page)

- **Map view** — dynamic heatmap, zoom-based layer switching (heatmap → clusters → individual points), interactive popups
- **Temporal map view** — coloured station points driven by time-series data; time slider below the map with play/pause, scrubbing, and smooth per-frame value interpolation
- **Multi-layer map** — multiple chat responses coexist on the same map, each in its own named layer; a floating `LayerToggle` panel controls per-layer visibility
- **Chart view** — line, bar, scatter, and other chart types driven by the `chart_configs` returned by the backend
- Automatically selects the right visualisation based on `visualization_type` in the API response
- New chat responses upsert their `layer_id` — existing layers are preserved
- Updates instantly from chat responses (dashboard mode)
- Auto-refresh on a configurable interval (standalone mode)
- Supports multiple data types (taxi availability, weather, air quality, etc.)

---

## Chat Examples

Try these queries in the dashboard chat:

- "Show me the air temperature for today"
- "What's the current taxi availability?"
- "Show me PM2.5 readings across Singapore"
- "How many taxis are available right now?"
- Any natural-language question about environment, transport, or urban data

---

## Customisation

### Adjust Zoom Thresholds

Edit `components/GeoHeatmapMap.tsx`:

```tsx
const updateVisualizationMode = useCallback((zoom: number) => {
  if (zoom < 10) {
    mode = 'heatmap';
  } else if (zoom < 13) {
    mode = 'clusters';
  } else {
    mode = 'points';
  }
}, []);
```

Remember to update corresponding `minzoom` and `maxzoom` properties on each layer as well.


