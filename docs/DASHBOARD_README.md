# Taxi Chat Dashboard

A modern chat interface integrated with real-time taxi heatmap visualization.

## Features

✅ **Chat Interface** (Left Panel)
- Modern UI with message bubbles
- Real-time backend integration
- Quick suggestion buttons
- Loading states and error handling
- Session-based conversations

✅ **Interactive Map** (Right Panel)
- Dynamic heatmap visualization
- Zoom-based layer switching (heatmap → clusters → individual points)
- Updates based on chat responses
- Real-time taxi availability display

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Dashboard Page (Split Layout)                  │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │              │  │                          │ │
│  │  ChatPanel   │  │    TaxiHeatmapMap        │ │
│  │              │  │                          │ │
│  │  - Messages  │  │    - Heatmap Layer       │ │
│  │  - Input     │  │    - Cluster Layer       │ │
│  │  - API call  │  │    - Point Layer         │ │
│  │              │  │                          │ │
│  └──────────────┘  └──────────────────────────┘ │
│         │                     ↑                  │
│         └─────────────────────┘                  │
│           Data flows from chat to map            │
└─────────────────────────────────────────────────┘
```

## Setup

### 1. Install Dependencies

Already installed:
- ✅ `ai` - Vercel AI SDK
- ✅ `@ai-sdk/react` - React hooks for AI
- ✅ `mapbox-gl` - Map rendering
- ✅ `lucide-react` - Modern icons

### 2. Configure Environment Variables

Edit `.env.local`:

```env
# Required: Get from https://account.mapbox.com/access-tokens/
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here

# Optional: Change if your backend runs on different port
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000/api/query
```

### 3. Start Backend API

Make sure your backend is running at `http://localhost:8000` with the endpoint:

```bash
POST /api/query
Content-Type: application/json

{
  "query": "What's the current taxi status?",
  "session_id": "uuid-session-123",
  "context": {}
}
```

Expected response format: Same as `public/taxi.json`

### 4. Run Development Server

```bash
npm run dev
```

### 5. Open Dashboard

Navigate to: **http://localhost:3000/dashboard**

## Usage

### Chat Commands

Try these queries in the chat:

- "What's the current taxi status?"
- "Show me available taxis"
- "How many taxis are available?"
- Any natural language question about taxi availability

### Map Interaction

**Zoom levels:**
- **< 12**: Heatmap view (color-coded density)
- **12-15**: Cluster view (grouped markers with counts)
- **≥ 15**: Individual points (click for details)

## Components

### ChatPanel (`components/ChatPanel.tsx`)

**Props:**
- `onDataReceived: (data: TaxiDataResponse) => void` - Callback when data received
- `backendUrl?: string` - Backend API endpoint (optional)

**Features:**
- Message history with timestamps
- Real-time loading indicators
- Error handling with user feedback
- Quick suggestion buttons
- Session management

### TaxiHeatmapMap (`components/TaxiHeatmapMap.tsx`)

**Props:**
- `mapboxToken: string` - Mapbox GL access token (required)
- `externalData?: TaxiDataResponse | null` - External data injection
- `autoRefresh?: boolean` - Enable/disable auto-refresh (default: true)
- `refreshInterval?: number` - Refresh interval in ms (default: 30000)

**Features:**
- Three visualization layers (heatmap/cluster/points)
- External data updates without re-initialization
- Zoom-based layer switching
- Interactive popups on points
- Legend and status indicators

### Dashboard Page (`app/dashboard/page.tsx`)

**Features:**
- Split-panel layout (400px chat + flexible map)
- Data flow orchestration between chat and map
- Configuration error handling
- Live data indicator badge

## API Integration

The chat sends requests to your backend:

```typescript
const response = await fetch(backendUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: userMessage.content,
    session_id: sessionId,
    context: {}
  }),
});

const data: TaxiDataResponse = await response.json();
```

## Customization

### Change Chat Width

Edit `app/dashboard/page.tsx`:

```tsx
<div className="w-[400px] ...">  {/* Change from 400px */}
  <ChatPanel ... />
</div>
```

### Change Backend URL

Option 1: Environment variable
```env
NEXT_PUBLIC_BACKEND_URL=https://api.example.com/query
```

Option 2: Component prop
```tsx
<ChatPanel backendUrl="https://api.example.com/query" />
```

### Customize Chat UI Colors

Edit `components/ChatPanel.tsx`:

```tsx
// User message bubble
className="bg-blue-500"  // Change color

// Assistant message bubble  
className="bg-slate-100"  // Change color

// Header icon background
className="bg-blue-500"  // Change color
```

### Enable Map Auto-Refresh

Edit `app/dashboard/page.tsx`:

```tsx
<TaxiHeatmapMap 
  autoRefresh={true}  // Enable
  refreshInterval={60000}  // Every 60s
  externalData={taxiData}
/>
```

## Troubleshooting

**Chat not connecting to backend:**
- ✅ Check backend is running on port 8000
- ✅ Verify CORS is enabled on backend
- ✅ Check browser console for network errors
- ✅ Verify endpoint URL in `.env.local`

**Map not showing:**
- ✅ Verify `NEXT_PUBLIC_MAPBOX_TOKEN` is set
- ✅ Token must start with `pk.`
- ✅ Restart dev server after env changes

**Data not updating on map:**
- ✅ Check backend response matches expected format
- ✅ Look for errors in browser console
- ✅ Verify `externalData` prop is being passed

**CORS errors:**
Add to your backend:
```python
# FastAPI example
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST"],
    allow_headers=["*"],
)
```

## File Structure

```
civic-frontend/
├── app/
│   ├── dashboard/
│   │   └── page.tsx              # Main dashboard with split layout
│   └── taxi-heatmap/
│       └── page.tsx              # Standalone map page
├── components/
│   ├── ChatPanel.tsx             # Chat UI component
│   └── TaxiHeatmapMap.tsx        # Map visualization component
├── types/
│   └── taxi.ts                   # TypeScript type definitions
├── public/
│   └── taxi.json                 # Sample taxi data
└── .env.local                    # Environment configuration
```

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **UI**: Tailwind CSS
- **Icons**: Lucide React
- **AI SDK**: Vercel AI SDK
- **Map**: Mapbox GL JS
- **HTTP**: Fetch API

## Production Deployment

1. Build the application:
```bash
npm run build
```

2. Set environment variables in hosting platform (Vercel/Netlify):
```
NEXT_PUBLIC_MAPBOX_TOKEN=your_production_token
NEXT_PUBLIC_BACKEND_URL=https://api.yourbackend.com/query
```

3. Deploy:
```bash
npm start
```

## Next Steps

- [ ] Add authentication for chat sessions
- [ ] Implement message persistence
- [ ] Add export/download chat history
- [ ] Support multiple visualization types
- [ ] Add real-time WebSocket updates
- [ ] Implement chat command shortcuts
- [ ] Add voice input support

## Support

For issues or questions:
- Check browser console for errors
- Verify backend API is responding
- Review [Mapbox GL JS docs](https://docs.mapbox.com/mapbox-gl-js/)
- Check [Next.js documentation](https://nextjs.org/docs)
