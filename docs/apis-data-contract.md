# Civic App — API Contract

> **Cross-repo docs** — when updating this file, also check:
> - `civic-app` → `design-docs/MVP-taxi-spatial-qa.md` — defines the same `POST /api/v1/query` contract and response passthrough
> - `gov-data` → `docs/design-doc.md` — upstream source of `SpatialQueryData`, `TimelineData`, `ZoneGeometryData` shapes
> - `gov-data` → `docs/zone-init-design.md` — zone names and categories referenced by `ZoneGeometryData`
> - Full index: `civic-frontend/docs/cross-repo-index.md`

> Defines every REST endpoint, request/response shapes, and error semantics.

## Table of Contents

- [Base URL](#base-url)
- [Endpoints](#endpoints)
    - [POST /api/v1/query](#post-apiv1query)
- [Models](#models)
    - [QueryRequest](#queryrequest)
    - [QueryResponse](#queryresponse)
    - [Data Union (tagged)](#data-union-tagged)
        - [SpatialQueryData](#spatialquerydata)
        - [TimelineData](#timelinedata)
        - [ZoneGeometryData](#zonegeometrydata)
    - [Context Union (tagged)](#context-union-tagged)
    - [GeoJSON Types](#geojson-types)
- [Error Handling](#error-handling)

---

## Base URL

```
http://localhost:8000      # local development
https://<deployed-host>    # production
```

---

## Endpoints

### `POST /api/v1/query`

Process a natural-language query and return a plain-English answer along with structured data.

**Request**

```jsonc
// Content-Type: application/json
{
  "query": "how many taxis are near changi airport?"   // required
}
```

**Response — success (spatial query)**

The `data` field is the same tagged union returned by the underlying gov-data service (see [Data Union](#data-union-tagged)).

```json
{
  "answer": "There are 42 taxis within 3 km of Changi Airport as of 08:00 SGT.",
  "data": {
    "type": "spatial_query",
    "taxi_count": 42,
    "snapshot_time": "2026-02-28T08:00:00+08:00",
    "context": { "type": "radius", "lat": 1.3644, "lon": 103.9915, "radius_m": 3000 },
    "locations": {
      "type": "FeatureCollection",
      "features": [
        { "type": "Feature", "geometry": { "type": "Point", "coordinates": [103.992, 1.361] }, "properties": null },
        { "type": "Feature", "geometry": { "type": "Point", "coordinates": [103.987, 1.365] }, "properties": null }
      ]
    }
  },
  "metadata": {
    "execution_time_ms": 24060
  }
}
```

**Response — success (timeline query)**

Timeline responses return metadata only (no geometry). Spatial data for each snapshot is fetched as Mapbox Vector Tiles from the gov-data tile endpoint (see [Snapshot Tile Endpoint](#snapshot-tile-endpoint-mvt)).

```json
{
  "answer": "Here is the taxi activity near CBD from 08:00 to 09:00 SGT.",
  "data": {
    "type": "timeline",
    "from_time": "2026-02-28T08:00:00+08:00",
    "to_time": "2026-02-28T09:00:00+08:00",
    "context": { "type": "zone", "zone_name": "cbd", "category": "district" },
    "snapshots": [
      { "snapshot_id": 1001, "timestamp": "2026-02-28T08:00:00+08:00", "taxi_count": 3200 },
      { "snapshot_id": 1002, "timestamp": "2026-02-28T08:01:00+08:00", "taxi_count": 3215 }
    ]
  },
  "metadata": {
    "execution_time_ms": 312
  }
}
```

---

## Models

### `QueryRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | `str` | Yes | Natural-language query from user |

### `QueryResponse`

| Field | Type | Description |
|-------|------|-------------|
| `answer` | `str` | Plain-English answer generated for the query |
| `data` | `SpatialQueryData \| TimelineData \| ZoneGeometryData \| null` | Structured response data — shape determined by `data.type` discriminator |
| `metadata` | `object` | Request execution metadata |
| `metadata.execution_time_ms` | `number` | Time taken to process the request in milliseconds |

---

### Data Union (tagged)

The `data` field is a **tagged union**. Read `data.type` to determine the shape:

| `data.type` | Shape | Triggered by |
|---|---|---|
| `spatial_query` | [SpatialQueryData](#spatialquerydata) | Zone, radius, nearest, polygon, road, or route queries |
| `timeline` | [TimelineData](#timelinedata) | Historical / recent activity queries |
| `zone_geometry` | [ZoneGeometryData](#zonegeometrydata) | Zone boundary queries |

---

#### `SpatialQueryData`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"spatial_query"` | Discriminator |
| `taxi_count` | `number` | Number of taxis matching the query |
| `snapshot_time` | `str` | ISO-8601 timestamp of the data snapshot |
| `context` | `QueryContext` | Query parameters — see [Context Union](#context-union-tagged) |
| `locations` | `GeoJSON FeatureCollection` | One `Point` feature per taxi; `properties` may be `null` or contain `distance_m` |

Example:

```json
{
  "type": "spatial_query",
  "taxi_count": 187,
  "snapshot_time": "2026-02-28T08:00:00+08:00",
  "context": { "type": "zone", "zone_name": "tampines", "category": "district" },
  "locations": {
    "type": "FeatureCollection",
    "features": [
      { "type": "Feature", "geometry": { "type": "Point", "coordinates": [103.820, 1.352] }, "properties": null }
    ]
  }
}
```

---

#### `TimelineData`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"timeline"` | Discriminator |
| `from_time` | `str` | ISO-8601 start of the window |
| `to_time` | `str` | ISO-8601 end of the window |
| `context` | `QueryContext \| null` | Query parameters when a spatial filter was applied (e.g. zone); `null` when unfiltered — see [Context Union](#context-union-tagged) |
| `window_minutes` | `number` | *(Recent-activity only)* Lookback window in minutes |
| `snapshots` | `SnapshotEntry[]` | Ordered list of per-minute snapshots |

##### `SnapshotEntry`

| Field | Type | Description |
|-------|------|-------------|
| `snapshot_id` | `number` | Unique snapshot identifier — used to fetch MVT tiles |
| `timestamp` | `str` | ISO-8601 timestamp of this snapshot |
| `taxi_count` | `number` | Taxi count at this snapshot (filtered by zone when applicable) |

> **Note**: `locations` (GeoJSON FeatureCollection) has been removed from `SnapshotEntry`. Spatial data is now served per-snapshot as Mapbox Vector Tiles via the gov-data tile endpoint (see below).

---

### Snapshot Tile Endpoint (MVT)

Taxi positions for a specific snapshot are served as Mapbox Vector Tiles directly from the gov-data Java service (not through civic-app).

```
GET {JAVA_BACKEND_URL}/tiles/taxis/{snapshotId}/{z}/{x}/{y}.pbf
```

| Param | Type | Source | Description |
|-------|------|--------|-------------|
| `snapshotId` | `number` | path | Snapshot ID from `SnapshotEntry.snapshot_id` |
| `z` | `number` | path | Tile zoom level (0–22) |
| `x` | `number` | path | Tile column index |
| `y` | `number` | path | Tile row index |
| `zone` | `string` | query (optional) | Filter positions to a named zone |

- **Response**: Binary MVT (`application/x-protobuf`)
- **Layer name**: `taxis`
- **Caching**: `Cache-Control: max-age=300`

The `z`, `x`, `y` parameters follow the [slippy map tile](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames) convention. Mapbox GL JS computes these automatically based on the user's viewport and zoom level — the frontend only provides the URL template:

```typescript
map.addSource('timeline-taxis', {
  type: 'vector',
  tiles: [`${javaBackendUrl}/tiles/taxis/${snapshotId}/{z}/{x}/{y}.pbf?zone=cbd`],
});
```

When the user scrubs the timeline slider, the frontend swaps the tile source URL to point to the new `snapshotId`.

---

#### `ZoneGeometryData`

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"zone_geometry"` | Discriminator |
| `name` | `str` | Zone name (e.g. `"tampines"`, `"aye"`) |
| `category` | `"district" \| "road" \| "highway"` | Zone category |
| `geometry` | `GeoJSON Geometry` | `Polygon` for districts; `LineString` for roads/highways |

---

### Context Union (tagged)

Nested inside `SpatialQueryData.context`. Read `context.type`:

| `context.type` | Fields |
|---|---|
| `radius` | `lat`, `lon`, `radius_m` |
| `nearest` | `lat`, `lon`, `limit` |
| `zone` | `zone_name`, `category` |
| `polygon` | `polygon` (GeoJSON Polygon) |
| `road` | `road_name`, `category`, `buffer_m` |
| `route` | `route` (GeoJSON LineString), `buffer_m` |

---

### GeoJSON Types

#### Feature (taxi location)

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [longitude, latitude]
  },
  "properties": null
}
```

For nearest-taxi queries, `properties` includes `distance_m`:

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [103.820, 1.352] },
  "properties": { "distance_m": 123.4 }
}
```

---

## Error Handling

Errors are returned as non-2xx HTTP responses or within the response body.

**Error body shape**:

```json
{
  "answer": "I was unable to process your query due to an upstream error.",
  "data": null,
  "metadata": { "execution_time_ms": 120 },
  "error": {
    "code": "UPSTREAM_ERROR",
    "message": "gov-data service unavailable",
    "details": {}
  }
}
```

| Scenario | HTTP Status | `error.code` |
|----------|-------------|--------------|
| Upstream gov-data service unavailable | 502 | `UPSTREAM_ERROR` |
| Unknown zone / no snapshot at `datetime` | 404 | `NOT_FOUND` |
| Invalid coordinates or radius ≤ 0 | 400 | `VALIDATION_ERROR` |
| Malformed request body | 422 | `BAD_REQUEST` |
| Unrecognised query intent | 200 | — (`answer` explains; `data` is `null`) |
