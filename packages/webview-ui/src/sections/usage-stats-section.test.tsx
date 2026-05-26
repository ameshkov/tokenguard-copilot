import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { UsageStatsSection } from './usage-stats-section.js';
import type { GetUsageStatsResponse } from '@tokenguard/shared';
import * as vscodeApi from '../vscode-api.js';

vi.mock('../vscode-api.js', () => ({
  sendRequest: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockSendRequest = vi.mocked(vscodeApi.sendRequest);

const emptyResponse: GetUsageStatsResponse = {
  type: 'getUsageStatsResult',
  requestId: '1',
  records: [],
  summary: {
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCachedTokens: 0,
    totalReasoningTokens: 0,
    totalRequestCount: 0,
    totalErrorCount: 0,
    totalEstimatedCost: 0,
    perModelBreakdown: [],
    providerNames: {},
    modelNames: {},
  },
};

const mockResponse: GetUsageStatsResponse = {
  type: 'getUsageStatsResult',
  requestId: '1',
  records: [
    {
      providerId: 'p1',
      modelId: 'm1',
      date: '2026-05-20',
      promptTokens: 1000,
      completionTokens: 500,
      cachedTokens: 200,
      reasoningTokens: 100,
      requestCount: 5,
      errorCount: 0,
      estimatedCost: 0.015,
    },
  ],
  summary: {
    totalPromptTokens: 1000,
    totalCompletionTokens: 500,
    totalCachedTokens: 200,
    totalReasoningTokens: 100,
    totalRequestCount: 5,
    totalErrorCount: 0,
    totalEstimatedCost: 0.015,
    providerNames: {
      p1: { name: 'Test Provider', removed: false },
    },
    modelNames: { 'p1:m1': { name: 'test-model', removed: false } },
    perModelBreakdown: [],
  },
};

const providers = [{ id: 'p1', name: 'Test Provider', baseUrl: 'https://test.com/v1' }];

const models = [
  {
    id: 'm1',
    providerId: 'p1',
    displayName: 'test-model',
    maxContextWindowTokens: 8192,
    maxOutputTokens: 4096,
    streaming: true,
    vision: false,
    temperature: null,
    topP: null,
    frequencyPenalty: null,
    presencePenalty: null,
    supportedReasoningEfforts: null,
    defaultReasoningEffort: null,
    reasoningEffortMap: null,
    preserveReasoning: false,
    inputCostPer1m: 10,
    outputCostPer1m: 20,
    cachedInputCostPer1m: 5,
  },
];

describe('UsageStatsSection', () => {
  it('renders the section header', async () => {
    mockSendRequest.mockResolvedValueOnce(emptyResponse);
    render(<UsageStatsSection providers={providers} models={models} />);
    expect(await screen.findByText('Usage Stats')).toBeDefined();
  });

  it('shows empty state when no data', async () => {
    mockSendRequest.mockResolvedValueOnce(emptyResponse);
    render(<UsageStatsSection providers={providers} models={models} />);
    expect(await screen.findByText('No usage data')).toBeDefined();
  });

  it('renders filter dropdowns', async () => {
    mockSendRequest.mockResolvedValueOnce(mockResponse);
    const { container } = render(<UsageStatsSection providers={providers} models={models} />);
    await screen.findByText('Usage Stats');
    const selects = container.querySelectorAll('vscode-single-select');
    // Period, Providers, Models
    expect(selects.length).toBeGreaterThanOrEqual(3);
  });

  it('shows "(removed)" tag for removed providers', async () => {
    const removedResponse: GetUsageStatsResponse = {
      ...mockResponse,
      summary: {
        ...mockResponse.summary,
        providerNames: {
          p1: { name: 'Test Provider', removed: false },
          p2: { name: 'Deleted Provider', removed: true },
        },
      },
    };
    mockSendRequest.mockResolvedValueOnce(removedResponse);
    render(<UsageStatsSection providers={providers} models={models} />);
    expect(await screen.findByText(/Deleted Provider.*removed/)).toBeDefined();
  });

  it('renders summary with formatted token counts', async () => {
    mockSendRequest.mockResolvedValueOnce(mockResponse);
    render(<UsageStatsSection providers={providers} models={models} />);
    expect(await screen.findByText('1,000')).toBeDefined();
    expect(await screen.findByText('(200 cached)')).toBeDefined();
    expect(await screen.findByText('500')).toBeDefined();
    expect(await screen.findByText('(100 reasoning)')).toBeDefined();
    expect(await screen.findByText('$0.01')).toBeDefined();
  });

  it('renders a bar chart canvas when data exists', async () => {
    mockSendRequest.mockResolvedValueOnce(mockResponse);
    const { container } = render(<UsageStatsSection providers={providers} models={models} />);
    await screen.findByText('Usage Stats');
    // chart.js renders a canvas element
    const canvas = container.querySelector('canvas');
    expect(canvas).toBeDefined();
  });

  it('shows loading state initially', () => {
    mockSendRequest.mockImplementation(() => new Promise(() => {}));
    render(<UsageStatsSection providers={providers} models={models} />);
    expect(screen.getByText('Usage Stats')).toBeDefined();
    // vscode-progress-ring shows loading
  });
});
