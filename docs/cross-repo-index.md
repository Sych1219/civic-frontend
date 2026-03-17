# Cross-Repo Documentation Index

> Single source of truth for documentation relationships across the three repos.
> When you change a doc, check this index to find what else might need updating.

---

## System Flow

```
gov-data (Java/Spring)          civic-app (Python/LangChain)        civic-frontend (Next.js)
─────────────────────           ────────────────────────────        ────────────────────────
PostGIS spatial queries    →    LLM ReAct agent + tool calls   →    Chat UI + map visualisation
Taxi data ingestion             NL → structured query               GeoJSON rendering
Zone geometry seeding           Strips {success,data,error}         Consumes {answer,data,metadata}
                                envelope → {answer,data,metadata}
```

---

## Document Registry

### gov-data — `/Users/sunyichun/IdeaProjects/gov-data/`

| Doc | Purpose |
|-----|---------|
| `docs/taxi-availability-design-doc.md` | System architecture, DB schema, all 10 REST endpoints (incl. MVT tile endpoint), response envelope, error codes |
| `docs/zone-init-design.md` | Zone table seeding (OneMap districts + OSM roads/highways), zone existence checks |

### civic-app — `/Users/sunyichun/PycharmProjects/civic-app/`

| Doc | Purpose |
|-----|---------|
| `design-docs/MVP-taxi-spatial-qa.md` | LLM agent design, query types, system prompt, API passthrough to frontend |
| `design-docs/full-scope/ARCH-taxi-spatial-qa.md` | Full-scope technical architecture (archived, superseded by MVP) |
| `design-docs/full-scope/PRD-taxi-spatial-qa.md` | Product requirements (archived, superseded by MVP) |

### civic-frontend — `/Users/sunyichun/WebstormProjects/civic-frontend/`

| Doc | Purpose |
|-----|---------|
| `docs/apis-data-contract.md` | Frontend–backend API contract: request/response shapes, error semantics |
| `docs/design.md` | Frontend architecture, components, visualisation modes, multi-layer support |

---

## Relationship Map

Each row is a shared concept. Columns show which doc in each repo owns or references that concept.
"—" means the concept does not appear in that repo's docs.

| Category | gov-data | civic-app | civic-frontend |
|----------|----------|-----------|----------------|
| **Endpoint URLs (gov-data)** — 9 JSON REST paths under `/api/v1/taxis/` + 1 MVT tile path under `/api/v1/tiles/` | `taxi-availability-design-doc.md` §4.1–4.10 (defines) | `MVP` §3 (endpoint column), §7.1 (endpoint table), §7.2 (ReAct trace) | `api-contract.md` §Snapshot Tile Endpoint (documents MVT tile URL from gov-data) |
| **Endpoint URL (civic-app)** — `POST /api/v1/query` | — | `MVP` §8 (defines) | `api-contract.md` §Endpoints (documents), `design.md` §Data Flow step 1 |
| **Endpoint query params** — `lat`, `lon`, `radius`, `limit`, `datetime`, `start`, `end`, `zone`, `buffer_m` | `taxi-availability-design-doc.md` §4.1–4.9 (defines param tables) | `MVP` §6.3 (UNITS conversion in system prompt), §7.1 (key-params column) | `api-contract.md` §Context Union (params echoed in `context` fields) |
| **`data.type` tagged union** — `spatial_query`, `timeline`, `zone_geometry` | `taxi-availability-design-doc.md` §4.0 (defines) | `MVP` §7.1 (documents passthrough) | `api-contract.md` §Data Union (documents), `design.md` §Visualisation Mode (drives rendering) |
| **`context.type` union** — `radius`, `nearest`, `zone`, `polygon`, `road`, `route` | `taxi-availability-design-doc.md` §4.0 (defines) | `MVP` §7.1 (documents) | `api-contract.md` §Context Union (documents), `design.md` §Layer Toggle (label derivation) |
| **Response envelope (gov-data)** — `{success, data, error}` | `taxi-availability-design-doc.md` §4.0 (defines) | `MVP` §7.1 (agent navigates to `data.*`; Python strips envelope) | — (never sees this envelope) |
| **Response envelope (civic-app)** — `{answer, data, metadata}` | — | `MVP` §8 (defines) | `api-contract.md` §QueryResponse (documents), `design.md` §Data Flow / §API Contract (consumes) |
| **Data model shapes** — `SpatialQueryData`, `TimelineData`, `ZoneGeometryData`, `SnapshotEntry` | `taxi-availability-design-doc.md` §4.1–4.9 (defines); `SnapshotEntry` now carries `snapshot_id` instead of `locations` | `MVP` §7.1 (documents `data` shape) | `api-contract.md` §Models (documents), `design.md` §Visualisation Mode (renders) |
| **MVT tile endpoint** — `GET /tiles/taxis/timeline/{z}/{x}/{y}.pbf?snapshots=&zone=` | `taxi-availability-design-doc.md` §4.7.2 (defines) | `MVP` §7.1 (references) | `api-contract.md` §Batched Timeline Tile Endpoint (documents); frontend calls gov-data directly for tiles |
| **Zone names & categories** — `district`, `road`, `highway` | `zone-init.md` §4 (defines catalog + seeding) | `MVP` §6.3 (PLANNING AREAS list in system prompt) | `api-contract.md` §ZoneGeometryData (`category` enum) |
| **Error codes** — `UPSTREAM_ERROR`, `NOT_FOUND`, `VALIDATION_ERROR`, `BAD_REQUEST` | `taxi-availability-design-doc.md` §8 (defines) | `MVP` §8 (maps/passes through) | `api-contract.md` §Error Handling (documents) |
| **GeoJSON structures** — FeatureCollection, Point, Polygon, LineString, `properties` | `taxi-availability-design-doc.md` §4.1–4.9 (defines in responses) | — (passthrough, no doc) | `api-contract.md` §GeoJSON Types (documents), `design.md` / `GeoHeatmapMap.tsx` (renders) |
| **Query types** — QT-01 through QT-09 | `taxi-availability-design-doc.md` §4.1–4.9 (one endpoint per type) | `MVP` §3 (defines type table), §6.3 (STEP ORDER routing) | `api-contract.md` (if new `data.type`/`context.type`), `design.md` (if new viz mode) |

---

## Shared Concepts — Change Checklists

### 1. `data.type` Tagged Union (`spatial_query` | `timeline` | `zone_geometry`)

Defined in gov-data, passed through by civic-app, consumed by civic-frontend.

**If you add or rename a `data.type` variant:**
- [ ] gov-data `docs/taxi-availability-design-doc.md` §4.0 — update union table and add endpoint section
- [ ] gov-data Java code — add new `TaxiResponseData` subtype
- [ ] civic-app `MVP-taxi-spatial-qa.md` §7.1 — update endpoint/data-shape table
- [ ] civic-app Python code — ensure new type passes through in response
- [ ] civic-frontend `apis-data-contract.md` — add new model section under Data Union
- [ ] civic-frontend `design.md` — add visualisation mode for new type
- [ ] civic-frontend TypeScript `types/api.ts` — add type definition
- [ ] civic-frontend `GeoHeatmapMap.tsx` — handle new rendering branch

### 2. Endpoint URLs and Paths

Two layers of endpoints: gov-data exposes 9 spatial REST endpoints, civic-app exposes 1 unified NL query endpoint to the frontend.

**If you rename, remove, or add a gov-data endpoint (e.g. `/api/v1/taxis/nearby` → `/api/v1/taxis/radius`):**
- [ ] gov-data `docs/taxi-availability-design-doc.md` §4.x — update endpoint path, params, and summary table (§4.10)
- [ ] gov-data Java code — update `TaxiController.java` `@RequestMapping`
- [ ] civic-app `MVP-taxi-spatial-qa.md` §3 — update endpoint column in query type table
- [ ] civic-app `MVP-taxi-spatial-qa.md` §6.3 — update STEP ORDER in system prompt (agent references endpoint paths)
- [ ] civic-app `MVP-taxi-spatial-qa.md` §7.1 — update endpoint table and example ReAct trace (§7.2)
- [ ] civic-app — no Python code change needed if using OpenAPI discovery (agent re-reads `/api-docs`), but verify system prompt doesn't hardcode old paths

**If you change gov-data endpoint query params (e.g. rename `radius` → `radius_m`, add required param):**
- [ ] gov-data `docs/taxi-availability-design-doc.md` §4.x — update param table
- [ ] civic-app `MVP-taxi-spatial-qa.md` §6.3 — update system prompt UNITS / STEP ORDER if param semantics change
- [ ] civic-app `MVP-taxi-spatial-qa.md` §7.1 — update endpoint key-params column
- [ ] civic-frontend `apis-data-contract.md` — update if param change affects `context` fields in response

**If you change the civic-app endpoint (`POST /api/v1/query`):**
- [ ] civic-app `MVP-taxi-spatial-qa.md` §8 — update endpoint definition
- [ ] civic-frontend `apis-data-contract.md` — update endpoint section and base URL
- [ ] civic-frontend `design.md` §Data Flow — update step 1 (`ChatPanel` sends to this URL)
- [ ] civic-frontend code — update `ChatPanel.tsx` fetch URL

### 3. `context.type` Union (`radius` | `nearest` | `zone` | `polygon` | `road` | `route`)

Nested inside `SpatialQueryData.context`. Defined in gov-data, echoed by civic-app, used by civic-frontend for labels.

**If you add or rename a `context.type`:**
- [ ] gov-data `docs/taxi-availability-design-doc.md` §4.0 — update context type table + add endpoint
- [ ] gov-data Java code — add new `QueryContext` subtype
- [ ] civic-app `MVP-taxi-spatial-qa.md` §3 — add query type row; §7.1 — add endpoint
- [ ] civic-app `MVP-taxi-spatial-qa.md` §6.3 — update STEP ORDER in system prompt
- [ ] civic-frontend `apis-data-contract.md` — update Context Union table
- [ ] civic-frontend `design.md` §API Contract — update if label derivation changes
- [ ] civic-frontend TypeScript `types/api.ts` — add context type

### 4. `QueryResponse` Envelope (`{answer, data, metadata}`)

civic-app defines this shape; civic-frontend consumes it.

**If you change the response envelope:**
- [ ] civic-app `MVP-taxi-spatial-qa.md` §8 — update response example
- [ ] civic-frontend `apis-data-contract.md` — update `QueryResponse` model table
- [ ] civic-frontend `design.md` §Data Flow / §API Contract — update field usage table
- [ ] civic-frontend TypeScript `types/api.ts` — update `ApiResponse` type

### 5. gov-data Response Envelope (`{success, data, error}`)

gov-data defines this; civic-app strips it before forwarding.

**If you change the gov-data envelope:**
- [ ] gov-data `docs/taxi-availability-design-doc.md` §4.0 — update envelope definition
- [ ] civic-app `MVP-taxi-spatial-qa.md` §7.1 — update note about navigating to `data.*`
- [ ] civic-app Python code — update envelope stripping logic

### 6. Query Types (QT-01 through QT-09)

Each query type spans all three repos: endpoint in gov-data, tool routing in civic-app, rendering in civic-frontend.

**If you add a new query type:**
- [ ] gov-data `docs/taxi-availability-design-doc.md` — add endpoint section (4.x) + update summary table (4.10)
- [ ] gov-data Java code — add controller method, service method, repository query
- [ ] civic-app `MVP-taxi-spatial-qa.md` §3 — add row to query type table
- [ ] civic-app `MVP-taxi-spatial-qa.md` §6.3 — update system prompt STEP ORDER
- [ ] civic-frontend `apis-data-contract.md` — update if new `data.type` or `context.type` is introduced
- [ ] civic-frontend `design.md` — update if new visualisation mode is needed

### 7. Zone Names and Categories (`district` | `road` | `highway`)

Zone names are seeded by gov-data, referenced in civic-app's system prompt, and displayed in civic-frontend.

**If you change zone names or categories:**
- [ ] gov-data `docs/zone-init-design.md` §4 — update zone catalog
- [ ] gov-data Java code — update seed logic if source changes
- [ ] civic-app `MVP-taxi-spatial-qa.md` §6.3 — update PLANNING AREAS list in system prompt
- [ ] civic-frontend `apis-data-contract.md` — update `ZoneGeometryData.category` enum if changed

### 8. Error Codes (`UPSTREAM_ERROR` | `NOT_FOUND` | `VALIDATION_ERROR` | `BAD_REQUEST`)

Defined in gov-data, mapped by civic-app, displayed by civic-frontend.

**If you add or rename error codes:**
- [ ] gov-data `docs/taxi-availability-design-doc.md` §8 — update error table
- [ ] civic-app `MVP-taxi-spatial-qa.md` §8 — update if error passthrough changes
- [ ] civic-frontend `apis-data-contract.md` — update Error Handling section

### 9. GeoJSON Structures (FeatureCollection, Point, Polygon, LineString)

Used across all three repos for spatial data representation.

**If you change GeoJSON conventions (e.g., new `properties` fields):**
- [ ] gov-data `docs/taxi-availability-design-doc.md` — update relevant endpoint response examples
- [ ] civic-app — typically passthrough, no doc change needed
- [ ] civic-frontend `apis-data-contract.md` — update GeoJSON Types section
- [ ] civic-frontend `GeoHeatmapMap.tsx` — update rendering if properties change

---

## Quick Reference: Which Docs to Check

| I changed something in... | Check these docs in other repos |
|---|---|
| **gov-data endpoint URL or path** | civic-app `MVP-taxi-spatial-qa.md` §3 (endpoint column), §6.3 (system prompt STEP ORDER), §7.1 (endpoint table + ReAct trace) |
| **gov-data endpoint params** | civic-app `MVP-taxi-spatial-qa.md` §6.3 (UNITS, STEP ORDER), §7.1 (key-params column); civic-frontend `apis-data-contract.md` (if param affects `context` fields) |
| **gov-data endpoint response shape** | civic-app `MVP-taxi-spatial-qa.md` §7.1, civic-frontend `apis-data-contract.md` |
| **gov-data zone table** | civic-app `MVP-taxi-spatial-qa.md` §6.3 (system prompt PLANNING AREAS), civic-frontend `apis-data-contract.md` (ZoneGeometryData) |
| **civic-app `POST /api/v1/query` URL** | civic-frontend `apis-data-contract.md` (endpoint section), civic-frontend `design.md` §Data Flow, civic-frontend `ChatPanel.tsx` |
| **civic-app response shape** | civic-frontend `apis-data-contract.md`, civic-frontend `design.md` §API Contract |
| **civic-app query types** | gov-data `docs/taxi-availability-design-doc.md` (endpoints), civic-frontend `apis-data-contract.md` |
| **civic-frontend API contract** | civic-app `MVP-taxi-spatial-qa.md` §8 (must match), gov-data `docs/taxi-availability-design-doc.md` (upstream source) |
| **civic-frontend visualisation** | civic-frontend `design.md` (keep in sync with contract), civic-app if new `data.type` needed |
