import { useState, useEffect, useCallback } from 'react';

import type {
  ProviderInfo,
  ModelInfo,
  FetchedModel,
  ModelDefaultsResult,
  ContentRuleInfo,
  GetProvidersResponse,
  GetModelsResponse,
} from '@tokenguard/shared';
import type { ModelConfig } from '@tokenguard/shared';
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
import {
  ProviderForm,
  ProviderList,
  ModelsSection,
  UsageStatsSection,
  GlobalActions,
  ModelConfigDialog,
  ChatDebugSection,
  ContentRulesSection,
} from './sections/index.js';
import { SelectProviderPage, SelectModelPage, ContentRuleFormPage } from './pages/index.js';
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
  | { type: 'editModel'; model: ModelInfo }
  | { type: 'contentRules' }
  | { type: 'editContentRule'; rule: ContentRuleInfo };

/**
 * Props for {@link SettingsPageRouter}.
 *
 * Flattened props extracted from {@link SettingsApp} to keep the render
 * switch under the max-lines-per-function lint limit.
 */
interface SettingsPageRouterProps {
  /** Current page state (discriminated union router). */
  page: Page;
  /** Navigate to a different page. */
  setPage: (page: Page) => void;
  /** All registered providers. */
  providers: ProviderInfo[];
  /** All registered models. */
  models: ModelInfo[];
  /** Incremented to force UsageStatsSection re-fetch. */
  statsRefreshKey: number;
  /** Increment the stats refresh key. */
  setStatsRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  /** Loading state for provider add/edit form. */
  providerLoading: boolean;
  /** Error state for provider add/edit form. */
  providerError: string | null;
  /** Loading state for model config form. */
  modelConfigLoading: boolean;
  /** Error state for model config form. */
  modelConfigError: string | null;
  /** Navigate back to the main settings page. */
  goSettings: () => void;
  /** Submit handler: add a new provider. */
  handleAddProvider: (name: string, baseUrl: string, apiKey: string) => Promise<void>;
  /** Submit handler: edit an existing provider. */
  handleEditProvider: (name: string, baseUrl: string, apiKey: string) => Promise<void>;
  /** Remove a provider by ID. */
  handleRemoveProvider: (id: string) => Promise<void>;
  /** Fetch available models from a provider (step 1 of add-model wizard). */
  handleSelectProvider: (providerId: string) => void;
  /** Select a fetched model and navigate to configure (step 2). */
  handleSelectModel: (model: FetchedModel) => Promise<void>;
  /** Submit handler: add a new model with config. */
  handleAddModel: (config: ModelConfig) => Promise<void>;
  /** Submit handler: edit an existing model's config. */
  handleEditModel: (config: ModelConfig) => Promise<void>;
  /** Remove a model by provider + model ID. */
  handleRemoveModel: (providerId: string, modelId: string) => Promise<void>;
  /** Re-fetch providers from the extension host. */
  fetchProviders: () => Promise<void>;
  /** Re-fetch models from the extension host. */
  fetchModels: () => Promise<void>;
}

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

  // Stats refresh trigger — incremented to force UsageStatsSection
  // to re-fetch after a stats reset.
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);

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

  const goSettings = useCallback(() => {
    navigateToSettings(
      setPage,
      setProviderLoading,
      setProviderError,
      setModelConfigLoading,
      setModelConfigError,
    );
  }, [setPage, setProviderLoading, setProviderError, setModelConfigLoading, setModelConfigError]);

  // ── Provider handlers ───────────────────────────────────

  const handleAddProvider = useCallback(
    async (name: string, baseUrl: string, apiKey: string) => {
      await addProvider(
        name,
        baseUrl,
        apiKey,
        setProviderLoading,
        setProviderError,
        goSettings,
        fetchProviders,
      );
    },
    [setProviderLoading, setProviderError, goSettings, fetchProviders],
  );

  const handleEditProvider = useCallback(
    async (name: string, baseUrl: string, apiKey: string) => {
      if (page.type !== 'editProvider') return;
      await editProvider(
        name,
        baseUrl,
        apiKey,
        page.provider.id,
        setProviderLoading,
        setProviderError,
        goSettings,
        fetchProviders,
      );
    },
    [page, setProviderLoading, setProviderError, goSettings, fetchProviders],
  );

  const handleRemoveProvider = useCallback(
    async (id: string) => {
      await removeProvider(id, fetchProviders, fetchModels);
    },
    [fetchProviders, fetchModels],
  );

  // ── Model flow handlers ─────────────────────────────────

  const handleSelectProvider = useCallback(
    (providerId: string) => {
      void selectProvider(providerId, setPage);
    },
    [setPage],
  );

  const handleSelectModel = useCallback(
    async (model: FetchedModel) => {
      if (page.type !== 'selectModel') return;
      await selectModel(model, page.providerId, setPage);
    },
    [page, setPage],
  );

  const handleAddModel = useCallback(
    async (config: ModelConfig) => {
      if (page.type !== 'configureModel') return;
      await addModel(
        config,
        page.providerId,
        page.fetchedModel.id,
        setModelConfigLoading,
        setModelConfigError,
        fetchModels,
        goSettings,
      );
    },
    [page, setModelConfigLoading, setModelConfigError, fetchModels, goSettings],
  );

  const handleEditModel = useCallback(
    async (config: ModelConfig) => {
      if (page.type !== 'editModel') return;
      await editModel(
        config,
        page.model.providerId,
        page.model.id,
        setModelConfigLoading,
        setModelConfigError,
        fetchModels,
        goSettings,
      );
    },
    [page, setModelConfigLoading, setModelConfigError, fetchModels, goSettings],
  );

  const handleRemoveModel = useCallback(
    async (providerId: string, modelId: string) => {
      await removeModel(providerId, modelId, fetchModels);
    },
    [fetchModels],
  );

  // ── Render ──────────────────────────────────────────────

  return (
    <SettingsPageRouter
      page={page}
      setPage={setPage}
      providers={providers}
      models={models}
      statsRefreshKey={statsRefreshKey}
      setStatsRefreshKey={setStatsRefreshKey}
      providerLoading={providerLoading}
      providerError={providerError}
      modelConfigLoading={modelConfigLoading}
      modelConfigError={modelConfigError}
      goSettings={goSettings}
      handleAddProvider={handleAddProvider}
      handleEditProvider={handleEditProvider}
      handleRemoveProvider={handleRemoveProvider}
      handleSelectProvider={handleSelectProvider}
      handleSelectModel={handleSelectModel}
      handleAddModel={handleAddModel}
      handleEditModel={handleEditModel}
      handleRemoveModel={handleRemoveModel}
      fetchProviders={fetchProviders}
      fetchModels={fetchModels}
    />
  );
}

/**
 * Renders the current page based on the {@link Page} discriminated union.
 *
 * Extracted from {@link SettingsApp} to keep function length under the
 * max-lines-per-function lint limit.
 *
 * @param props - All state and handlers from the parent component.
 * @returns The page element for the current route.
 */
function SettingsPageRouter(props: SettingsPageRouterProps): React.JSX.Element {
  const {
    page,
    setPage,
    providers,
    models,
    statsRefreshKey,
    setStatsRefreshKey,
    providerLoading,
    providerError,
    modelConfigLoading,
    modelConfigError,
    goSettings,
    handleAddProvider,
    handleEditProvider,
    handleRemoveProvider,
    handleSelectProvider,
    handleSelectModel,
    handleAddModel,
    handleEditModel,
    handleRemoveModel,
    fetchProviders,
    fetchModels,
  } = props;

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

    case 'contentRules':
      return (
        <main className="settings-container">
          <ContentRuleFormPage onDone={goSettings} />
        </main>
      );

    case 'editContentRule':
      return (
        <main className="settings-container">
          <ContentRuleFormPage editingRule={page.rule} onDone={goSettings} />
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
          <UsageStatsSection
            providers={providers}
            models={models}
            refreshTrigger={statsRefreshKey}
          />
          <ContentRulesSection
            onAdd={() => setPage({ type: 'contentRules' })}
            onEdit={(rule) => setPage({ type: 'editContentRule', rule })}
          />
          <ChatDebugSection />
          <GlobalActions
            onReset={() => {
              void fetchProviders();
              void fetchModels();
            }}
            onStatsReset={() => setStatsRefreshKey((k) => k + 1)}
          />
        </main>
      );
  }
}
