import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./vscode-api.js', () => ({
  sendRequest: vi.fn(),
}));

import { SettingsApp } from './settings-app.js';
import { sendRequest } from './vscode-api.js';
import type { ProviderInfo, ModelInfo } from '@tokenguard/shared';

const mockProviders: ProviderInfo[] = [
  { id: 'p1', name: 'OpenAI', baseUrl: 'https://api.openai.com' },
  { id: 'p2', name: 'Anthropic', baseUrl: 'https://api.anthropic.com' },
];

const mockModels: ModelInfo[] = [
  {
    id: 'm1',
    providerId: 'p1',
    displayName: 'GPT-4',
    maxContextWindowTokens: 128000,
    maxOutputTokens: 4096,
    streaming: true,
    vision: false,
    temperature: null,
    topP: null,
    frequencyPenalty: null,
    presencePenalty: null,
    defaultReasoningEffort: null,
    reasoningEffortMap: null,
    preserveReasoning: false,
    inputCostPer1m: null,
    outputCostPer1m: null,
    cachedInputCostPer1m: null,
    cacheControl: null,
    customFields: null,
  },
];

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendRequest).mockImplementation((async (msg: Record<string, unknown>) => {
    switch (msg.type) {
      case 'getProviders':
        return { type: 'getProvidersResult', requestId: 'r1', providers: mockProviders };
      case 'getModels':
        return { type: 'getModelsResult', requestId: 'r1', models: mockModels };
      case 'getChatDebugSettings':
        return {
          type: 'getChatDebugSettingsResult',
          requestId: 'r1',
          settings: { enabled: false, ttlHours: 24 },
        };
      case 'getUsageStats':
        return {
          type: 'getUsageStatsResult',
          requestId: 'r1',
          records: [],
          summary: {
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            totalCachedTokens: 0,
            totalReasoningTokens: 0,
            totalRequestCount: 0,
            totalErrorCount: 0,
            totalEstimatedCost: 0,
            providerNames: {},
            modelNames: {},
            perModelBreakdown: [],
          },
        };
      case 'getContentRules':
        return { type: 'getContentRulesResult', requestId: 'r1', rules: [] };
      default:
        return { success: true };
    }
  }) as unknown as typeof sendRequest);
});

function renderApp() {
  return render(<SettingsApp />);
}

describe('SettingsApp', () => {
  it('renders the settings page heading', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByText('TokenGuard Copilot Settings')).toBeDefined();
    });
  });

  it('fetches providers and models on mount', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByText('TokenGuard Copilot Settings')).toBeDefined();
    });

    expect(sendRequest).toHaveBeenCalledWith({ type: 'getProviders' });
    expect(sendRequest).toHaveBeenCalledWith({ type: 'getModels' });
  });

  it('renders providers in the list after fetch', async () => {
    renderApp();
    await waitFor(() => {
      const items = screen.getAllByText('OpenAI');
      expect(items.length).toBeGreaterThanOrEqual(1);
    });
    const anthropicItems = screen.getAllByText('Anthropic');
    expect(anthropicItems.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Add Provider button', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Provider' })).toBeDefined();
    });
  });

  it('navigates to Add Provider page when button clicked', async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Provider' })).toBeDefined();
    });

    await user.click(screen.getByRole('button', { name: 'Add Provider' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined();
    });
  });

  it('navigates back to settings when Cancel is clicked on add page', async () => {
    const user = userEvent.setup();
    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add Provider' })).toBeDefined();
    });

    await user.click(screen.getByRole('button', { name: 'Add Provider' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    // Confirm the discard dialog
    await user.click(screen.getByRole('button', { name: 'Discard' }));

    await waitFor(() => {
      expect(screen.getByText('TokenGuard Copilot Settings')).toBeDefined();
    });
  });

  it('renders sections on the settings page', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByText('TokenGuard Copilot Settings')).toBeDefined();
    });

    expect(screen.getByText('Providers')).toBeDefined();
    expect(screen.getByText('Models')).toBeDefined();
    expect(screen.getByText('Danger Zone')).toBeDefined();
  });
});
