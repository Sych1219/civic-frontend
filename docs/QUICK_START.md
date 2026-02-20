# 🚕 Taxi Heatmap - Quick Start Guide

## What Was Created

✅ **Components:**
- `components/TaxiHeatmapMap.tsx` - Main map component with heatmap/cluster/point layers
- `app/taxi-heatmap/page.tsx` - Page route at `/taxi-heatmap`
- `types/taxi.ts` - TypeScript type definitions

✅ **Configuration:**
- `.env.local.example` - Environment variable template
- `TAXI_HEATMAP_README.md` - Full documentation

✅ **Dependencies installed:**
- `mapbox-gl` - Mapbox GL JS library
- `@types/mapbox-gl` - TypeScript definitions

## 🚀 To Run the App

### 1. Configure Mapbox Token

Create `.env.local` file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your token:

```env
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_actual_token_here
```

**Get token:** [https://account.mapbox.com/access-tokens/](https://account.mapbox.com/access-tokens/)

### 2. Start the Server

```bash
npm run dev
```

### 3. View the Map

Open: **http://localhost:3000/taxi-heatmap**

## 📊 How It Works

### Zoom-Based Visualization

| Zoom Level | Mode | What You See |
|------------|------|--------------|
| **< 12** | 🔥 **Heatmap** | Color-coded density map (blue → red) |
| **12-15** | 🔵 **Clusters** | Grouped points with counts |
| **≥ 15** | 📍 **Points** | Individual taxis (click for details) |

### Features

- ✅ Auto-refresh every 30 seconds
- ✅ Real-time layer switching as you zoom
- ✅ Interactive popups on individual taxis
- ✅ Legend showing current mode
- ✅ Last updated timestamp
- ✅ Error handling with user notifications
- ✅ Loading states
- ✅ Navigation controls (zoom, rotation)

## 🎨 UI Elements

**Top-right panel shows:**
- Current visualization mode
- Zoom level
- Legend for all three modes
- Last updated time

**Click on taxi points (zoom ≥ 15) to see:**
- Precise lat/lng coordinates
- Timestamp

## 📁 File Overview

```
/app/taxi-heatmap/page.tsx          → Page wrapper
/components/TaxiHeatmapMap.tsx      → Main map logic
/types/taxi.ts                      → Type definitions
/public/taxi.json                   → Data source
/.env.local                         → Your config (create this!)
```

## 🔧 Customization

### Change refresh interval:

```tsx
<TaxiHeatmapMap 
  mapboxToken={token}
  refreshInterval={60000} // 60 seconds instead of 30
/>
```

### Change zoom thresholds:

Edit `TaxiHeatmapMap.tsx` line ~78:

```tsx
if (zoom < 10) {        // was 12
  mode = 'heatmap';
} else if (zoom < 13) { // was 15
  mode = 'clusters';
}
```

### Change map style:

Edit `TaxiHeatmapMap.tsx` line ~99:

```tsx
style: 'mapbox://styles/mapbox/streets-v12' 
// Options: streets-v12, light-v11, dark-v11, satellite-v9
```

## ⚠️ Troubleshooting

**Map not loading?**
- Check `.env.local` has correct token
- Token must start with `pk.`
- Restart dev server after adding env var

**Data not showing?**
- Verify `taxi.json` is in `public/` folder
- Check browser console for errors
- Try zoom level 11 to see heatmap

**TypeScript errors?**
- Run: `npm install --save-dev @types/mapbox-gl` (already done)
- Check imports in component files

## 📖 Full Documentation

See [TAXI_HEATMAP_README.md](./TAXI_HEATMAP_README.md) for:
- Detailed API reference
- Architecture explanation
- Performance considerations
- Production deployment guide
- Advanced customization

## ✨ Next Steps

1. Get Mapbox token → [mapbox.com/access-tokens](https://account.mapbox.com/access-tokens/)
2. Add to `.env.local`
3. Run `npm run dev`
4. Visit `http://localhost:3000/taxi-heatmap`
5. Zoom in/out to see different visualizations! 🎉

---

**Need help?** Check `TAXI_HEATMAP_README.md` for detailed docs.
