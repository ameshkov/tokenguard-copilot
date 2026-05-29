import * as vscode from 'vscode';
import type { ProviderInfo } from '@tokenguard/shared';
import type { UsageRecord } from '../../db/index.js';

/**
 * Minimal interface for the provider manager — only the parts
 * needed by the status bar.
 */
export interface StatusBarProviderSource {
  /** Returns all non-removed providers. */
  getProviders(): ProviderInfo[];
  /** Fires when providers are added, edited, or removed. */
  onProvidersChanged: vscode.Event<void>;
}

/**
 * Minimal interface for the usage tracker — only the parts
 * needed by the status bar.
 */
export interface UsageStatsSource {
  /** Returns all usage records matching the given filters. */
  getStats(filter: {
    providerId?: string;
    modelId?: string;
    dateFrom?: string;
    dateTo?: string;
  }): UsageRecord[];
  /** Fires when usage stats change. */
  onStatsChanged: vscode.Event<void>;
}

/**
 * Builds the tooltip text from the current provider list and
 * usage stats.
 *
 * @param providers - The list of configured providers.
 * @param stats - Usage record rows (all time).
 * @returns The tooltip string.
 */
function buildTooltip(providers: ProviderInfo[], stats: UsageRecord[]): string {
  const lines: string[] = ['Click to open TokenGuard settings', ''];

  if (providers.length === 0) {
    lines.push('No providers configured');
  } else {
    const count = providers.length;
    const names = providers.map((p) => p.name).join(', ');
    const label = count === 1 ? 'provider' : 'provider(s)';
    lines.push(`${count} ${label} configured: ${names}`);
  }

  if (stats.length === 0) {
    lines.push('No usage data yet');
  } else {
    let totalIn = 0;
    let totalCached = 0;
    let totalOut = 0;
    let totalRequests = 0;
    let totalCost = 0;
    for (const r of stats) {
      totalIn += r.promptTokens;
      totalCached += r.cachedTokens;
      totalOut += r.completionTokens;
      totalRequests += r.requestCount;
      totalCost += r.promptTokensCost + r.completionTokensCost + r.cachedTokensCost;
    }

    let tokenLine = `Tokens: ${fmtCompact(totalIn)} in`;
    if (totalCached > 0 && totalIn > 0) {
      const pct = Math.round((totalCached / totalIn) * 100);
      tokenLine += ` (${pct}% cached)`;
    }
    tokenLine += ` / ${fmtCompact(totalOut)} out`;
    lines.push(tokenLine);
    lines.push(`Requests: ${totalRequests.toLocaleString()}`);
    lines.push(`Cost: ${formatCost(totalCost)}`);
  }

  return lines.join('\n');
}

/**
 * Formats a token count in compact form (e.g. "1.25M",
 * "350K", "42").
 *
 * @param n - The token count.
 * @returns Compact string representation.
 */
function fmtCompact(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number(m.toFixed(2))}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${Number(k.toFixed(1))}K`;
  }
  return String(n);
}

/**
 * Formats a cost value for display. Uses 2 decimal places for
 * values >= $0.01, otherwise shows enough decimals to display
 * the first significant digit (up to 6).
 *
 * @param cost - The cost in dollars.
 * @returns Formatted cost string (e.g. "$1.23", "$0.0045").
 */
function formatCost(cost: number): string {
  if (cost === 0) return '$0';
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;

  // Show enough decimals for the first significant digit
  for (let d = 3; d <= 6; d++) {
    const s = cost.toFixed(d);
    if (parseFloat(s) > 0) return `$${s}`;
  }
  return `$${cost.toFixed(6)}`;
}

/**
 * Creates a status bar item for the TokenGuard Copilot extension.
 *
 * The item displays "TokenGuard Copilot" with a sparkle icon in the
 * status bar. Clicking it opens the settings panel. The tooltip shows
 * a summary of configured providers (count and names) and usage
 * stats, updating when providers or stats change.
 *
 * Event subscriptions are collected into the returned `Disposable`
 * so they are properly cleaned up on deactivation.
 *
 * @param providerSource - Source of provider data, typically
 *   `ProviderManager`.
 * @param usageSource - Source of usage stats, typically
 *   `UsageTracker`. Optional for backward compatibility.
 * @returns A `Disposable` that disposes the status bar item and
 *   all event subscriptions.
 */
export function createStatusBarItem(
  providerSource: StatusBarProviderSource,
  usageSource?: UsageStatsSource,
): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = '$(chat-sparkle) TokenGuard';
  item.command = 'tokenguard-copilot.openSettings';

  const updateTooltip = (): void => {
    const stats = usageSource ? usageSource.getStats({}) : [];
    item.tooltip = buildTooltip(providerSource.getProviders(), stats);
  };
  updateTooltip();

  const providerDisposable = providerSource.onProvidersChanged(() => {
    updateTooltip();
  });

  const statsDisposable = usageSource?.onStatsChanged(() => {
    updateTooltip();
  });

  item.show();

  return {
    dispose: () => {
      item.dispose();
      providerDisposable.dispose();
      statsDisposable?.dispose();
    },
  };
}
