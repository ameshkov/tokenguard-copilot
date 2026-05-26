/**
 * Mock implementation of the VS Code webview API.
 *
 * Patches `window.acquireVsCodeApi` so the production
 * `vscode-api.ts` module works unchanged in a regular
 * browser. Incoming messages are handled in-memory using
 * fixture data and dispatched back via `window.postMessage`.
 */

import type { ProviderInfo, ModelInfo, ModelConfig } from '@tokenguard/shared';
import {
  sampleProviders,
  sampleModels,
  sampleFetchedModels,
  sampleDefaults,
  sampleUsageRecords,
  sampleUsageSummary,
} from './fixtures.js';

/** Simulated async delay for read operations (ms). */
const MOCK_DELAY_MS = 80;

/**
 * Simulated async delay for mutation operations (ms).
 *
 * Longer than reads so loading spinners and transitions
 * are visible during development.
 */
const MOCK_MUTATION_DELAY_MS = 1500;

/** In-memory state backing the mock API. */
let providers: ProviderInfo[] = [...sampleProviders];
let models: ModelInfo[] = [...sampleModels];
let nextId = 100;

/** In-memory chat debug settings for the mock. */
let chatDebugSettings = {
  enabled: false,
  ttlHours: 24,
};

/** In-memory usage records for the mock. */
let usageRecords: typeof sampleUsageRecords = [...sampleUsageRecords];

/**
 * Dispatches a mock response back to the window after a
 * short delay.
 */
function respond(requestId: string, payload: Record<string, unknown>): void {
  setTimeout(() => {
    window.postMessage({ ...payload, requestId }, '*');
  }, MOCK_DELAY_MS);
}

/**
 * Dispatches a mock response after a longer delay,
 * simulating a network round-trip for mutations.
 */
function respondSlow(requestId: string, payload: Record<string, unknown>): void {
  setTimeout(() => {
    window.postMessage({ ...payload, requestId }, '*');
  }, MOCK_MUTATION_DELAY_MS);
}

/** Builds a ModelInfo from add/edit parameters. */
function buildModelInfo(providerId: string, modelId: string, config: ModelConfig): ModelInfo {
  return {
    id: modelId,
    providerId,
    displayName: config.displayName,
    maxContextWindowTokens: config.maxContextWindowTokens,
    maxOutputTokens: config.maxOutputTokens,
    streaming: config.streaming,
    vision: config.vision,
    temperature: config.temperature,
    topP: config.topP,
    frequencyPenalty: config.frequencyPenalty,
    presencePenalty: config.presencePenalty,
    supportedReasoningEfforts: config.supportedReasoningEfforts,
    defaultReasoningEffort: config.defaultReasoningEffort,
    reasoningEffortMap: config.reasoningEffortMap,
    preserveReasoning: config.preserveReasoning,
    inputCostPer1m: config.inputCostPer1m,
    outputCostPer1m: config.outputCostPer1m,
    cachedInputCostPer1m: config.cachedInputCostPer1m,
  };
}

/**
 * Handles an incoming webview command and dispatches the
 * appropriate mock response.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleMessage(msg: any): void {
  const { requestId, type } = msg;
  if (!requestId || !type) return;

  switch (type) {
    case 'getProviders':
      respond(requestId, {
        type: 'getProvidersResult',
        providers: [...providers],
      });
      break;

    case 'addProvider': {
      // Simulate a server error for a specific domain.
      if (String(msg.baseUrl).includes('error.example.com')) {
        respondSlow(requestId, {
          type: 'addProviderResult',
          success: false,
          error: 'Connection refused: unable to reach the provider endpoint.',
        });
        break;
      }
      const id = `prov-${String(nextId++)}`;
      const provider: ProviderInfo = {
        id,
        name: msg.name,
        baseUrl: msg.baseUrl,
      };
      providers.push(provider);
      respondSlow(requestId, {
        type: 'addProviderResult',
        success: true,
        provider,
      });
      break;
    }

    case 'editProvider': {
      const idx = providers.findIndex((p) => p.id === msg.id);
      if (idx !== -1) {
        providers[idx] = {
          ...providers[idx],
          name: msg.name,
          baseUrl: msg.baseUrl,
        };
      }
      respondSlow(requestId, {
        type: 'editProviderResult',
        success: true,
        provider: providers[idx],
      });
      break;
    }

    case 'removeProvider':
      providers = providers.filter((p) => p.id !== msg.id);
      models = models.filter((m) => m.providerId !== msg.id);
      respondSlow(requestId, {
        type: 'removeProviderResult',
        success: true,
      });
      break;

    case 'getModels':
      respond(requestId, {
        type: 'getModelsResult',
        models: [...models],
      });
      break;

    case 'fetchAvailableModels':
      respondSlow(requestId, {
        type: 'fetchAvailableModelsResult',
        success: true,
        models: [...sampleFetchedModels],
      });
      break;

    case 'addModel': {
      const model = buildModelInfo(msg.providerId, msg.modelId, msg.config);
      models.push(model);
      respondSlow(requestId, {
        type: 'addModelResult',
        success: true,
        model,
      });
      break;
    }

    case 'editModel': {
      const mi = models.findIndex((m) => m.id === msg.modelId && m.providerId === msg.providerId);
      if (mi !== -1) {
        models[mi] = buildModelInfo(msg.providerId, msg.modelId, msg.config);
      }
      respondSlow(requestId, {
        type: 'editModelResult',
        success: true,
        model: models[mi],
      });
      break;
    }

    case 'removeModel':
      models = models.filter((m) => !(m.id === msg.modelId && m.providerId === msg.providerId));
      respondSlow(requestId, {
        type: 'removeModelResult',
        success: true,
      });
      break;

    case 'getModelDefaults':
      respond(requestId, {
        type: 'getModelDefaultsResult',
        defaults: sampleDefaults,
      });
      break;

    case 'getChatDebugSettings':
      respond(requestId, {
        type: 'getChatDebugSettingsResult',
        settings: { ...chatDebugSettings },
      });
      break;

    case 'updateChatDebugSettings': {
      if (msg.enabled !== undefined) {
        chatDebugSettings.enabled = msg.enabled;
      }
      if (msg.ttlHours !== undefined) {
        chatDebugSettings.ttlHours = msg.ttlHours;
      }
      respondSlow(requestId, {
        type: 'updateChatDebugSettingsResult',
        success: true,
        settings: { ...chatDebugSettings },
      });
      break;
    }

    case 'clearChatDebugLogs':
      respondSlow(requestId, {
        type: 'clearChatDebugLogsResult',
        success: true,
      });
      break;

    case 'resetSettings':
      providers = [];
      models = [];
      usageRecords = [];
      chatDebugSettings = { enabled: false, ttlHours: 24 };
      respondSlow(requestId, {
        type: 'resetSettingsResult',
        success: true,
      });
      break;

    case 'getUsageStats':
      respond(requestId, {
        type: 'getUsageStatsResult',
        records: usageRecords,
        summary: sampleUsageSummary,
      });
      break;

    case 'resetUsageStats':
      usageRecords = [];
      respondSlow(requestId, {
        type: 'resetUsageStatsResult',
        success: true,
      });
      break;

    default:
      console.warn('[mock] Unhandled message type:', type);
  }
}

// ── Patch window.acquireVsCodeApi ─────────────────────────

let state: unknown = undefined;

const mockApi = {
  postMessage(message: unknown): void {
    handleMessage(message);
  },
  getState(): unknown {
    return state;
  },
  setState(newState: unknown): void {
    state = newState;
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).acquireVsCodeApi = () => mockApi;
