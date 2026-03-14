'use client';

import {
  LineChart, Line,
  BarChart, Bar,
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { TimeSeriesData, ChartConfig, SummaryStats } from '@/types/api';

interface ChartPanelProps {
  data: TimeSeriesData;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ISO_RE = /T\d{2}:\d{2}/;

function formatXTick(value: unknown): string {
  if (typeof value === 'string' && ISO_RE.test(value)) {
    try {
      return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(value);
    }
  }
  return String(value ?? '');
}

function formatCellValue(value: unknown): string {
  if (typeof value === 'number') return value.toFixed(2);
  if (typeof value === 'string' && ISO_RE.test(value)) {
    try { return new Date(value).toLocaleString(); } catch { /* fall through */ }
  }
  return String(value ?? '—');
}

// ── Chart renderer ────────────────────────────────────────────────────────────

function renderChart(config: ChartConfig, records: Record<string, unknown>[]) {
  const { type, x_axis, y_axis, x_label, y_label } = config;

  // Pre-format timestamps on the x-axis for readability
  const fmtRecords = records.map((r) => ({
    ...r,
    [x_axis]:
      typeof r[x_axis] === 'string' && ISO_RE.test(r[x_axis] as string)
        ? formatXTick(r[x_axis])
        : r[x_axis],
  }));

  const margin = { top: 10, right: 30, left: 10, bottom: 75 };

  const sharedAxes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
      <XAxis
        dataKey={x_axis}
        label={{ value: x_label, position: 'insideBottom', offset: -55 }}
        tick={{ fontSize: 10 }}
        angle={-40}
        textAnchor="end"
        height={75}
      />
      <YAxis
        label={{ value: y_label, angle: -90, position: 'insideLeft', offset: 10 }}
        tick={{ fontSize: 11 }}
        width={65}
      />
      <Tooltip />
      <Legend verticalAlign="top" />
    </>
  );

  if (type === 'bar') {
    return (
      <BarChart data={fmtRecords} margin={margin}>
        {sharedAxes}
        <Bar dataKey={y_axis} fill="#3b82f6" radius={[4, 4, 0, 0]} name={y_label} />
      </BarChart>
    );
  }

  if (type === 'scatter') {
    // Scatter uses numeric axes; pass raw records so x/y values stay as numbers
    return (
      <ScatterChart margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey={x_axis}
          type="number"
          name={x_label}
          label={{ value: x_label, position: 'insideBottom', offset: -55 }}
          tick={{ fontSize: 11 }}
          height={75}
        />
        <YAxis
          dataKey={y_axis}
          type="number"
          name={y_label}
          label={{ value: y_label, angle: -90, position: 'insideLeft', offset: 10 }}
          tick={{ fontSize: 11 }}
          width={65}
        />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} />
        <Legend verticalAlign="top" />
        <Scatter name={y_label} data={records as Record<string, number>[]} fill="#3b82f6" />
      </ScatterChart>
    );
  }

  // Default: line chart
  return (
    <LineChart data={fmtRecords} margin={margin}>
      {sharedAxes}
      <Line
        type="monotone"
        dataKey={y_axis}
        stroke="#3b82f6"
        strokeWidth={2}
        dot={false}
        activeDot={{ r: 4 }}
        name={y_label}
      />
    </LineChart>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ChartPanel({ data }: ChartPanelProps) {
  const { records, chart_configs, summary_stats, columns } = data;

  if (!chart_configs?.length || !records?.length) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <p className="text-sm">No chart data available</p>
      </div>
    );
  }

  const config = chart_configs[0];
  const stats: SummaryStats | undefined = summary_stats?.value;

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      {/* Title */}
      <div className="px-6 pt-6 pb-2 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900">{config.title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          {records.length} data point{records.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Chart */}
      <div className="px-2 py-4">
        <ResponsiveContainer width="100%" height={320}>
          {renderChart(config, records)}
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      {stats && (
        <div className="px-6 py-4 grid grid-cols-4 gap-3 border-t border-slate-100">
          {(['mean', 'min', 'max', 'std'] as const).map((key) => (
            <div key={key} className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">
                {key === 'std' ? 'Std Dev' : key}
              </p>
              <p className="text-base font-semibold text-slate-800">{stats[key].toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Data table (first 20 rows) */}
      {columns?.length > 0 && (
        <div className="px-6 pb-6 border-t border-slate-100">
          <h3 className="text-sm font-medium text-slate-700 mt-4 mb-2">
            Raw data <span className="text-slate-400 font-normal">({records.length} rows)</span>
          </h3>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50">
                <tr>
                  {columns.map((col: string) => (
                    <th
                      key={col}
                      className="px-3 py-2 font-medium text-slate-600 whitespace-nowrap border-b border-slate-200"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 20).map((row: Record<string, unknown>, i: number) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    {columns.map((col: string) => (
                      <td
                        key={col}
                        className="px-3 py-1.5 text-slate-700 whitespace-nowrap border-b border-slate-100"
                      >
                        {formatCellValue(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
                {records.length > 20 && (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-3 py-2 text-slate-400 text-center"
                    >
                      … and {records.length - 20} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
