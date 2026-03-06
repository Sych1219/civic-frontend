# Civic App — API Contract

> Defines every REST endpoint, request/response shapes, and error semantics.

## Table of Contents

- [Base URL](#base-url)
- [Endpoints](#endpoints)
    - [POST /api/v1/query](#post-apiv1query)
- [Models](#models)
    - [QueryRequest](#queryrequest)
    - [QueryResponse](#queryresponse)
    - [TaxiData](#taxidata)

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
  "query": "how many taxi in punggol region?"   // required
}
```

**Response — success (taxi zone query)**

```json
{
  "answer": "There are 48 available taxis in the Punggol zone as of 15:52 SGT.",
  "data": {
    "zone": "PUNGGOL",
    "locations": {
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "geometry": {
            "type": "Point",
            "coordinates": [103.8928, 1.40053]
          }
        }
      ]
    },
    "taxi_count": 48,
    "snapshot_time": "2026-03-05T15:52:59+08:00"
  },
  "metadata": {
    "execution_time_ms": 24060
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
| `data` | `object` | Structured response data (shape varies by query type) |
| `metadata` | `object` | Request execution metadata |
| `metadata.execution_time_ms` | `number` | Time taken to process the request in milliseconds |

### `TaxiData`

Shape of `data` for taxi-related queries.

| Field | Type | Description |
|-------|------|-------------|
| `zone` | `str` | Zone name as returned by the API (e.g. `"PUNGGOL"`) |
| `locations` | `GeoJSON FeatureCollection` | GeoJSON FeatureCollection of `Point` features, one per taxi |
| `taxi_count` | `number` | Number of available taxis in the zone |
| `snapshot_time` | `str` | ISO-8601 timestamp of the data snapshot |

#### GeoJSON Feature (taxi location)

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [longitude, latitude]
  }
}
```

---

## Error Handling

Errors are returned as non-2xx HTTP responses or within the response body.

| Scenario | Behaviour |
|----------|-----------|
| Unrecognised query | `answer` explains the limitation; `data` may be empty or `null` |
| External API failure | `answer` contains an error description |
| Invalid request body | HTTP 422 Unprocessable Entity |
