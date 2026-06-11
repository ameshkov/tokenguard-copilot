import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionContext as AppContext } from '../../context.js';
import type { WebviewCommand, FetchedModel, ModelInfo } from '@tokenguard/shared';
import { type Webview, window } from 'vscode';
import { createMockWebview, createMockAppCtx } from '../../test/settings-panel-helpers.js';
import {
  handleGetProviders,
  handleAddProvider,
  handleEditProvider,
  handleRemoveProvider,
  handleResetSettings,
  handleGetModels,
  handleFetchAvailableModels,
  handleAddModel,
  handleEditModel,
  handleRemoveModel,
  handleGetModelDefaults,
} from './message-handler-core.js';

const mockGetDefaults = vi.hoisted(() => vi.fn().mockReturnValue(null));
vi.mock('../../services/model-defaults/index.js', () => ({
  getDefaults: mockGetDefaults,
}));

vi.mock('vscode', () => ({
  window: { showInformationMessage: vi.fn() },
}));

describe('message-handler-core', () => {
  let appCtx: AppContext;
  let webview: Webview;

  beforeEach(() => {
    vi.clearAllMocks();
    appCtx = createMockAppCtx();
    webview = createMockWebview() as unknown as Webview;
  });

  // ── Provider handlers ──────────────────────────────────

  describe('Provider handlers', () => {
    it('handles getProviders request', async () => {
      const providers = [{ id: 'p1', name: 'A', baseUrl: 'https://a.com' }];
      vi.mocked(appCtx.providerManager.getProviders).mockReturnValue(providers);

      await handleGetProviders(appCtx, webview, {
        type: 'getProviders',
        requestId: 'r1',
      } as Extract<WebviewCommand, { type: 'getProviders' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'getProvidersResult',
        requestId: 'r1',
        providers,
      });
    });

    it('handles addProvider success', async () => {
      const provider = { id: 'p1', name: 'A', baseUrl: 'https://a.com' };
      vi.mocked(appCtx.providerManager.addProvider).mockResolvedValue(provider);

      await handleAddProvider(appCtx, webview, {
        type: 'addProvider',
        requestId: 'r2',
        name: 'A',
        baseUrl: 'https://a.com',
        apiKey: 'key',
      } as Extract<WebviewCommand, { type: 'addProvider' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'addProviderResult',
        requestId: 'r2',
        success: true,
        provider,
      });
    });

    it('handles addProvider failure', async () => {
      vi.mocked(appCtx.providerManager.addProvider).mockRejectedValue(new Error('Duplicate name'));

      await handleAddProvider(appCtx, webview, {
        type: 'addProvider',
        requestId: 'r3',
        name: 'A',
        baseUrl: 'https://a.com',
        apiKey: 'key',
      } as Extract<WebviewCommand, { type: 'addProvider' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'addProviderResult',
        requestId: 'r3',
        success: false,
        error: 'Duplicate name',
      });
    });

    it('handles editProvider success', async () => {
      const provider = { id: 'p1', name: 'Updated', baseUrl: 'https://new.com' };
      vi.mocked(appCtx.providerManager.editProvider).mockResolvedValue(provider);

      await handleEditProvider(appCtx, webview, {
        type: 'editProvider',
        requestId: 'r4',
        id: 'p1',
        name: 'Updated',
        baseUrl: 'https://new.com',
        apiKey: '',
      } as Extract<WebviewCommand, { type: 'editProvider' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'editProviderResult',
        requestId: 'r4',
        success: true,
        provider,
      });
    });

    it('handles editProvider failure', async () => {
      vi.mocked(appCtx.providerManager.editProvider).mockRejectedValue(new Error('Not found'));

      await handleEditProvider(appCtx, webview, {
        type: 'editProvider',
        requestId: 'r5',
        id: 'p1',
        name: 'X',
        baseUrl: 'https://x.com',
        apiKey: '',
      } as Extract<WebviewCommand, { type: 'editProvider' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'editProviderResult',
        requestId: 'r5',
        success: false,
        error: 'Not found',
      });
    });

    it('handles removeProvider success', async () => {
      vi.mocked(appCtx.providerManager.removeProvider).mockResolvedValue(undefined);

      await handleRemoveProvider(appCtx, webview, {
        type: 'removeProvider',
        requestId: 'r6',
        id: 'p1',
      } as Extract<WebviewCommand, { type: 'removeProvider' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'removeProviderResult',
        requestId: 'r6',
        success: true,
      });
    });

    it('handles removeProvider failure', async () => {
      vi.mocked(appCtx.providerManager.removeProvider).mockRejectedValue(new Error('Not found'));

      await handleRemoveProvider(appCtx, webview, {
        type: 'removeProvider',
        requestId: 'r7',
        id: 'p1',
      } as Extract<WebviewCommand, { type: 'removeProvider' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'removeProviderResult',
        requestId: 'r7',
        success: false,
        error: 'Not found',
      });
    });

    it('handles resetSettings success', async () => {
      vi.mocked(appCtx.providerManager.resetAll).mockResolvedValue(undefined);

      await handleResetSettings(appCtx, webview, {
        type: 'resetSettings',
        requestId: 'r8',
      } as Extract<WebviewCommand, { type: 'resetSettings' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'resetSettingsResult',
        requestId: 'r8',
        success: true,
      });
      expect(window.showInformationMessage).toHaveBeenCalledWith(
        'TokenGuard Copilot: All settings have been reset.',
      );
    });

    it('handles resetSettings failure', async () => {
      vi.mocked(appCtx.providerManager.resetAll).mockRejectedValue(new Error('DB error'));

      await handleResetSettings(appCtx, webview, {
        type: 'resetSettings',
        requestId: 'r9',
      } as Extract<WebviewCommand, { type: 'resetSettings' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'resetSettingsResult',
        requestId: 'r9',
        success: false,
        error: 'DB error',
      });
    });
  });

  // ── Model handlers ─────────────────────────────────────

  describe('Model handlers', () => {
    it('handles getModels request', async () => {
      const models = [{ id: 'm1', providerId: 'p1' }];
      vi.mocked(appCtx.modelRegistry.getModels).mockReturnValue(models as unknown as ModelInfo[]);

      await handleGetModels(appCtx, webview, {
        type: 'getModels',
        requestId: 'r10',
      } as Extract<WebviewCommand, { type: 'getModels' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'getModelsResult',
        requestId: 'r10',
        models,
      });
    });

    it('handles fetchAvailableModels success', async () => {
      const fetched = [{ id: 'gpt-4o', name: 'GPT-4o' }];
      vi.mocked(appCtx.modelRegistry.fetchModels).mockResolvedValue(
        fetched as unknown as FetchedModel[],
      );

      await handleFetchAvailableModels(appCtx, webview, {
        type: 'fetchAvailableModels',
        requestId: 'r11',
        providerId: 'p1',
      } as Extract<WebviewCommand, { type: 'fetchAvailableModels' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'fetchAvailableModelsResult',
        requestId: 'r11',
        success: true,
        models: fetched,
      });
    });

    it('handles fetchAvailableModels failure', async () => {
      vi.mocked(appCtx.modelRegistry.fetchModels).mockRejectedValue(new Error('401 Unauthorized'));

      await handleFetchAvailableModels(appCtx, webview, {
        type: 'fetchAvailableModels',
        requestId: 'r12',
        providerId: 'p1',
      } as Extract<WebviewCommand, { type: 'fetchAvailableModels' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'fetchAvailableModelsResult',
        requestId: 'r12',
        success: false,
        error: '401 Unauthorized',
      });
    });

    it('handles addModel success', async () => {
      const model = { id: 'gpt-4o', providerId: 'p1' };
      vi.mocked(appCtx.modelRegistry.addModel).mockReturnValue(model as unknown as ModelInfo);

      await handleAddModel(appCtx, webview, {
        type: 'addModel',
        requestId: 'r13',
        providerId: 'p1',
        modelId: 'gpt-4o',
        config: {},
      } as Extract<WebviewCommand, { type: 'addModel' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'addModelResult',
        requestId: 'r13',
        success: true,
        model,
      });
    });

    it('handles addModel failure', async () => {
      vi.mocked(appCtx.modelRegistry.addModel).mockImplementation(() => {
        throw new Error('already exists');
      });

      await handleAddModel(appCtx, webview, {
        type: 'addModel',
        requestId: 'r14',
        providerId: 'p1',
        modelId: 'gpt-4o',
        config: {},
      } as Extract<WebviewCommand, { type: 'addModel' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'addModelResult',
        requestId: 'r14',
        success: false,
        error: 'already exists',
      });
    });

    it('handles editModel success', async () => {
      const model = { id: 'gpt-4o', providerId: 'p1', displayName: 'Custom' };
      vi.mocked(appCtx.modelRegistry.updateModel).mockReturnValue(model as unknown as ModelInfo);

      await handleEditModel(appCtx, webview, {
        type: 'editModel',
        requestId: 'r15',
        providerId: 'p1',
        modelId: 'gpt-4o',
        config: {},
      } as Extract<WebviewCommand, { type: 'editModel' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'editModelResult',
        requestId: 'r15',
        success: true,
        model,
      });
    });

    it('handles editModel failure', async () => {
      vi.mocked(appCtx.modelRegistry.updateModel).mockImplementation(() => {
        throw new Error('Model not found');
      });

      await handleEditModel(appCtx, webview, {
        type: 'editModel',
        requestId: 'r16',
        providerId: 'p1',
        modelId: 'gpt-4o',
        config: {},
      } as Extract<WebviewCommand, { type: 'editModel' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'editModelResult',
        requestId: 'r16',
        success: false,
        error: 'Model not found',
      });
    });

    it('handles removeModel success', async () => {
      vi.mocked(appCtx.modelRegistry.removeModel).mockReturnValue(undefined);

      await handleRemoveModel(appCtx, webview, {
        type: 'removeModel',
        requestId: 'r17',
        providerId: 'p1',
        modelId: 'gpt-4o',
      } as Extract<WebviewCommand, { type: 'removeModel' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'removeModelResult',
        requestId: 'r17',
        success: true,
      });
    });

    it('handles removeModel failure', async () => {
      vi.mocked(appCtx.modelRegistry.removeModel).mockImplementation(() => {
        throw new Error('Model not found');
      });

      await handleRemoveModel(appCtx, webview, {
        type: 'removeModel',
        requestId: 'r18',
        providerId: 'p1',
        modelId: 'gpt-4o',
      } as Extract<WebviewCommand, { type: 'removeModel' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'removeModelResult',
        requestId: 'r18',
        success: false,
        error: 'Model not found',
      });
    });

    it('handles getModelDefaults request', async () => {
      const defaults = { contextSize: 128000, maxTokens: 16384 };
      mockGetDefaults.mockReturnValueOnce(defaults);

      await handleGetModelDefaults(appCtx, webview, {
        type: 'getModelDefaults',
        requestId: 'r19',
        modelId: 'gpt-4o',
      } as Extract<WebviewCommand, { type: 'getModelDefaults' }>);

      expect(mockGetDefaults).toHaveBeenCalledWith('gpt-4o');
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'getModelDefaultsResult',
        requestId: 'r19',
        defaults,
      });
    });

    it('handles getModelDefaults when no defaults found', async () => {
      mockGetDefaults.mockReturnValueOnce(null);

      await handleGetModelDefaults(appCtx, webview, {
        type: 'getModelDefaults',
        requestId: 'r20',
        modelId: 'unknown-model',
      } as Extract<WebviewCommand, { type: 'getModelDefaults' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'getModelDefaultsResult',
        requestId: 'r20',
        defaults: null,
      });
    });
  });
});
