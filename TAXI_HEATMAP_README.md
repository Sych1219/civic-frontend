# Taxi Heatmap Visualization

A Next.js application that visualizes real-time taxi availability in Singapore using Mapbox GL JS with intelligent zoom-based layer switching.

## Features

- **Multi-zoom visualization modes:**
  - 🔥 **Heatmap** (zoom < 12): High-level density visualization
  - 🔵 **Clusters** (zoom 12-15): Grouped taxi points with counts
  - 📍 **Individual Points** (zoom ≥ 15): Precise taxi locations with popups

- **Real-time updates:** Data refreshes every 30 seconds
- **Interactive UI:** Click on individual taxis to see location details
- **Performance optimized:** Client-side clustering and efficient layer switching
- **Responsive design:** Works on desktop and mobile

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Mapping:** Mapbox GL JS
- **Styling:** Tailwind CSS
- **Data Source:** Local GeoJSON from taxi.json

## Prerequisites

- Node.js 20+ 
- npm or yarn
- Mapbox access token (free tier available)

## Setup Instructions

### 1. Install Dependencies

First, install the required packages:

```bash
npm install mapbox-gl
npm install --save-dev @types/mapbox-gl
```

### 2. Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your Mapbox token:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoieW91ci11c2VybmFtZSIsImEiOiJjbHh4eHh4eHgifQ.xxxxxxxxxxxxx
```

**Get your Mapbox token:**
1. Go to [https://account.mapbox.com/access-tokens/](https://account.mapbox.com/access-tokens/)
2. Sign up or log in
3. Create a new token or use your default public token
4. Copy the token starting with `pk.`

### 3. Start Development Server

```bash
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000)

### 4. Access the Taxi Heatmap

Navigate to: [http://localhost:3000/taxi-heatmap](http://localhost:3000/taxi-heatmap)

## Project Structure

```
civic-frontend/
├── app/
│   ├── taxi-heatmap/
│   │   └── page.tsx              # Main page component
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── TaxiHeatmapMap.tsx        # Reusable map component
├── types/
│   └── taxi.ts                   # TypeScript type definitions
├── public/
│   └── taxi.json                 # Taxi data source
├── .env.local.example            # Environment variable template
└── package.json
```

## Component Usage

The `TaxiHeatmapMap` component is reusable. You can import it in any page:

```tsx
import TaxiHeatmapMap from '@/components/TaxiHeatmapMap';

export default function MyPage() {
  return (
    <div className="h-screen">
      <TaxiHeatmapMap 
        mapboxToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''}
        refreshInterval={30000} // Optional: default is 30s
      />
    </div>
  );
}
```

## Visualization Layers Explained

### 1. Heatmap Layer (Low Zoom)
- **Active:** Zoom levels 0-12
- **Purpose:** Shows taxi density across large areas
- **Visual:** Color gradient from blue (low) to red (high density)
- **Use case:** Understanding city-wide taxi distribution

### 2. Cluster Layer (Mid Zoom)
- **Active:** Zoom levels 12-15
- **Purpose:** Groups nearby taxis into clusters
- **Visual:** Colored circles with taxi count labels
  - Blue: Small clusters (< 100 taxis)
  - Yellow: Medium clusters (100-750 taxis)
  - Pink: Large clusters (750+ taxis)
- **Use case:** Identifying high-concentration areas

### 3. Individual Points (High Zoom)
- **Active:** Zoom level 15+
- **Purpose:** Shows exact taxi locations
- **Visual:** Blue circular markers
- **Interaction:** Click any point to see:
  - Precise coordinates (lat/lng)
  - Timestamp of data
- **Use case:** Finding specific available taxis

## Data Flow

1. **Initial Load:**
   - Fetches `/taxi.json` on component mount
   - Transforms MultiPoint to individual Point features for clustering
   - Initializes map with Singapore center (103.8198°E, 1.3521°N)

2. **Refresh Cycle:**
   - Every 30 seconds, fetches updated data
   - Updates GeoJSON source using `setData()` (no layer re-creation)
   - Displays last updated time in UI

3. **Error Handling:**
   - Network errors shown in red notification banner
   - Console warnings for debugging
   - Map continues to display cached data on fetch failure

## Customization

### Change Refresh Interval

```tsx
<TaxiHeatmapMap 
  mapboxToken={token}
  refreshInterval={60000} // 60 seconds
/>
```

### Adjust Zoom Thresholds

Edit in [TaxiHeatmapMap.tsx](components/TaxiHeatmapMap.tsx):

```tsx
// Line ~78
const updateVisualizationMode = useCallback((zoom: number) => {
  if (zoom < 10) {        // Change from 12
    mode = 'heatmap';
  } else if (zoom < 13) { // Change from 15
    mode = 'clusters';
  } else {
    mode = 'points';
  }
}, []);
```

Also update layer `minzoom`/`maxzoom` properties accordingly.

### Change Map Style

Edit in [TaxiHeatmapMap.tsx](components/TaxiHeatmapMap.tsx) line ~99:

```tsx
style: 'mapbox://styles/mapbox/streets-v12', // or 'light-v11', 'satellite-v9', etc.
```

[Browse Mapbox styles](https://docs.mapbox.com/api/maps/styles/)

## Performance Considerations

- **Clustering:** Enabled up to zoom 14 to reduce rendering load
- **Layer switching:** Uses zoom-based visibility to show only active layers
- **Data refresh:** Uses `setData()` instead of re-adding source/layers
- **Memory management:** Cleans up intervals and map instance on unmount

## Troubleshooting

### Map doesn't load
- ✅ Check `.env.local` has correct `NEXT_PUBLIC_MAPBOX_TOKEN`
- ✅ Verify token is valid at Mapbox dashboard
- ✅ Check browser console for errors
- ✅ Ensure token starts with `pk.`

### Data not updating
- ✅ Check `/taxi.json` is accessible at `http://localhost:3000/taxi.json`
- ✅ Verify file is in `public/` directory
- ✅ Check browser network tab for 404 errors

### TypeScript errors
- ✅ Install types: `npm install --save-dev @types/mapbox-gl`
- ✅ Verify `tsconfig.json` has `"jsx": "preserve"` and `"moduleResolution": "bundler"`

### Build errors
- ✅ Ensure component is marked `'use client'` (line 1)
- ✅ Check all imports are correct
- ✅ Run `npm run build` to test production build

## Production Deployment

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables

Ensure your hosting platform (Vercel, Netlify, etc.) has:

```
NEXT_PUBLIC_MAPBOX_TOKEN=your_production_token
```

### Vercel Deployment

1. Push code to GitHub
2. Import project in Vercel dashboard
3. Add environment variable in project settings
4. Deploy automatically

## API Reference

### TaxiHeatmapMap Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `mapboxToken` | `string` | ✅ Yes | - | Mapbox GL access token |
| `refreshInterval` | `number` | ❌ No | `30000` | Data refresh interval (ms) |

### Data Format

The component expects `taxi.json` in this format:

```typescript
{
  status: "success",
  data: {
    geojson: {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: {
          type: "MultiPoint",
          coordinates: [[lng, lat], ...]
        },
        properties: { ... }
      }]
    }
  }
}
```

## License

MIT

## Support

For issues or questions:
- Check [Mapbox GL JS Documentation](https://docs.mapbox.com/mapbox-gl-js/)
- Review [Next.js App Router docs](https://nextjs.org/docs/app)
- Open an issue in this repository
