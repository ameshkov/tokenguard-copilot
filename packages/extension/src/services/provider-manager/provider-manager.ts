import { EventEmitter } from 'vscode';
import type { SecretStorage } from 'vscode';
import type { ProviderInfo } from '@tokenguard/shared';
import type { ProviderRepository } from '../../repositories/index.js';
import type { Provider } from '../../db/index.js';
import type { ModelRegistry } from '../model-registry/index.js';
import type { Logger } from '../../logger/index.js';
import { buildUserAgent } from '../../utils/index.js';

/**
 * Callback that clears all data from the database and
 * SecretStorage.
 */
export type ResetCallback = () => Promise<void>;

/**
 * Manages provider lifecycle: validation, connectivity
 * verification, persistence, and change notification.
 */
export class ProviderManager {
  private readonly emitter = new EventEmitter<void>();

  /** Fires after providers are added or modified. */
  readonly onProvidersChanged = this.emitter.event;

  /**
   * Creates a new ProviderManager.
   *
   * @param providerRepo - Data-access layer for the providers table.
   * @param secrets - VS Code SecretStorage for API keys.
   * @param resetCallback - Callback to clear all data.
   * @param modelRegistry - Model registry for cascade removal.
   * @param logger - Logger for runtime diagnostics.
   * @param version - Extension version for User-Agent header.
   */
  constructor(
    private readonly providerRepo: ProviderRepository,
    private readonly secrets: SecretStorage,
    private readonly resetCallback: ResetCallback,
    private readonly modelRegistry: ModelRegistry,
    private readonly logger: Logger,
    private readonly version: string,
  ) {}

  /**
   * Adds a new provider after validating inputs and verifying
   * connectivity.
   *
   * @param name - Provider display name.
   * @param baseUrl - OpenAI-compatible API base URL.
   * @param apiKey - API key for authentication.
   * @returns The created provider info.
   * @throws Error if validation fails, name is duplicate, or
   *   connectivity check fails.
   */
  async addProvider(name: string, baseUrl: string, apiKey: string): Promise<ProviderInfo> {
    const trimmedName = name.trim();
    const trimmedKey = apiKey.trim();

    if (!trimmedName) {
      throw new Error('Provider name is required');
    }
    if (!trimmedKey) {
      throw new Error('API key is required');
    }

    try {
      new URL(baseUrl);
    } catch {
      throw new Error('Invalid base URL');
    }

    if (this.providerRepo.existsByName(trimmedName)) {
      throw new Error('A provider with this name already exists');
    }

    // Verify connectivity
    const modelsUrl = baseUrl.replace(/\/+$/, '') + '/models';
    const response = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${trimmedKey}`,
        'User-Agent': buildUserAgent(this.version),
      },
    });
    if (!response.ok) {
      throw new Error(`Provider verification failed: ${response.status} ${response.statusText}`);
    }

    // Persist
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const row = this.providerRepo.insert({
      id,
      name: trimmedName,
      baseUrl,
      createdAt: now,
      updatedAt: now,
    });

    await this.secrets.store(`tokenguard-copilot.provider.${id}`, trimmedKey);

    this.logger.info('Provider added', trimmedName);
    this.emitter.fire();

    return toProviderInfo(row);
  }

  /**
   * Returns all non-removed providers.
   *
   * @returns Array of provider info objects.
   */
  getProviders(): ProviderInfo[] {
    return this.providerRepo.findActive().map(toProviderInfo);
  }

  /**
   * Returns all providers including removed.
   *
   * @returns Array of provider info objects.
   */
  getAllProviders(): ProviderInfo[] {
    return this.providerRepo.findAll().map(toProviderInfo);
  }

  /**
   * Returns all providers including removed, with the
   * `removed` flag from the database row.
   *
   * @returns Array of provider info objects with status.
   */
  getAllProvidersWithStatus(): (ProviderInfo & {
    removed: boolean;
  })[] {
    return this.providerRepo.findAll().map((row) => ({
      ...toProviderInfo(row),
      removed: row.removed === 1,
    }));
  }

  /**
   * Edits an existing provider.
   *
   * Validates inputs, updates the provider row, and optionally
   * updates the API key in SecretStorage.
   *
   * @param id - Provider ID.
   * @param name - New display name.
   * @param baseUrl - New base URL.
   * @param apiKey - New API key (empty string = no change).
   * @returns Updated provider info.
   * @throws Error if validation fails or provider not found.
   */
  async editProvider(
    id: string,
    name: string,
    baseUrl: string,
    apiKey: string,
  ): Promise<ProviderInfo> {
    const trimmedName = name.trim();
    const trimmedKey = apiKey.trim();

    if (!trimmedName) {
      throw new Error('Provider name is required');
    }

    try {
      new URL(baseUrl);
    } catch {
      throw new Error('Invalid base URL');
    }

    if (this.providerRepo.existsByName(trimmedName, id)) {
      throw new Error('A provider with this name already exists');
    }

    // Resolve the API key to use for verification
    const verifyKey = trimmedKey || (await this.secrets.get(`tokenguard-copilot.provider.${id}`));
    if (!verifyKey) {
      throw new Error('No API key available for verification');
    }

    // Verify connectivity
    const modelsUrl = baseUrl.replace(/\/+$/, '') + '/models';
    const response = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${verifyKey}`,
        'User-Agent': buildUserAgent(this.version),
      },
    });
    if (!response.ok) {
      throw new Error(`Provider verification failed: ${response.status} ${response.statusText}`);
    }

    const updated = this.providerRepo.update(id, {
      name: trimmedName,
      baseUrl,
    });

    if (!updated) {
      throw new Error('Provider not found');
    }

    if (trimmedKey) {
      await this.secrets.store(`tokenguard-copilot.provider.${id}`, trimmedKey);
    }

    this.logger.debug('Provider updated', `id=${id}`, `name=${trimmedName}`);

    this.emitter.fire();

    return toProviderInfo(updated);
  }

  /**
   * Soft-removes a provider and deletes its API key.
   *
   * @param id - Provider ID.
   * @throws Error if provider not found.
   */
  async removeProvider(id: string): Promise<void> {
    this.modelRegistry.removeModelsByProvider(id);

    const removed = this.providerRepo.softRemove(id);
    if (!removed) {
      throw new Error('Provider not found');
    }

    await this.secrets.delete(`tokenguard-copilot.provider.${id}`);

    this.logger.debug('Provider removed', `id=${id}`);

    this.emitter.fire();
  }

  /**
   * Resets all settings by clearing the database and
   * SecretStorage.
   */
  async resetAll(): Promise<void> {
    this.logger.info('Resetting all settings');
    await this.resetCallback();
    this.modelRegistry.disposeAll();
    this.emitter.fire();
  }

  /**
   * Disposes the provider manager and releases the
   * `onProvidersChanged` event emitter.
   */
  dispose(): void {
    this.emitter.dispose();
  }
}

/**
 * Maps a database Provider row to a ProviderInfo object for
 * the webview.
 *
 * @param row - Database provider row.
 * @returns ProviderInfo with id, name, baseUrl.
 */
function toProviderInfo(row: Provider): ProviderInfo {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
  };
}
