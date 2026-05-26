import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  const mockItem = {
    text: '',
    tooltip: '',
    command: '',
    show: vi.fn(),
    dispose: vi.fn(),
  };

  return {
    window: {
      createStatusBarItem: vi.fn(() => mockItem),
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    EventEmitter: vi.fn(function () {
      return {
        event: vi.fn(),
        fire: vi.fn(),
      };
    }),
    _mockItem: mockItem,
  };
});

import * as vscode from 'vscode';
import { createStatusBarItem } from './status-bar.js';
import type { UsageStatsSource } from './status-bar.js';
import type { ProviderInfo } from '@tokenguard/shared';

const mockVscode = vscode as unknown as {
  _mockItem: {
    text: string;
    tooltip: string;
    command: string;
    show: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  };
};

function makeProviderManager(providers: ProviderInfo[]) {
  return {
    getProviders: vi.fn(() => providers),
    onProvidersChanged: vi.fn(),
  };
}

function makeUsageSource(
  records: Array<{
    promptTokens: number;
    completionTokens: number;
    requestCount: number;
    estimatedCost: number;
    cachedTokens?: number;
  }>,
): UsageStatsSource {
  return {
    getStats: vi.fn(() =>
      records.map((r) => ({
        id: 1,
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-01-01',
        cachedTokens: 0,
        reasoningTokens: 0,
        errorCount: 0,
        ...r,
      })),
    ),
    onStatsChanged: vi.fn(),
  };
}

describe('createStatusBarItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a status bar item aligned to the right', () => {
    createStatusBarItem(makeProviderManager([]));

    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      vscode.StatusBarAlignment.Right,
      100,
    );
  });

  it('should set text with sparkle icon', () => {
    createStatusBarItem(makeProviderManager([]));

    expect(mockVscode._mockItem.text).toBe('$(chat-sparkle) TokenGuard');
  });

  it('should set command to openSettings', () => {
    createStatusBarItem(makeProviderManager([]));

    expect(mockVscode._mockItem.command).toBe('tokenguard-copilot.openSettings');
  });

  it('should show "No providers configured" when no providers exist', () => {
    createStatusBarItem(makeProviderManager([]));

    expect(mockVscode._mockItem.tooltip).toContain('No providers configured');
  });

  it('should show provider summary when providers exist', () => {
    const pm = makeProviderManager([
      { id: '1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
      { id: '2', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
    ]);
    createStatusBarItem(pm);

    expect(mockVscode._mockItem.tooltip).toContain('2 provider(s) configured: OpenAI, DeepSeek');
  });

  it('should show singular "provider" when one provider exists', () => {
    const pm = makeProviderManager([
      { id: '1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
    ]);
    createStatusBarItem(pm);

    expect(mockVscode._mockItem.tooltip).toContain('1 provider configured: OpenAI');
  });

  it('should call show on the item', () => {
    createStatusBarItem(makeProviderManager([]));

    expect(mockVscode._mockItem.show).toHaveBeenCalled();
  });

  it('should return the status bar item', () => {
    const item = createStatusBarItem(makeProviderManager([]));

    expect(item).toBe(mockVscode._mockItem);
  });

  it('should subscribe to onProvidersChanged', () => {
    const pm = makeProviderManager([]);
    createStatusBarItem(pm);

    expect(pm.onProvidersChanged).toHaveBeenCalled();
  });

  it('should update tooltip when providers change', () => {
    const pm = makeProviderManager([]);
    let listener: (() => void) | undefined;

    // Capture the listener passed to onProvidersChanged
    pm.onProvidersChanged = vi.fn((fn: () => void) => {
      listener = fn;
    });

    createStatusBarItem(pm);
    expect(mockVscode._mockItem.tooltip).toContain('No providers configured');

    // Simulate provider added
    pm.getProviders = vi.fn(() => [
      { id: '1', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
    ]);
    listener?.();
    expect(mockVscode._mockItem.tooltip).toContain('1 provider configured: OpenAI');
  });

  it('should show "No usage data yet" when no stats exist', () => {
    createStatusBarItem(makeProviderManager([]), makeUsageSource([]));

    expect(mockVscode._mockItem.tooltip).toContain('No usage data yet');
  });

  it('should show token and cost summary when stats exist', () => {
    const usage = makeUsageSource([
      {
        promptTokens: 1000,
        completionTokens: 500,
        requestCount: 5,
        estimatedCost: 0.015,
      },
    ]);
    createStatusBarItem(makeProviderManager([]), usage);

    expect(mockVscode._mockItem.tooltip).toContain('Tokens: 1K in / 500 out');
    expect(mockVscode._mockItem.tooltip).toContain('Requests: 5');
    expect(mockVscode._mockItem.tooltip).toContain('Cost: $0.01');
  });

  it('should show cached percentage when cached tokens exist', () => {
    const usage = makeUsageSource([
      {
        promptTokens: 1000,
        completionTokens: 500,
        cachedTokens: 800,
        requestCount: 5,
        estimatedCost: 0.01,
      },
    ]);
    createStatusBarItem(makeProviderManager([]), usage);

    expect(mockVscode._mockItem.tooltip).toContain('Tokens: 1K in (80% cached) / 500 out');
  });

  it('should subscribe to onStatsChanged', () => {
    const usage = makeUsageSource([]);
    createStatusBarItem(makeProviderManager([]), usage);

    expect(usage.onStatsChanged).toHaveBeenCalled();
  });

  it('should update tooltip when stats change', () => {
    const usage = makeUsageSource([]);
    let listener: (() => void) | undefined;

    usage.onStatsChanged = vi.fn((fn: () => void) => {
      listener = fn;
      return { dispose: () => {} };
    }) as unknown as typeof usage.onStatsChanged;

    createStatusBarItem(makeProviderManager([]), usage);
    expect(mockVscode._mockItem.tooltip).toContain('No usage data yet');

    // Simulate stats change
    (usage.getStats as ReturnType<typeof vi.fn>).mockReturnValue([
      {
        id: 1,
        providerId: 'p1',
        modelId: 'm1',
        date: '2026-01-01',
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        requestCount: 2,
        errorCount: 0,
        estimatedCost: 0.005,
      },
    ]);
    listener?.();
    expect(mockVscode._mockItem.tooltip).toContain('Tokens: 100 in / 50 out');
    expect(mockVscode._mockItem.tooltip).toContain('Cost: $0.005');
  });

  it('should show $0 when cost is zero', () => {
    const usage = makeUsageSource([
      {
        promptTokens: 10,
        completionTokens: 5,
        requestCount: 1,
        estimatedCost: 0,
      },
    ]);
    createStatusBarItem(makeProviderManager([]), usage);

    expect(mockVscode._mockItem.tooltip).toContain('Cost: $0');
  });
});
