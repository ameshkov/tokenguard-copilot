import { useState, useEffect, useCallback, useMemo } from 'react';
import type { GetUsageStatsResponse, ProviderInfo, ModelInfo } from '@tokenguard/shared';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip as ChartTooltip,
  Legend,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { sendRequest } from '../vscode-api.js';

ChartJS.register(BarElement, CategoryScale, LinearScale, ChartTooltip, Legend);

/**
 * Reads the computed value of a CSS custom property from the
 * document root. Chart.js renders on `<canvas>`, so CSS
 * `var(--…)` tokens cannot be used directly — the resolved
 * color string must be passed instead.
 *
 * @param name - CSS custom property name including `--` prefix.
 * @param fallback - Value to return when the property is unset.
 * @returns The resolved color string.
 */
function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return value.trim() || fallback;
}

/** Props for the {@link UsageStatsSection} component. */
export interface UsageStatsSectionProps {
  /** All providers for filter dropdowns. */
  providers: ProviderInfo[];
  /** All models for filter dropdowns. */
  models: ModelInfo[];
}

/** Period filter options. */
type Period = 'last7d' | 'today' | 'last24h' | 'last30d' | 'all';

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'last7d', label: 'Last 7 days' },
  { value: 'today', label: 'Today' },
  { value: 'last24h', label: 'Last 24 hours' },
  { value: 'last30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

/**
 * Shape of a single data point passed to chart.js.
 */
interface ChartDataPoint {
  date: string;
  input: number;
  output: number;
  cached: number;
  reasoning: number;
}

/**
 * Format a number with commas.
 *
 * @param n - The number to format.
 * @returns The formatted string.
 */
function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Format a cost in USD.
 *
 * @param n - The cost value.
 * @returns The formatted cost string.
 */
function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Builds chart.js options with theme-aware axis colors,
 * stacked bars, and a tooltip that shows token counts
 * and estimated cost.
 *
 * @param response - The current usage stats response.
 * @param maxY - The maximum Y-axis value.
 * @returns Chart.js options object.
 */
function buildChartOptions(
  response: GetUsageStatsResponse | null,
  maxY: number,
): ChartOptions<'bar'> {
  const fgColor = cssVar('--vscode-foreground', '#cccccc');
  const gridColor = cssVar('--vscode-editorWidget-border', '#333333');

  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true,
        ticks: {
          color: fgColor,
          font: { size: 10 },
          callback(_value, index, ticks) {
            const label = (
              this as unknown as {
                getLabelForValue(i: number): string;
              }
            ).getLabelForValue(index);
            return ticks.length > 0 ? label.slice(5) : label;
          },
        },
        grid: { display: false },
      },
      y: {
        stacked: true,
        max: maxY,
        ticks: {
          color: fgColor,
          font: { size: 10 },
          callback(value) {
            const v = Number(value);
            return v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v);
          },
        },
        grid: { color: gridColor },
      },
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: fgColor,
          font: { size: 11 },
          boxWidth: 12,
          padding: 12,
        },
      },
      tooltip: {
        callbacks: {
          label(item: TooltipItem<'bar'>) {
            return `${item.dataset.label ?? ''}: ${fmt(item.parsed.y ?? 0)} tokens`;
          },
          afterBody(items: TooltipItem<'bar'>[]) {
            if (!response || items.length === 0) return '';
            const date = items[0].label;
            const record = response.records.find((r) => r.date === date);
            if (!record) return '';
            return `Est. cost: $${record.estimatedCost.toFixed(4)}`;
          },
        },
      },
    },
  };
}

/**
 * Usage stats visualization section: bar chart,
 * period/provider/model filters, and cost summary.
 *
 * @param props - Component props.
 * @returns The usage stats section element.
 */
export function UsageStatsSection(props: UsageStatsSectionProps): React.JSX.Element {
  const { providers, models } = props;

  const [period, setPeriod] = useState<Period>('last7d');
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [response, setResponse] = useState<GetUsageStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Merge active providers from props with names from the
  // response (which includes removed entities with
  // "(removed)" tag).
  const filterProviders = useMemo(() => {
    const nameMap = response?.summary.providerNames ?? {};
    const merged = new Map<string, { name: string; removed: boolean }>();

    for (const p of providers) {
      merged.set(p.id, { name: p.name, removed: false });
    }
    for (const [id, info] of Object.entries(nameMap)) {
      if (!merged.has(id)) {
        merged.set(id, info);
      }
    }
    return [...merged.entries()].map(([id, info]) => ({
      id,
      name: info.removed ? `${info.name} (removed)` : info.name,
    }));
  }, [providers, response]);

  const availableModels = useMemo(() => {
    const nameMap = response?.summary.modelNames ?? {};
    const merged = new Map<string, { name: string; removed: boolean }>();

    for (const m of models) {
      merged.set(`${m.providerId}:${m.id}`, {
        name: m.displayName ?? m.id,
        removed: false,
      });
    }
    for (const [key, info] of Object.entries(nameMap)) {
      if (!merged.has(key)) {
        merged.set(key, info);
      }
    }

    return [...merged.entries()]
      .filter(([key]) => {
        if (selectedProviderIds.length === 0) return true;
        const [providerId] = key.split(':');
        return selectedProviderIds.includes(providerId);
      })
      .map(([key, info]) => ({
        key,
        modelId: key.split(':')[1],
        name: info.removed ? `${info.name} (removed)` : info.name,
      }));
  }, [models, response, selectedProviderIds]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await sendRequest<GetUsageStatsResponse>({
        type: 'getUsageStats',
        period:
          selectedProviderIds.length === 0 && selectedModelIds.length === 0 ? period : undefined,
        providerIds: selectedProviderIds.length > 0 ? selectedProviderIds : undefined,
        modelIds: selectedModelIds.length > 0 ? selectedModelIds : undefined,
      });
      setResponse(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }, [period, selectedProviderIds, selectedModelIds]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // Transform records into chart data grouped by date
  const chartData: ChartDataPoint[] = useMemo(() => {
    if (!response) return [];
    const byDate = new Map<string, ChartDataPoint>();
    for (const r of response.records) {
      const entry = byDate.get(r.date) ?? {
        date: r.date,
        input: 0,
        output: 0,
        cached: 0,
        reasoning: 0,
      };
      entry.input += r.promptTokens - r.cachedTokens;
      entry.output += r.completionTokens;
      entry.cached += r.cachedTokens;
      entry.reasoning += r.reasoningTokens;
      byDate.set(r.date, entry);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [response]);

  const summary = response?.summary;

  // Compute max Y domain for the chart (add 15% headroom).
  const maxY = useMemo(() => {
    let max = 0;
    for (const d of chartData) {
      const total = d.input + d.output + d.cached + d.reasoning;
      if (total > max) max = total;
    }
    return Math.ceil(max * 1.15);
  }, [chartData]);

  return (
    <div className="usage-stats-section">
      <div className="section-header usage-stats-header">
        <h2 className="section-header__title">Usage Stats</h2>
        <vscode-button
          secondary
          aria-label="Refresh usage stats"
          title="Refresh"
          disabled={loading || undefined}
          onclick={() => void fetchStats()}
        >
          <vscode-icon name="refresh" slot="content-before" />
        </vscode-button>
      </div>

      {/* Filters */}
      <div className="usage-stats-filters">
        <vscode-single-select
          aria-label="Period"
          value={period}
          onchange={(e: Event) =>
            setPeriod(((e.target as HTMLSelectElement).value as Period) ?? 'last7d')
          }
        >
          {PERIOD_OPTIONS.map((opt) => (
            <vscode-option key={opt.value} value={opt.value}>
              {opt.label}
            </vscode-option>
          ))}
        </vscode-single-select>

        <vscode-single-select
          aria-label="Providers"
          value={selectedProviderIds.length === 0 ? '__all__' : selectedProviderIds[0]}
          onchange={(e: Event) => {
            const val = (e.target as HTMLSelectElement).value;
            setSelectedProviderIds(val === '__all__' ? [] : [val]);
            setSelectedModelIds([]);
          }}
        >
          <vscode-option value="__all__">All Providers</vscode-option>
          {filterProviders.map((p) => (
            <vscode-option key={p.id} value={p.id}>
              {p.name}
            </vscode-option>
          ))}
        </vscode-single-select>

        <vscode-single-select
          aria-label="Models"
          value={selectedModelIds.length === 0 ? '__all__' : selectedModelIds[0]}
          onchange={(e: Event) => {
            const val = (e.target as HTMLSelectElement).value;
            setSelectedModelIds(val === '__all__' ? [] : [val]);
          }}
        >
          <vscode-option value="__all__">All Models</vscode-option>
          {availableModels.map((m) => (
            <vscode-option key={m.key} value={m.modelId}>
              {m.name}
            </vscode-option>
          ))}
        </vscode-single-select>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="usage-stats-loading">
          <vscode-progress-ring />
        </div>
      ) : error ? (
        <div className="error-banner">{error}</div>
      ) : chartData.length === 0 ? (
        <div className="usage-stats-chart-placeholder">
          <p>No usage data</p>
        </div>
      ) : (
        <div style={{ height: 220 }}>
          <Bar
            data={{
              labels: chartData.map((d) => d.date),
              datasets: [
                {
                  label: 'Input',
                  data: chartData.map((d) => d.input),
                  backgroundColor: cssVar('--vscode-charts-blue', '#4fc1ff'),
                  stack: 'tokens',
                },
                {
                  label: 'Cached input',
                  data: chartData.map((d) => d.cached),
                  backgroundColor: cssVar('--vscode-charts-purple', '#ab47bc'),
                  stack: 'tokens',
                },
                {
                  label: 'Output',
                  data: chartData.map((d) => d.output),
                  backgroundColor: cssVar('--vscode-charts-green', '#4caf50'),
                  stack: 'tokens',
                },
                {
                  label: 'Reasoning',
                  data: chartData.map((d) => d.reasoning),
                  backgroundColor: cssVar('--vscode-charts-orange', '#ff9800'),
                  stack: 'tokens',
                },
              ],
            }}
            options={buildChartOptions(response, maxY)}
          />
        </div>
      )}

      {/* Summary */}
      {summary && !loading && (
        <div className="usage-stats-summary">
          <h3>Summary</h3>
          <div className="usage-stats-summary__grid">
            <div className="usage-stats-summary__item">
              <span className="usage-stats-summary__label">Requests</span>
              <span className="usage-stats-summary__value">{fmt(summary.totalRequestCount)}</span>
            </div>
            <div className="usage-stats-summary__item">
              <span className="usage-stats-summary__label">Input tokens</span>
              <span className="usage-stats-summary__value">
                {fmt(summary.totalPromptTokens)}
                {summary.totalCachedTokens > 0 && (
                  <span className="usage-stats-summary__detail">
                    {' '}
                    ({fmt(summary.totalCachedTokens)} cached)
                  </span>
                )}
              </span>
            </div>
            <div className="usage-stats-summary__item">
              <span className="usage-stats-summary__label">Output tokens</span>
              <span className="usage-stats-summary__value">
                {fmt(summary.totalCompletionTokens)}
                {summary.totalReasoningTokens > 0 && (
                  <span className="usage-stats-summary__detail">
                    {' '}
                    ({fmt(summary.totalReasoningTokens)} reasoning)
                  </span>
                )}
              </span>
            </div>
            <div className="usage-stats-summary__item">
              <span className="usage-stats-summary__label">Estimated cost</span>
              <span className="usage-stats-summary__value">
                {fmtCost(summary.totalEstimatedCost)}
              </span>
            </div>
          </div>

          {/* Per-model cost breakdown */}
          {summary.perModelBreakdown.length > 1 && (
            <div className="usage-stats-breakdown">
              <h4>Cost Breakdown</h4>
              <table className="usage-stats-breakdown__table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Input Rate</th>
                    <th>Cached Read Rate</th>
                    <th>Output Rate</th>
                    <th>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.perModelBreakdown.map((pm) => (
                    <tr key={`${pm.providerId}:${pm.modelId}`}>
                      <td>{pm.displayName}</td>
                      <td>
                        {pm.inputCostPer1m !== null ? `${fmtCost(pm.inputCostPer1m)}/1M` : '—'}
                      </td>
                      <td>
                        {pm.cachedInputCostPer1m !== null
                          ? `${fmtCost(pm.cachedInputCostPer1m)}/1M`
                          : '—'}
                      </td>
                      <td>
                        {pm.outputCostPer1m !== null ? `${fmtCost(pm.outputCostPer1m)}/1M` : '—'}
                      </td>
                      <td>{fmtCost(pm.estimatedCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
