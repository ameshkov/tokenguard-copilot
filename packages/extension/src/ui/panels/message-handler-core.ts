import { type Webview, window } from 'vscode';
import type { ExtensionContext as AppContext } from '../../context.js';
import { getDefaults } from '../../services/model-defaults/index.js';
import type {
  WebviewCommand,
  GetProvidersResponse,
  AddProviderResponse,
  EditProviderResponse,
  RemoveProviderResponse,
  ResetSettingsResponse,
  GetModelsResponse,
  FetchAvailableModelsResponse,
  AddModelResponse,
  EditModelResponse,
  RemoveModelResponse,
  GetModelDefaultsResponse,
} from '@tokenguard/shared';

/**
 * Extracts a human-readable error message from any thrown value.
 *
 * @param error - The caught error.
 * @returns A string representation of the error.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Handles the getProviders webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleGetProviders(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'getProviders' }>,
): Promise<void> {
  const providers = appCtx.providerManager.getProviders();
  await webview.postMessage({
    type: 'getProvidersResult',
    requestId: message.requestId,
    providers,
  } satisfies GetProvidersResponse);
}

/**
 * Handles the addProvider webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleAddProvider(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'addProvider' }>,
): Promise<void> {
  try {
    const provider = await appCtx.providerManager.addProvider(
      message.name,
      message.baseUrl,
      message.apiKey,
    );
    await webview.postMessage({
      type: 'addProviderResult',
      requestId: message.requestId,
      success: true,
      provider,
    } satisfies AddProviderResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'addProviderResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies AddProviderResponse);
  }
}

/**
 * Handles the editProvider webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleEditProvider(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'editProvider' }>,
): Promise<void> {
  try {
    const provider = await appCtx.providerManager.editProvider(
      message.id,
      message.name,
      message.baseUrl,
      message.apiKey,
    );
    await webview.postMessage({
      type: 'editProviderResult',
      requestId: message.requestId,
      success: true,
      provider,
    } satisfies EditProviderResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'editProviderResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies EditProviderResponse);
  }
}

/**
 * Handles the removeProvider webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleRemoveProvider(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'removeProvider' }>,
): Promise<void> {
  try {
    await appCtx.providerManager.removeProvider(message.id);
    await webview.postMessage({
      type: 'removeProviderResult',
      requestId: message.requestId,
      success: true,
    } satisfies RemoveProviderResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'removeProviderResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies RemoveProviderResponse);
  }
}

/**
 * Handles the resetSettings webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleResetSettings(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'resetSettings' }>,
): Promise<void> {
  try {
    await appCtx.providerManager.resetAll();
    await webview.postMessage({
      type: 'resetSettingsResult',
      requestId: message.requestId,
      success: true,
    } satisfies ResetSettingsResponse);
    void window.showInformationMessage('TokenGuard Copilot: All settings have been reset.');
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'resetSettingsResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies ResetSettingsResponse);
  }
}

/**
 * Handles the getModels webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleGetModels(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'getModels' }>,
): Promise<void> {
  const models = appCtx.modelRegistry.getModels();
  await webview.postMessage({
    type: 'getModelsResult',
    requestId: message.requestId,
    models,
  } satisfies GetModelsResponse);
}

/**
 * Handles the fetchAvailableModels webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleFetchAvailableModels(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'fetchAvailableModels' }>,
): Promise<void> {
  try {
    const models = await appCtx.modelRegistry.fetchModels(message.providerId);
    await webview.postMessage({
      type: 'fetchAvailableModelsResult',
      requestId: message.requestId,
      success: true,
      models,
    } satisfies FetchAvailableModelsResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'fetchAvailableModelsResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies FetchAvailableModelsResponse);
  }
}

/**
 * Handles the addModel webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleAddModel(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'addModel' }>,
): Promise<void> {
  try {
    const model = appCtx.modelRegistry.addModel(
      message.providerId,
      message.modelId,
      message.config,
    );
    await webview.postMessage({
      type: 'addModelResult',
      requestId: message.requestId,
      success: true,
      model,
    } satisfies AddModelResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'addModelResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies AddModelResponse);
  }
}

/**
 * Handles the editModel webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleEditModel(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'editModel' }>,
): Promise<void> {
  try {
    const model = appCtx.modelRegistry.updateModel(
      message.providerId,
      message.modelId,
      message.config,
    );
    await webview.postMessage({
      type: 'editModelResult',
      requestId: message.requestId,
      success: true,
      model,
    } satisfies EditModelResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'editModelResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies EditModelResponse);
  }
}

/**
 * Handles the removeModel webview message.
 *
 * @param appCtx - The application context with services.
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleRemoveModel(
  appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'removeModel' }>,
): Promise<void> {
  try {
    appCtx.modelRegistry.removeModel(message.providerId, message.modelId);
    await webview.postMessage({
      type: 'removeModelResult',
      requestId: message.requestId,
      success: true,
    } satisfies RemoveModelResponse);
  } catch (error: unknown) {
    await webview.postMessage({
      type: 'removeModelResult',
      requestId: message.requestId,
      success: false,
      error: errorMessage(error),
    } satisfies RemoveModelResponse);
  }
}

/**
 * Handles the getModelDefaults webview message.
 *
 * @param _appCtx - The application context (unused; defaults are
 *   from bundled asset).
 * @param webview - The webview to post the response to.
 * @param message - The incoming message.
 */
export async function handleGetModelDefaults(
  _appCtx: AppContext,
  webview: Webview,
  message: Extract<WebviewCommand, { type: 'getModelDefaults' }>,
): Promise<void> {
  void _appCtx;
  const defaults = getDefaults(message.modelId);
  await webview.postMessage({
    type: 'getModelDefaultsResult',
    requestId: message.requestId,
    defaults,
  } satisfies GetModelDefaultsResponse);
}
