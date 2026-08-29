import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FetchedModel, ModelDefaultsResult } from '@tokenguard/shared';
import type { Logger } from '../../logger/index.js';
import { deriveDefaults, type ModelsDevModel } from './derive-defaults.js';

/** Subsection of a models.dev provider entry used for defaults. */
interface ModelsDevProvider {
  /** Provider identifier. */
  id?: string;
  /** Human-readable provider name. */
  name?: string;
  /** OpenAI-compatible API base URL, when the provider
   *  exposes one. */
  api?: string;
  /** Models keyed by model ID. */
  models?: Record<string, ModelsDevModel>;
}

/** Root models.dev snapshot keyed by provider ID. */
type ModelsDevData = Record<string, ModelsDevProvider>;

/**
 * Static host → models.dev provider ID table for providers
 * that ship without an `api` URL (SDK-based providers).
 */
const KNOWN_MODELS_DEV_HOSTS: Readonly<Record<string, string>> = {
  'api.openai.com': 'openai',
  'api.anthropic.com': 'anthropic',
  'generativelanguage.googleapis.com': 'google',
  'us-aiplatform.googleapis.com': 'google-vertex',
  'aiplatform.googleapis.com': 'google-vertex',
  'api.x.ai': 'xai',
  'api.cohere.com': 'cohere',
  'api.mistral.ai': 'mistral',
  'api.groq.com': 'groq',
  'api.cerebras.ai': 'cerebras',
  'api.together.xyz': 'togetherai',
  'api.perplexity.ai': 'perplexity',
  'api.deepinfra.com': 'deepinfra',
  'aihubmix.com': 'aihubmix',
  'openai.azure.com': 'azure',
};

/** Suffix for region-scoped Azure OpenAI hosts, e.g.
 *  `my-resource.openai.azure.com`. */
const AZURE_HOST_SUFFIX = '.openai.azure.com';

/**
 * Extracts the lowercase hostname from a URL string.
 *
 * @param url - The URL to parse, or `null`/`undefined`.
 * @returns The hostname, or `null` when the URL is invalid.
 */
function hostnameOf(url: string | null | undefined): string | null {
  if (url === null || url === undefined) {
    return null;
  }
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Looks up model defaults from a bundled models.dev snapshot.
 *
 * The snapshot (`assets/models.dev.json`) is fetched at build
 * time and committed. It is loaded synchronously on first use
 * and cached for the service lifetime.
 *
 * Provider resolution order:
 * 1. Host of the provider base URL matched against the
 *    snapshot's `api` hosts.
 * 2. Host of the base URL matched against
 *    {@link KNOWN_MODELS_DEV_HOSTS} (SDK-only providers).
 * 3. Model ID prefix (`foo/bar` ⇒ models.dev provider `foo`),
 *    falling back to lookup inside the resolved provider's
 *    `models` map by the full model ID.
 * 4. Last resort: global model-ID search across all providers
 *    (custom gateways that proxy prefixed OpenRouter model IDs
 *    such as `openai/gpt-5-nano`).
 *
 * Synchronous file reads keep webview request handling free
 * of async state.
 */
export class ModelDefaultsService {
  private readonly jsonPath: string;
  private readonly logger: Logger;
  private data: ModelsDevData | null = null;
  private providersById: Map<string, ModelsDevProvider> | null = null;
  private providersByApiHost: Map<string, string> | null = null;

  /**
   * Creates a new ModelDefaultsService.
   *
   * @param deps - Dependencies.
   * @param deps.logger - Runtime diagnostics logger.
   * @param deps.jsonPath - Path to the models.dev snapshot.
   *   Defaults to the bundled `assets/models.dev.json`; tests
   *   inject a fixture path.
   */
  constructor(deps: { logger: Logger; jsonPath?: string }) {
    this.logger = deps.logger;
    this.jsonPath = deps.jsonPath ?? resolve(__dirname, '..', 'assets', 'models.dev.json');
  }

  /**
   * Returns known default configuration values for a model,
   * or `null` if the model is not present in the bundled
   * models.dev snapshot.
   *
   * @param providerBaseUrl - The provider base URL, used to
   *   resolve the models.dev provider. `null` when unknown.
   * @param modelId - The model identifier to look up.
   * @returns The matching defaults, or `null` if not found.
   */
  getDefaults(providerBaseUrl: string | null, modelId: string): ModelDefaultsResult | null {
    const providerId = this.resolveProviderId(providerBaseUrl, modelId);
    // models.dev keys OpenRouter "latest" aliases with the leading
    // `~` (e.g. `~openai/gpt-latest`), and OpenRouter uses those
    // exact IDs in its `/models` response and chat requests, so the
    // fetched model ID matches the snapshot key verbatim.
    const model =
      providerId !== null ? this.getProvidersById().get(providerId)?.models?.[modelId] : undefined;
    if (model !== undefined) {
      return deriveDefaults(model, modelId);
    }

    // Last resort: search all providers by model ID. Covers custom
    // gateways that serve prefixed OpenRouter-style model IDs
    // (e.g. `openai/gpt-5-nano`) from an unknown host. When several
    // providers key the same model ID, the first match in snapshot
    // order wins.
    for (const provider of this.getProvidersById().values()) {
      const found = provider.models?.[modelId];
      if (found !== undefined) {
        return deriveDefaults(found, modelId);
      }
    }

    return null;
  }

  /**
   * Fills missing fields of a fetched model with bundled
   * defaults. Only `null` fields are filled — values reported
   * by the provider always win.
   *
   * @param fetched - The parsed provider model data.
   * @param providerBaseUrl - The provider base URL, used to
   *   resolve the models.dev provider. `null` when unknown.
   * @returns The fetched model enriched with defaults, or the
   *   original object when no defaults are found.
   */
  applyToFetched(fetched: FetchedModel, providerBaseUrl: string | null): FetchedModel {
    const defaults = this.getDefaults(providerBaseUrl, fetched.id);
    if (defaults === null) {
      return fetched;
    }

    return {
      ...fetched,
      maxContextWindowTokens: fetched.maxContextWindowTokens ?? defaults.contextSize ?? null,
      maxOutputTokens: fetched.maxOutputTokens ?? defaults.maxTokens ?? null,
      vision:
        fetched.vision ??
        (defaults.supportedCapabilities?.includes('vision') === true ? true : null),
      supportedReasoningEfforts:
        fetched.supportedReasoningEfforts ??
        (defaults.reasoningEffortMap !== undefined
          ? Object.keys(defaults.reasoningEffortMap)
          : null),
      defaultReasoningEffort:
        fetched.defaultReasoningEffort ?? defaults.defaultReasoningEffort ?? null,
      inputCostPer1M: fetched.inputCostPer1M ?? defaults.inputCostPer1M ?? null,
      outputCostPer1M: fetched.outputCostPer1M ?? defaults.outputCostPer1M ?? null,
      cachedInputCostPer1M: fetched.cachedInputCostPer1M ?? defaults.cachedInputCostPer1M ?? null,
    };
  }

  /**
   * Resolves the models.dev provider ID for a base URL and
   * model ID.
   *
   * @param providerBaseUrl - The provider base URL.
   * @param modelId - The model identifier.
   * @returns The resolved provider ID, or `null`.
   */
  private resolveProviderId(providerBaseUrl: string | null, modelId: string): string | null {
    const host = hostnameOf(providerBaseUrl);
    if (host !== null) {
      const byApiHost = this.getProvidersByApiHost().get(host);
      if (byApiHost !== undefined) {
        return byApiHost;
      }
      const known = KNOWN_MODELS_DEV_HOSTS[host];
      if (known !== undefined) {
        return known;
      }
      if (host.endsWith(AZURE_HOST_SUFFIX)) {
        return 'azure';
      }
    }

    const slash = modelId.indexOf('/');
    if (slash > 0) {
      const prefix = modelId.slice(0, slash);
      if (this.getProvidersById().has(prefix)) {
        return prefix;
      }
    }

    return null;
  }

  /**
   * Lazy-loads and caches the bundled snapshot.
   *
   * @returns The parsed snapshot.
   */
  private getData(): ModelsDevData {
    if (this.data === null) {
      try {
        const raw = readFileSync(this.jsonPath, 'utf-8');
        this.data = JSON.parse(raw) as ModelsDevData;
        this.logger.info('Model defaults loaded', `file=${this.jsonPath}`);
      } catch (error: unknown) {
        this.logger.error(
          'Failed to load model defaults',
          error instanceof Error ? error.message : String(error),
          `file=${this.jsonPath}`,
        );
        this.data = {};
      }
    }
    return this.data;
  }

  /**
   * Returns the index of providers keyed by provider ID.
   *
   * @returns The provider index.
   */
  private getProvidersById(): Map<string, ModelsDevProvider> {
    if (this.providersById === null) {
      this.providersById = new Map(Object.entries(this.getData()));
    }
    return this.providersById;
  }

  /**
   * Returns the index of models.dev provider IDs keyed by
   * the hostname of their `api` URL.
   *
   * @returns The API host index.
   */
  private getProvidersByApiHost(): Map<string, string> {
    if (this.providersByApiHost === null) {
      const index = new Map<string, string>();
      for (const [providerId, provider] of this.getProvidersById()) {
        const host = hostnameOf(provider.api);
        if (host !== null) {
          index.set(host, providerId);
        }
      }
      this.providersByApiHost = index;
    }
    return this.providersByApiHost;
  }
}
