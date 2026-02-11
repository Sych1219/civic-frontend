# 🚕 Taxi Chat Dashboard - Quick Setup

## What I Built For You

A modern **chat-driven taxi visualization system** with:

### 🎨 Left Panel: Chat Interface
- Modern message bubbles (user + assistant)
- Real-time backend API integration
- Quick suggestion buttons
- Loading states & error handling
- Session-based conversations

### 🗺️ Right Panel: Interactive Map
- Heatmap at low zoom
- Clusters at mid zoom  
- Individual points at high zoom
- Updates instantly from chat responses
- Live data indicator

---

## 🚀 Quick Start (3 Steps)

### 1️⃣ Verify Your Environment

Your `.env.local` already has the Mapbox token. Just verify:

```bash
cat .env.local
```

Should show:
```
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000/api/query
```

✅ **Done!** Both variables are set.

### 2️⃣ Start Your Backend

Make sure your FastAPI backend is running on port 8000:

```bash
# In your backend directory
python main.py  # or uvicorn main:app --reload
```

**Test it:**
```bash
curl --location 'http://localhost:8000/api/query' \
--header 'Content-Type: application/json' \
--data '{
    "query": "What'\''s the current taxi status?",
    "session_id": "test-123",
    "context": {}
}'
```

Should return JSON like `public/taxi.json`.

### 3️⃣ Start Frontend

```bash
npm run dev
```

Open: **http://localhost:3000/dashboard**

---

## 💬 Try These Chat Queries

Once the dashboard loads, try:

1. **"What's the current taxi status?"**
2. **"Show me available taxis"**
3. **"How many taxis are available?"**

The map will update automatically! 🎉

---

## 🎯 How It Works

```
User types query
     ↓
ChatPanel sends to backend
     ↓
Backend returns taxi data
     ↓
ChatPanel shows message
     ↓
Data sent to map
     ↓
Map updates visualization
```

---

## 📦 What Was Installed

✅ `ai` - Vercel AI SDK (for chat)
✅ `@ai-sdk/react` - React hooks
✅ `lucide-react` - Modern icons
✅ `mapbox-gl` - Map rendering (already had this)

---

## 🎨 Map Controls

**Zoom to see different views:**

| Zoom Level | What You See |
|------------|-------------|
| 0-11 | 🔥 **Heatmap** - Color gradient showing taxi density |
| 12-14 | 🔵 **Clusters** - Grouped markers with counts |
| 15+ | 📍 **Points** - Individual taxis (click for details) |

---

## 🛠️ Files Created

### New Components:
1. **`components/ChatPanel.tsx`** - Chat interface with backend integration
2. **`app/dashboard/page.tsx`** - Main dashboard with split layout

### Modified:
3. **`components/TaxiHeatmapMap.tsx`** - Now accepts external data from chat

### Configuration:
4. **`.env.local`** - Added `NEXT_PUBLIC_BACKEND_URL`
5. **`.env.local.example`** - Updated template

### Documentation:
6. **`DASHBOARD_README.md`** - Full documentation
7. **This file** - Quick start guide

---

## ⚙️ Configuration

All settings are in `.env.local`:

```env
# Your Mapbox token (already set)
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...

# Backend endpoint (change if needed)
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000/api/query
```

After changing `.env.local`, **restart the dev server**.

---

## 🎯 UI Features

### Chat Panel:
- ✅ Modern gradient background
- ✅ Smooth message animations
- ✅ Quick suggestion chips
- ✅ Real-time typing indicators
- ✅ Timestamp on every message
- ✅ Taxi count badges in responses

### Map Panel:
- ✅ Three visualization modes
- ✅ Auto zoom-based switching
- ✅ Live data badge overlay
- ✅ Interactive popups
- ✅ Legend & current mode indicator

---

## 🐛 Troubleshooting

### "Cannot connect to backend"
```bash
# Check backend is running
curl http://localhost:8000/api/query

# Check CORS is enabled in backend
# FastAPI example:
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["POST"],
    allow_headers=["*"],
)
```

### "Map not loading"
- ✅ Check Mapbox token in `.env.local`
- ✅ Restart dev server: `Ctrl+C` then `npm run dev`

### "Data not updating on map"
- ✅ Check browser console for errors
- ✅ Verify backend response format matches `taxi.json`

---

## 📱 Responsive Design

The dashboard is optimized for:
- 💻 Desktop (1920x1080+)
- 💻 Laptop (1440x900+)

For mobile support, you'd need to add:
- Collapsible chat panel
- Touch gestures for map
- Responsive breakpoints

---

## 🎨 Customization Examples

### Change Chat Width:

Edit `app/dashboard/page.tsx`:
```tsx
<div className="w-[400px]">  {/* Change to w-[500px] */}
```

### Change Theme Colors:

Edit `components/ChatPanel.tsx`:
```tsx
// User messages
bg-blue-500  → bg-purple-500

// Assistant messages  
bg-slate-100 → bg-green-50

// Header
bg-blue-500  → bg-indigo-500
```

### Add More Quick Suggestions:

Edit `components/ChatPanel.tsx` around line 220:
```tsx
<button onClick={() => setInput("Your new query")}>
  New Button
</button>
```

---

## 🚀 Next Steps

You can now:

1. **Test with real queries** - Type in the chat!
2. **Zoom the map** - See different visualizations
3. **Customize the UI** - Colors, sizes, etc.
4. **Add features** - Export chat, save sessions, etc.

---

## 📖 Full Documentation

See [`DASHBOARD_README.md`](./DASHBOARD_README.md) for:
- Complete API reference
- Architecture diagrams
- Production deployment guide
- Advanced customization
- Troubleshooting tips

---

## ✨ Demo Flow

1. Open http://localhost:3000/dashboard
2. See the chat interface on the left
3. Click "Current status" suggestion OR type your own query
4. Watch the message appear
5. See the assistant respond with taxi count
6. **Watch the map update automatically!** 🎉
7. Zoom in/out to see different views

---

## 🎉 You're Ready!

Run `npm run dev` and open http://localhost:3000/dashboard

Enjoy your modern taxi chat dashboard! 🚕✨
