# Civic Frontend — Design Overview

A chat-driven dashboard built with Next.js. The user types a natural-language query; the backend returns a plain-English answer and structured GeoJSON data; the right panel renders the appropriate visualisation — map with point clusters, heatmap, or individual markers.

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
│  │  - Messages  │  │    (Mapbox map with taxi points)   ││
│  │  - Input     │  │                                    ││
│  │  - API call  │  │                                    ││
│  │              │  │                                    ││
│  └──────────────┘  └────────────────────────────────────┘│
│         │                        ↑                        │
│         └────────────────────────┘                        │
│  answer + data.locations drive the panel                  │
└──────────────────────────────────────────────────────────┘
```

### Data Flow

1. User types a query → `ChatPanel` sends `POST /api/v1/query` to the backend
2. Backend returns `{ answer, data, metadata }`
3. `ChatPanel` displays `answer` as the assistant message
4. `data.locations` (GeoJSON FeatureCollection) is passed to `GeoHeatmapMap` for rendering
5. The visualisation panel updates without page navigation

---

## Visualisation Mode

### Map — GeoJSON point data

Automatically switches layers based on zoom level:

| Zoom Level | Mode | Description |
|---|---|---|
| **< 12** | Heatmap | Colour-coded density map (blue → red) |
| **12 – 14** | Clusters | Grouped markers with counts (blue < 100, yellow < 750, pink 750+) |
| **≥ 15** | Points | Individual data points — click for details |

---

## Components

### ChatPanel (`components/ChatPanel.tsx`)

Responsible for all user interaction: sending queries, displaying the conversation, and forwarding response data up to the parent page.

| Prop | Type | Required | Description |
|---|---|---|---|
| `onDataReceived` | `(data: ApiResponse) => void` | Yes | Called with the full backend response; parent uses it to update the visualisation panel |
| `backendUrl` | `string` | No | Backend API endpoint; defaults to `NEXT_PUBLIC_BACKEND_URL` |

### Map Visualisation Component (`components/GeoHeatmapMap.tsx`)

Renders GeoJSON point data on a Mapbox map. Automatically switches between heatmap, cluster, and individual point layers based on zoom level.

| Prop | Type | Required | Default | Description |
|---|---|---|---|---|
| `mapboxToken` | `string` | Yes | — | Mapbox GL access token |
| `geojson` | `GeoJSON FeatureCollection` | No | `null` | Point features to render on the map |
| `autoRefresh` | `boolean` | No | `true` | Enable periodic data refresh (standalone mode) |
| `refreshInterval` | `number` | No | `30000` | Refresh interval in milliseconds |

### Dashboard Page (`app/dashboard/page.tsx`)

Owns the split layout. Passes `data.locations` from the latest chat response into `GeoHeatmapMap`. Handles missing configuration (e.g. no Mapbox token) and shows a live-data indicator badge.

---

## API Contract

The visualisation panel is data-driven by the backend response fields:

| Field | Used for |
|---|---|
| `answer` | Displayed as the assistant chat message |
| `data.locations` | GeoJSON FeatureCollection rendered on the map |
| `data.zone` | Displayed as context in the chat message or map title |
| `data.taxi_count` | Shown in the chat message summary |
| `data.snapshot_time` | Shown as the data timestamp |

Full request/response schema: [apis-data-contract.md](apis-data-contract.md)

---

## Project Structure

```
civic-frontend/
├── app/
│   ├── api/chat/              # Chat API route
│   ├── dashboard/
│   │   └── page.tsx           # Split layout + visualisation routing
│   └── taxi-heatmap/
│       └── page.tsx           # Standalone map page
├── components/
│   ├── ChatPanel.tsx          # Chat UI + backend integration
│   └── GeoHeatmapMap.tsx      # Map visualisation component
├── types/
│   └── taxi.ts                # TypeScript type definitions
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

- **Map view** — dynamic heatmap, zoom-based layer switching (heatmap → clusters → individual points), interactive popups
- Updates instantly from chat responses
- Auto-refresh on a configurable interval (standalone mode)

---

## Chat Examples

Try these queries in the dashboard chat:

- "How many taxis are in Punggol?"
- "Show taxi availability in Jurong"
- Any natural-language question about taxi availability by zone

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
