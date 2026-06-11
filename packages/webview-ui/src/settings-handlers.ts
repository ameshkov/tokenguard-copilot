import { sendRequest } from './vscode-api.js';
import type {
  FetchedModel,
  ModelDefaultsResult,
  FetchAvailableModelsResponse,
  AddProviderResponse,
  EditProviderResponse,
  RemoveProviderResponse,
  GetModelDefaultsResponse,
  AddModelResponse,
  EditModelResponse,
  RemoveModelResponse,
} from '@tokenguard/shared';
import type { ModelConfig } from '@tokenguard/shared';
import type { Page } from './settings-app.js';

/**
 * Fetch available models from a provider and update page state.
 *
 * Extracted from {@link SettingsApp} to keep function length under the
 * max-lines-per-function lint limit.
 *
 * @param providerId - The ID of the provider to fetch models from.
 * @param setPage - React state setter for the current page.
 */
export async function selectProvider(
  providerId: string,
  setPage: React.Dispatch<React.SetStateAction<Page>>,
): Promise<void> {
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
}

/**
 * Resets the page to the main settings view and clears all loading/error
 * states.
 *
 * Extracted from {@link SettingsApp} to keep function length under the
 * max-lines-per-function lint limit.
 *
 * @param setPage - React state setter for the current page.
 * @param setProviderLoading - Resets provider loading state.
 * @param setProviderError - Clears provider error.
 * @param setModelConfigLoading - Resets model config loading state.
 * @param setModelConfigError - Clears model config error.
 */
export function navigateToSettings(
  setPage: React.Dispatch<React.SetStateAction<Page>>,
  setProviderLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setProviderError: React.Dispatch<React.SetStateAction<string | null>>,
  setModelConfigLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setModelConfigError: React.Dispatch<React.SetStateAction<string | null>>,
): void {
  setPage({ type: 'settings' });
  setProviderLoading(false);
  setProviderError(null);
  setModelConfigLoading(false);
  setModelConfigError(null);
}

/**
 * Adds a new provider and refreshes the provider list on success.
 *
 * Extracted from {@link SettingsApp} to keep function length under the
 * max-lines-per-function lint limit.
 *
 * @param name - Provider display name.
 * @param baseUrl - Provider API base URL.
 * @param apiKey - Provider API key.
 * @param setProviderLoading - Sets provider form loading state.
 * @param setProviderError - Sets provider form error state.
 * @param goSettings - Navigates back to the main settings page.
 * @param fetchProviders - Re-fetches the provider list.
 */
export async function addProvider(
  name: string,
  baseUrl: string,
  apiKey: string,
  setProviderLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setProviderError: React.Dispatch<React.SetStateAction<string | null>>,
  goSettings: () => void,
  fetchProviders: () => Promise<void>,
): Promise<void> {
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
}

/**
 * Edits an existing provider and refreshes the provider list on success.
 *
 * Extracted from {@link SettingsApp} to keep function length under the
 * max-lines-per-function lint limit.
 *
 * @param name - New provider display name.
 * @param baseUrl - New provider API base URL.
 * @param apiKey - New provider API key.
 * @param providerId - The ID of the provider to edit.
 * @param setProviderLoading - Sets provider form loading state.
 * @param setProviderError - Sets provider form error state.
 * @param goSettings - Navigates back to the main settings page.
 * @param fetchProviders - Re-fetches the provider list.
 */
export async function editProvider(
  name: string,
  baseUrl: string,
  apiKey: string,
  providerId: string,
  setProviderLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setProviderError: React.Dispatch<React.SetStateAction<string | null>>,
  goSettings: () => void,
  fetchProviders: () => Promise<void>,
): Promise<void> {
  setProviderLoading(true);
  setProviderError(null);

  const response = await sendRequest<EditProviderResponse>({
    type: 'editProvider',
    id: providerId,
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
}

/**
 * Removes a provider and refreshes both provider and model lists on success.
 *
 * Extracted from {@link SettingsApp} to keep function length under the
 * max-lines-per-function lint limit.
 *
 * @param id - The ID of the provider to remove.
 * @param fetchProviders - Re-fetches the provider list.
 * @param fetchModels - Re-fetches the model list.
 */
export async function removeProvider(
  id: string,
  fetchProviders: () => Promise<void>,
  fetchModels: () => Promise<void>,
): Promise<void> {
  const response = await sendRequest<RemoveProviderResponse>({
    type: 'removeProvider',
    id,
  });
  if (response.success) {
    await Promise.all([fetchProviders(), fetchModels()]);
  }
}

/**
 * Fetches model defaults and navigates to the configure-model page.
 *
 * Extracted from {@link SettingsApp} to keep function length under the
 * max-lines-per-function lint limit.
 *
 * @param model - The fetched model to configure.
 * @param providerId - The ID of the provider the model belongs to.
 * @param setPage - React state setter for the current page.
 */
export async function selectModel(
  model: FetchedModel,
  providerId: string,
  setPage: React.Dispatch<React.SetStateAction<Page>>,
): Promise<void> {
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
    providerId,
    fetchedModel: model,
    defaults,
  });
}

/**
 * Adds a new model with configuration and refreshes the model list on success.
 *
 * Extracted from {@link SettingsApp} to keep function length under the
 * max-lines-per-function lint limit.
 *
 * @param config - The model configuration.
 * @param providerId - The ID of the provider.
 * @param modelId - The fetched model ID.
 * @param setModelConfigLoading - Sets model config loading state.
 * @param setModelConfigError - Sets model config error state.
 * @param fetchModels - Re-fetches the model list.
 * @param goSettings - Navigates back to the main settings page.
 */
export async function addModel(
  config: ModelConfig,
  providerId: string,
  modelId: string,
  setModelConfigLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setModelConfigError: React.Dispatch<React.SetStateAction<string | null>>,
  fetchModels: () => Promise<void>,
  goSettings: () => void,
): Promise<void> {
  setModelConfigLoading(true);
  setModelConfigError(null);
  try {
    const response = await sendRequest<AddModelResponse>({
      type: 'addModel',
      providerId,
      modelId,
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
}

/**
 * Edits an existing model's configuration and refreshes the model list on
 * success.
 *
 * Extracted from {@link SettingsApp} to keep function length under the
 * max-lines-per-function lint limit.
 *
 * @param config - The new model configuration.
 * @param providerId - The ID of the provider.
 * @param modelId - The ID of the model to edit.
 * @param setModelConfigLoading - Sets model config loading state.
 * @param setModelConfigError - Sets model config error state.
 * @param fetchModels - Re-fetches the model list.
 * @param goSettings - Navigates back to the main settings page.
 */
export async function editModel(
  config: ModelConfig,
  providerId: string,
  modelId: string,
  setModelConfigLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setModelConfigError: React.Dispatch<React.SetStateAction<string | null>>,
  fetchModels: () => Promise<void>,
  goSettings: () => void,
): Promise<void> {
  setModelConfigLoading(true);
  setModelConfigError(null);
  try {
    const response = await sendRequest<EditModelResponse>({
      type: 'editModel',
      providerId,
      modelId,
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
}

/**
 * Removes a model and refreshes the model list on success.
 *
 * Extracted from {@link SettingsApp} to keep function length under the
 * max-lines-per-function lint limit.
 *
 * @param providerId - The ID of the provider.
 * @param modelId - The ID of the model to remove.
 * @param fetchModels - Re-fetches the model list.
 */
export async function removeModel(
  providerId: string,
  modelId: string,
  fetchModels: () => Promise<void>,
): Promise<void> {
  const response = await sendRequest<RemoveModelResponse>({
    type: 'removeModel',
    providerId,
    modelId,
  });
  if (response.success) {
    await fetchModels();
  }
}
