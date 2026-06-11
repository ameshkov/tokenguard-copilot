import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./vscode-api.js', () => ({
  sendRequest: vi.fn(),
}));

import { sendRequest } from './vscode-api.js';
import {
  selectProvider,
  navigateToSettings,
  addProvider,
  editProvider,
  removeProvider,
  selectModel,
  addModel,
  editModel,
  removeModel,
} from './settings-handlers.js';
import type { FetchedModel, ModelConfig, ModelDefaultsResult } from '@tokenguard/shared';

// ── Helpers ──────────────────────────────────────────────

function mockSetPage() {
  return vi.fn();
}

function mockFetchedModel(overrides: Partial<FetchedModel> = {}): FetchedModel {
  return {
    id: 'gpt-4',
    name: 'GPT-4',
    maxContextWindowTokens: 128000,
    maxOutputTokens: 4096,
    defaultReasoningEffort: null,
    vision: false,
    supportedReasoningEfforts: null,
    inputCostPer1M: null,
    outputCostPer1M: null,
    cachedInputCostPer1M: null,
    ...overrides,
  };
}

function mockDefaults(overrides: Partial<ModelDefaultsResult> = {}): ModelDefaultsResult {
  return {
    contextSize: 128000,
    maxTokens: 4096,
    inputCostPer1M: 10,
    outputCostPer1M: 30,
    supportedCapabilities: ['streaming'],
    ...overrides,
  };
}

function mockModelConfig(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    displayName: 'GPT-4 Turbo',
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
    inputCostPer1m: 10,
    outputCostPer1m: 30,
    cachedInputCostPer1m: 5,
    cacheControl: null,
    customFields: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── selectProvider ───────────────────────────────────────

describe('selectProvider', () => {
  it('navigates to selectModel page and fetches models on success', async () => {
    const setPage = mockSetPage();
    vi.mocked(sendRequest).mockResolvedValue({
      type: 'fetchAvailableModelsResult',
      requestId: 'r1',
      success: true,
      models: [mockFetchedModel(), mockFetchedModel({ id: 'gpt-3.5', name: 'GPT-3.5' })],
    });

    await selectProvider('p1', setPage);

    expect(setPage).toHaveBeenCalledWith({
      type: 'selectModel',
      providerId: 'p1',
      models: [],
      loading: true,
      error: null,
    });

    expect(setPage).toHaveBeenCalledTimes(2);
    // Second call is a state updater function: (prev) => ({ ...prev, ... })
    const updater = setPage.mock.calls[1][0] as (
      prev: Record<string, unknown>,
    ) => Record<string, unknown>;
    const result = updater({ type: 'selectModel' });
    expect(result).toMatchObject({
      type: 'selectModel',
      models: [
        { id: 'gpt-4', name: 'GPT-4' },
        { id: 'gpt-3.5', name: 'GPT-3.5' },
      ],
      loading: false,
    });
  });

  it('sets error when fetch fails', async () => {
    const setPage = mockSetPage();
    vi.mocked(sendRequest).mockResolvedValue({
      type: 'fetchAvailableModelsResult',
      requestId: 'r1',
      success: false,
      error: 'Provider unreachable',
    });

    await selectProvider('p1', setPage);

    expect(setPage).toHaveBeenCalledTimes(2);
    const updater = setPage.mock.calls[1][0] as (
      prev: Record<string, unknown>,
    ) => Record<string, unknown>;
    const result = updater({ type: 'selectModel' });
    expect(result).toMatchObject({
      type: 'selectModel',
      loading: false,
      error: 'Provider unreachable',
    });
  });

  it('sets error when sendRequest throws', async () => {
    const setPage = mockSetPage();
    vi.mocked(sendRequest).mockRejectedValue(new Error('Network error'));

    await selectProvider('p1', setPage);

    expect(setPage).toHaveBeenCalledTimes(2);
    const updater = setPage.mock.calls[1][0] as (
      prev: Record<string, unknown>,
    ) => Record<string, unknown>;
    const result = updater({ type: 'selectModel' });
    expect(result).toMatchObject({
      type: 'selectModel',
      loading: false,
      error: 'Network error',
    });
  });
});

// ── navigateToSettings ───────────────────────────────────

describe('navigateToSettings', () => {
  it('resets page to settings and clears all loading/error states', () => {
    const setPage = vi.fn();
    const setProviderLoading = vi.fn();
    const setProviderError = vi.fn();
    const setModelConfigLoading = vi.fn();
    const setModelConfigError = vi.fn();

    navigateToSettings(
      setPage,
      setProviderLoading,
      setProviderError,
      setModelConfigLoading,
      setModelConfigError,
    );

    expect(setPage).toHaveBeenCalledWith({ type: 'settings' });
    expect(setProviderLoading).toHaveBeenCalledWith(false);
    expect(setProviderError).toHaveBeenCalledWith(null);
    expect(setModelConfigLoading).toHaveBeenCalledWith(false);
    expect(setModelConfigError).toHaveBeenCalledWith(null);
  });
});

// ── addProvider ──────────────────────────────────────────

describe('addProvider', () => {
  const name = 'My Provider';
  const baseUrl = 'https://api.example.com';
  const apiKey = 'sk-test';

  it('adds provider, navigates to settings, and refreshes on success', async () => {
    const setProviderLoading = vi.fn();
    const setProviderError = vi.fn();
    const goSettings = vi.fn();
    const fetchProviders = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'addProviderResult',
      requestId: 'r1',
      success: true,
    });

    await addProvider(
      name,
      baseUrl,
      apiKey,
      setProviderLoading,
      setProviderError,
      goSettings,
      fetchProviders,
    );

    expect(setProviderLoading).toHaveBeenCalledWith(true);
    expect(setProviderError).toHaveBeenCalledWith(null);
    expect(sendRequest).toHaveBeenCalledWith({
      type: 'addProvider',
      name,
      baseUrl,
      apiKey,
    });
    expect(setProviderLoading).toHaveBeenCalledWith(false);
    expect(goSettings).toHaveBeenCalled();
    expect(fetchProviders).toHaveBeenCalled();
  });

  it('sets error when add fails', async () => {
    const setProviderLoading = vi.fn();
    const setProviderError = vi.fn();
    const goSettings = vi.fn();
    const fetchProviders = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'addProviderResult',
      requestId: 'r1',
      success: false,
      error: 'Name already exists',
    });

    await addProvider(
      name,
      baseUrl,
      apiKey,
      setProviderLoading,
      setProviderError,
      goSettings,
      fetchProviders,
    );

    expect(setProviderError).toHaveBeenCalledWith('Name already exists');
    expect(goSettings).not.toHaveBeenCalled();
    expect(fetchProviders).not.toHaveBeenCalled();
  });
});

// ── editProvider ─────────────────────────────────────────

describe('editProvider', () => {
  const name = 'Updated Provider';
  const baseUrl = 'https://api.updated.com';
  const apiKey = 'sk-new';
  const providerId = 'p1';

  it('edits provider and navigates to settings on success', async () => {
    const setProviderLoading = vi.fn();
    const setProviderError = vi.fn();
    const goSettings = vi.fn();
    const fetchProviders = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'editProviderResult',
      requestId: 'r1',
      success: true,
    });

    await editProvider(
      name,
      baseUrl,
      apiKey,
      providerId,
      setProviderLoading,
      setProviderError,
      goSettings,
      fetchProviders,
    );

    expect(sendRequest).toHaveBeenCalledWith({
      type: 'editProvider',
      id: providerId,
      name,
      baseUrl,
      apiKey,
    });
    expect(goSettings).toHaveBeenCalled();
    expect(fetchProviders).toHaveBeenCalled();
  });

  it('sets error when edit fails', async () => {
    const setProviderError = vi.fn();
    const goSettings = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'editProviderResult',
      requestId: 'r1',
      success: false,
      error: 'Not found',
    });

    await editProvider(
      name,
      baseUrl,
      apiKey,
      providerId,
      vi.fn(),
      setProviderError,
      goSettings,
      vi.fn(),
    );

    expect(setProviderError).toHaveBeenCalledWith('Not found');
    expect(goSettings).not.toHaveBeenCalled();
  });
});

// ── removeProvider ───────────────────────────────────────

describe('removeProvider', () => {
  it('removes provider and refreshes both lists on success', async () => {
    const fetchProviders = vi.fn();
    const fetchModels = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'removeProviderResult',
      requestId: 'r1',
      success: true,
    });

    await removeProvider('p1', fetchProviders, fetchModels);

    expect(sendRequest).toHaveBeenCalledWith({
      type: 'removeProvider',
      id: 'p1',
    });
    expect(fetchProviders).toHaveBeenCalled();
    expect(fetchModels).toHaveBeenCalled();
  });

  it('does not refresh when removal fails', async () => {
    const fetchProviders = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'removeProviderResult',
      requestId: 'r1',
      success: false,
    });

    await removeProvider('p1', fetchProviders, vi.fn());

    expect(fetchProviders).not.toHaveBeenCalled();
  });
});

// ── selectModel ──────────────────────────────────────────

describe('selectModel', () => {
  const model = mockFetchedModel();
  const providerId = 'p1';

  it('fetches defaults and navigates to configureModel page', async () => {
    const setPage = mockSetPage();
    const defaults = mockDefaults();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'getModelDefaultsResult',
      requestId: 'r1',
      defaults,
    });

    await selectModel(model, providerId, setPage);

    expect(sendRequest).toHaveBeenCalledWith({
      type: 'getModelDefaults',
      modelId: 'gpt-4',
    });
    expect(setPage).toHaveBeenCalledWith({
      type: 'configureModel',
      providerId,
      fetchedModel: model,
      defaults,
    });
  });

  it('navigates with null defaults when fetch fails', async () => {
    const setPage = mockSetPage();

    vi.mocked(sendRequest).mockRejectedValue(new Error('Not found'));

    await selectModel(model, providerId, setPage);

    expect(setPage).toHaveBeenCalledWith({
      type: 'configureModel',
      providerId,
      fetchedModel: model,
      defaults: null,
    });
  });
});

// ── addModel ─────────────────────────────────────────────

describe('addModel', () => {
  const config = mockModelConfig();

  it('adds model, refreshes, and navigates to settings on success', async () => {
    const setModelConfigLoading = vi.fn();
    const setModelConfigError = vi.fn();
    const fetchModels = vi.fn();
    const goSettings = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'addModelResult',
      requestId: 'r1',
      success: true,
    });

    await addModel(
      config,
      'p1',
      'gpt-4',
      setModelConfigLoading,
      setModelConfigError,
      fetchModels,
      goSettings,
    );

    expect(setModelConfigLoading).toHaveBeenCalledWith(true);
    expect(setModelConfigError).toHaveBeenCalledWith(null);
    expect(sendRequest).toHaveBeenCalledWith({
      type: 'addModel',
      providerId: 'p1',
      modelId: 'gpt-4',
      config,
    });
    expect(fetchModels).toHaveBeenCalled();
    expect(goSettings).toHaveBeenCalled();
    expect(setModelConfigLoading).toHaveBeenCalledWith(false);
  });

  it('sets error and resets loading when add fails', async () => {
    const setModelConfigLoading = vi.fn();
    const setModelConfigError = vi.fn();
    const fetchModels = vi.fn();
    const goSettings = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'addModelResult',
      requestId: 'r1',
      success: false,
      error: 'Model already exists',
    });

    await addModel(
      config,
      'p1',
      'gpt-4',
      setModelConfigLoading,
      setModelConfigError,
      fetchModels,
      goSettings,
    );

    expect(setModelConfigError).toHaveBeenCalledWith('Model already exists');
    expect(setModelConfigLoading).toHaveBeenCalledWith(false);
    expect(fetchModels).not.toHaveBeenCalled();
  });

  it('sets error when sendRequest throws', async () => {
    const setModelConfigLoading = vi.fn();
    const setModelConfigError = vi.fn();

    vi.mocked(sendRequest).mockRejectedValue(new Error('Network failure'));

    await addModel(
      config,
      'p1',
      'gpt-4',
      setModelConfigLoading,
      setModelConfigError,
      vi.fn(),
      vi.fn(),
    );

    expect(setModelConfigError).toHaveBeenCalledWith('Network failure');
    expect(setModelConfigLoading).toHaveBeenCalledWith(false);
  });
});

// ── editModel ────────────────────────────────────────────

describe('editModel', () => {
  const config = mockModelConfig({
    displayName: 'GPT-4 Updated',
    maxContextWindowTokens: 64000,
    maxOutputTokens: 2048,
    streaming: false,
    vision: true,
    temperature: 0.7,
    preserveReasoning: true,
    inputCostPer1m: 5,
    outputCostPer1m: 15,
    cachedInputCostPer1m: null,
  });

  it('edits model, refreshes, and navigates to settings on success', async () => {
    const setModelConfigLoading = vi.fn();
    const setModelConfigError = vi.fn();
    const fetchModels = vi.fn();
    const goSettings = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'editModelResult',
      requestId: 'r1',
      success: true,
    });

    await editModel(
      config,
      'p1',
      'm1',
      setModelConfigLoading,
      setModelConfigError,
      fetchModels,
      goSettings,
    );

    expect(sendRequest).toHaveBeenCalledWith({
      type: 'editModel',
      providerId: 'p1',
      modelId: 'm1',
      config,
    });
    expect(fetchModels).toHaveBeenCalled();
    expect(goSettings).toHaveBeenCalled();
  });

  it('sets error when edit fails', async () => {
    const setModelConfigLoading = vi.fn();
    const setModelConfigError = vi.fn();
    const goSettings = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'editModelResult',
      requestId: 'r1',
      success: false,
      error: 'Model not found',
    });

    await editModel(
      config,
      'p1',
      'm1',
      setModelConfigLoading,
      setModelConfigError,
      vi.fn(),
      goSettings,
    );

    expect(setModelConfigError).toHaveBeenCalledWith('Model not found');
    expect(goSettings).not.toHaveBeenCalled();
  });
});

// ── removeModel ──────────────────────────────────────────

describe('removeModel', () => {
  it('removes model and refreshes list on success', async () => {
    const fetchModels = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'removeModelResult',
      requestId: 'r1',
      success: true,
    });

    await removeModel('p1', 'm1', fetchModels);

    expect(sendRequest).toHaveBeenCalledWith({
      type: 'removeModel',
      providerId: 'p1',
      modelId: 'm1',
    });
    expect(fetchModels).toHaveBeenCalled();
  });

  it('does not refresh when removal fails', async () => {
    const fetchModels = vi.fn();

    vi.mocked(sendRequest).mockResolvedValue({
      type: 'removeModelResult',
      requestId: 'r1',
      success: false,
    });

    await removeModel('p1', 'm1', fetchModels);

    expect(fetchModels).not.toHaveBeenCalled();
  });
});
