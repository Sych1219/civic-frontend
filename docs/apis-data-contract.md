## Endpoints

### `POST /api/query`

Process a natural-language query and return structured, visualisation-ready data.

**Request**

```jsonc
// Content-Type: application/json
{
  "query": "Show me air temperature for today",   // required
  "session_id": "optional-session-uuid",           // optional
  "context": {}                                    // optional
}
```

**Response — success (time-series)**

```json
{
  "status": "success",
  "data": {
    "records": [
      {"station_id": "S50", "timestamp": "2026-02-22T10:00:00+08:00", "value": 28.5}
    ],
    "summary_stats": {
      "value": {"mean": 28.5, "min": 26.0, "max": 31.0, "std": 1.2}
    },
    "chart_configs": [
      {
        "type": "line",
        "title": "Temperature Over Time",
        "x_axis": "timestamp",
        "y_axis": "value",
        "x_label": "Time",
        "y_label": "Temperature (°C)"
      }
    ],
    "columns": ["station_id", "timestamp", "value"]
  },
  "visualization_type": "time_series",
  "error": null
}
```

| Field | Type | Description |
|---|---|---|
| `status` | string | `"success"` or `"error"` |
| `data.records` | array | Observation data points; each entry represents one reading at a station |
| `data.records[].station_id` | string | Unique identifier for the weather station |
| `data.records[].timestamp` | string | ISO-8601 timestamp with timezone offset |
| `data.records[].value` | number | Sensor reading for the queried metric |
| `data.summary_stats` | object | Aggregated statistics computed across all records for each numeric column |
| `data.summary_stats.value.mean` | number | Arithmetic mean |
| `data.summary_stats.value.min` | number | Minimum observed value |
| `data.summary_stats.value.max` | number | Maximum observed value |
| `data.summary_stats.value.std` | number | Standard deviation |
| `data.chart_configs` | array | Rendering hints for the frontend chart component |
| `data.chart_configs[].type` | string | Chart type — `"line"`, `"bar"`, `"scatter"`, etc. |
| `data.chart_configs[].title` | string | Human-readable chart title |
| `data.chart_configs[].x_axis` | string | Record field to map to the x-axis |
| `data.chart_configs[].y_axis` | string | Record field to map to the y-axis |
| `data.chart_configs[].x_label` | string | Display label for the x-axis |
| `data.chart_configs[].y_label` | string | Display label for the y-axis |
| `data.columns` | array | Ordered list of keys present in each record |
| `visualization_type` | string | Instructs the frontend which component to render (`"time_series"`) |
| `error` | null | `null` on success |

**Response — success (map / GeoJSON)**

```json
{
  "status": "success",
  "data": {
    "geojson": {"type": "FeatureCollection", "features": ["..."]},
    "bounds": [[1.2, 103.7], [1.4, 103.9]],
    "center": {"lat": 1.3521, "lon": 103.8198},
    "features_count": 12,
    "property_type": "temporal",
    "temporal": {
      "series": [
        {"time": "2026-02-22T14:16:00+08:00", "value": 28.3, "attribute": "dbt_1m_f"}
      ],
      "unit": "deg C"
    }
  },
  "visualization_type": "map_temporal",
  "error": null
}
```

| Field | Type | Description |
|---|---|---|
| `status` | string | `"success"` or `"error"` |
| `data.geojson` | object | Standard GeoJSON `FeatureCollection`; each `Feature` carries sensor/station properties |
| `data.bounds` | array | `[[south, west], [north, east]]` bounding box in WGS-84 |
| `data.center` | object | Recommended map centre derived from the data extent |
| `data.features_count` | number | Total number of GeoJSON features returned |
| `data.property_type` | string | `"temporal"` or `"static"` — whether features carry time-series data |
| `data.temporal` | object | Present only when `property_type` is `"temporal"` |
| `data.temporal.series[].time` | string | ISO-8601 timestamp with timezone offset |
| `data.temporal.series[].value` | number | Numeric reading at this timestamp |
| `data.temporal.series[].attribute` | string | Raw attribute name from the source dataset |
| `data.temporal.unit` | string | Physical unit of the `value` field (e.g. `"deg C"`) |
| `visualization_type` | string | Instructs the frontend which component to render (`"map_temporal"`, `"map_static"`, etc.) |
| `error` | null | `null` on success |

**Response — error**

```json
{
  "status": "error",
  "data": {},
  "visualization_type": "error",
  "error": "Could not understand the query. Please try rephrasing your question."
}
```

| Field | Type | Description |
|---|---|---|
| `status` | string | `"error"` |
| `data` | object | Always an empty object on error |
| `visualization_type` | string | `"error"` — signals the frontend to render an error state |
| `error` | string | Human-readable error message describing what went wrong |

---