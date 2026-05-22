import { useState, useEffect, useCallback } from 'react';

import type {
  ProviderInfo,
  ModelInfo,
  FetchedModel,
  ModelDefaultsResult,
  GetProvidersResponse,
  AddProviderResponse,
  EditProviderResponse,
  RemoveProviderResponse,
  GetModelsResponse,
  FetchAvailableModelsResponse,
  GetModelDefaultsResponse,
  AddModelResponse,
  EditModelResponse,
  RemoveModelResponse,
} from '@tokenguard/shared';
import type { ModelConfig } from '@tokenguard/shared';
import { sendRequest } from './vscode-api.js';
import {
  ProviderForm,
  ProviderList,
  ModelsSection,
  UsageStatsSection,
  GlobalActions,
  ModelConfigDialog,
  ChatDebugSection,
} from './sections/index.js';
import { SelectProviderPage, SelectModelPage } from './pages/index.js';
import { SectionHeader, Button } from './components/index.js';

/**
 * Discriminated union describing the current page.
 */
export type Page =
  | { type: 'settings' }
  | { type: 'addProvider' }
  | { type: 'editProvider'; provider: ProviderInfo }
  | { type: 'selectProvider' }
  | {
      type: 'selectModel';
      providerId: string;
      models: FetchedModel[];
      loading: boolean;
      error: string | null;
    }
  | {
      type: 'configureModel';
      providerId: string;
      fetchedModel: FetchedModel;
      defaults: ModelDefaultsResult | null;
    }
  | { type: 'editModel'; model: ModelInfo };

/**
 * Root settings application component.
 *
 * Uses a {@link Page} discriminated union as a simple router
 * to decide which full-page view to render.
 *
 * @returns The settings page element.
 */
export function SettingsApp(): React.JSX.Element {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [page, setPage] = useState<Page>({ type: 'settings' });

  // Provider form state (shared by add/edit provider pages).
  const [providerLoading, setProviderLoading] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);

  // Model config state (shared by configure/edit model pages).
  const [modelConfigLoading, setModelConfigLoading] = useState(false);
  const [modelConfigError, setModelConfigError] = useState<string | null>(null);

  const fetchProviders = useCallback(async () => {
    const response = await sendRequest<GetProvidersResponse>({
      type: 'getProviders',
    });
    setProviders(response.providers);
  }, []);

  const fetchModels = useCallback(async () => {
    const response = await sendRequest<GetModelsResponse>({
      type: 'getModels',
    });
    setModels(response.models);
  }, []);

  useEffect(() => {
    void fetchProviders();
    void fetchModels();
  }, [fetchProviders, fetchModels]);

  // ── Navigation helpers ──────────────────────────────────

  const goSettings = () => {
    setPage({ type: 'settings' });
    setProviderLoading(false);
    setProviderError(null);
    setModelConfigLoading(false);
    setModelConfigError(null);
  };

  // ── Provider handlers ───────────────────────────────────

  const handleAddProvider = async (name: string, baseUrl: string, apiKey: string) => {
    setProviderLoading(true);
    setProviderError(null);

    const response = await sendRequest<AddProviderResponse>({
      type: 'addProvider',
      name,
      baseUrl,
      apiKey,
    });

    setProviderLoading(false);
    if (!response.success) {
      setProviderError(response.error ?? 'Unknown error');
    } else {
      goSettings();
      await fetchProviders();
    }
  };

  const handleEditProvider = async (name: string, baseUrl: string, apiKey: string) => {
    if (page.type !== 'editProvider') return;
    setProviderLoading(true);
    setProviderError(null);

    const response = await sendRequest<EditProviderResponse>({
      type: 'editProvider',
      id: page.provider.id,
      name,
      baseUrl,
      apiKey,
    });

    setProviderLoading(false);
    if (!response.success) {
      setProviderError(response.error ?? 'Unknown error');
    } else {
      goSettings();
      await fetchProviders();
    }
  };

  const handleRemoveProvider = async (id: string) => {
    const response = await sendRequest<RemoveProviderResponse>({
      type: 'removeProvider',
      id,
    });
    if (response.success) {
      await Promise.all([fetchProviders(), fetchModels()]);
    }
  };

  // ── Model flow handlers ─────────────────────────────────

  const handleSelectProvider = async (providerId: string) => {
    setPage({
      type: 'selectModel',
      providerId,
      models: [],
      loading: true,
      error: null,
    });

    try {
      const response = await sendRequest<FetchAvailableModelsResponse>({
        type: 'fetchAvailableModels',
        providerId,
      });
      if (!response.success) {
        setPage((prev) =>
          prev.type === 'selectModel'
            ? {
                ...prev,
                loading: false,
                error: response.error ?? 'Unknown error',
              }
            : prev,
        );
        return;
      }
      setPage((prev) =>
        prev.type === 'selectModel'
          ? {
              ...prev,
              models: response.models ?? [],
              loading: false,
            }
          : prev,
      );
    } catch (err: unknown) {
      setPage((prev) =>
        prev.type === 'selectModel'
          ? {
              ...prev,
              loading: false,
              error: err instanceof Error ? err.message : String(err),
            }
          : prev,
      );
    }
  };

  const handleSelectModel = async (model: FetchedModel) => {
    if (page.type !== 'selectModel') return;
    let defaults: ModelDefaultsResult | null = null;
    try {
      const resp = await sendRequest<GetModelDefaultsResponse>({
        type: 'getModelDefaults',
        modelId: model.id,
      });
      defaults = resp.defaults;
    } catch {
      // Defaults are optional.
    }
    setPage({
      type: 'configureModel',
      providerId: page.providerId,
      fetchedModel: model,
      defaults,
    });
  };

  const handleAddModel = async (config: ModelConfig) => {
    if (page.type !== 'configureModel') return;
    setModelConfigLoading(true);
    setModelConfigError(null);
    try {
      const response = await sendRequest<AddModelResponse>({
        type: 'addModel',
        providerId: page.providerId,
        modelId: page.fetchedModel.id,
        config,
      });
      if (!response.success) {
        throw new Error(response.error ?? 'Unknown error');
      }
      await fetchModels();
      goSettings();
    } catch (err: unknown) {
      setModelConfigError(err instanceof Error ? err.message : String(err));
    } finally {
      setModelConfigLoading(false);
    }
  };

  const handleEditModel = async (config: ModelConfig) => {
    if (page.type !== 'editModel') return;
    setModelConfigLoading(true);
    setModelConfigError(null);
    try {
      const response = await sendRequest<EditModelResponse>({
        type: 'editModel',
        providerId: page.model.providerId,
        modelId: page.model.id,
        config,
      });
      if (!response.success) {
        throw new Error(response.error ?? 'Unknown error');
      }
      await fetchModels();
      goSettings();
    } catch (err: unknown) {
      setModelConfigError(err instanceof Error ? err.message : String(err));
    } finally {
      setModelConfigLoading(false);
    }
  };

  const handleRemoveModel = async (providerId: string, modelId: string) => {
    const response = await sendRequest<RemoveModelResponse>({
      type: 'removeModel',
      providerId,
      modelId,
    });
    if (response.success) {
      await fetchModels();
    }
  };

  // ── Render ──────────────────────────────────────────────

  switch (page.type) {
    case 'addProvider':
      return (
        <main className="settings-container">
          <ProviderForm
            onSubmit={handleAddProvider}
            loading={providerLoading}
            error={providerError}
            visible={true}
            onCancel={goSettings}
          />
        </main>
      );

    case 'editProvider':
      return (
        <main className="settings-container">
          <ProviderForm
            onSubmit={handleEditProvider}
            loading={providerLoading}
            error={providerError}
            visible={true}
            editingProvider={page.provider}
            onCancel={goSettings}
          />
        </main>
      );

    case 'selectProvider':
      return (
        <main className="settings-container">
          <SelectProviderPage
            providers={providers}
            onSelect={(id) => void handleSelectProvider(id)}
            onCancel={goSettings}
          />
        </main>
      );

    case 'selectModel':
      return (
        <main className="settings-container">
          <SelectModelPage
            loading={page.loading}
            error={page.error}
            models={page.models}
            onSelect={(m) => void handleSelectModel(m)}
            onCancel={goSettings}
          />
        </main>
      );

    case 'configureModel':
      return (
        <main className="settings-container">
          <h1>Add Model</h1>
          <p>Configure the model parameters.</p>
          <ModelConfigDialog
            fetchedModel={page.fetchedModel}
            defaults={page.defaults}
            providerName={providers.find((p) => p.id === page.providerId)?.name}
            loading={modelConfigLoading}
            error={modelConfigError}
            onSubmit={(config) => void handleAddModel(config)}
            onCancel={goSettings}
          />
        </main>
      );

    case 'editModel':
      return (
        <main className="settings-container">
          <h1>Edit Model</h1>
          <p>Update the model configuration.</p>
          <ModelConfigDialog
            editingModel={page.model}
            providerName={providers.find((p) => p.id === page.model.providerId)?.name}
            loading={modelConfigLoading}
            error={modelConfigError}
            onSubmit={(config) => void handleEditModel(config)}
            onCancel={goSettings}
          />
        </main>
      );

    case 'settings':
    default:
      return (
        <main className="settings-container">
          <h1>TokenGuard Copilot Settings</h1>
          <p>Manage providers, models, and usage.</p>

          <SectionHeader title="Providers" />
          <ProviderList
            providers={providers}
            onEdit={(p) => setPage({ type: 'editProvider', provider: p })}
            onRemove={(id) => handleRemoveProvider(id)}
          />

          <Button onClick={() => setPage({ type: 'addProvider' })}>Add Provider</Button>

          <ModelsSection
            models={models}
            providers={providers}
            onAdd={() => setPage({ type: 'selectProvider' })}
            onEdit={(m) => setPage({ type: 'editModel', model: m })}
            onRemove={(providerId, modelId) => handleRemoveModel(providerId, modelId)}
          />
          <UsageStatsSection />
          <ChatDebugSection />
          <GlobalActions
            onReset={() => {
              void fetchProviders();
              void fetchModels();
            }}
          />
        </main>
      );
  }
}
