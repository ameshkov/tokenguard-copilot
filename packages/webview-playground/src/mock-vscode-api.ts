/**
 * Mock implementation of the VS Code webview API.
 *
 * Patches `window.acquireVsCodeApi` so the production
 * `vscode-api.ts` module works unchanged in a regular
 * browser. Incoming messages are handled in-memory using
 * fixture data and dispatched back via `window.postMessage`.
 */

import type {
  ProviderInfo,
  ModelInfo,
  ModelConfig,
  ContentRuleInfo,
  AddContentRuleParams,
} from '@tokenguard/shared';
import {
  sampleProviders,
  sampleModels,
  sampleFetchedModels,
  sampleDefaults,
  sampleUsageRecords,
  sampleUsageSummary,
  sampleContentRules,
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

/** In-memory content rules for the mock. */
let contentRules: ContentRuleInfo[] = [...sampleContentRules.map((r) => ({ ...r }))];
let nextRuleId = 100;

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
    defaultReasoningEffort: config.defaultReasoningEffort,
    reasoningEffortMap: config.reasoningEffortMap,
    preserveReasoning: config.preserveReasoning,
    inputCostPer1m: config.inputCostPer1m,
    outputCostPer1m: config.outputCostPer1m,
    cachedInputCostPer1m: config.cachedInputCostPer1m,
    cacheControl: config.cacheControl,
    customFields: config.customFields,
  };
}

/** Returns the current time as an ISO 8601 string. */
function nowISO(): string {
  return new Date().toISOString();
}

/** Builds a full ContentRuleInfo from add params and generated fields. */
function buildContentRule(
  id: string,
  params: AddContentRuleParams,
  sortOrder: number,
): ContentRuleInfo {
  const now = nowISO();
  return {
    id,
    ...params,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
}

// ── Message handlers ──────────────────────────────────────
//
// Each handler receives a typed message subset and mutates
// module-level state directly — same behaviour as the
// original monolithic handleMessage.

/** Returns current provider list. */
function handleGetProviders(msg: { requestId: string }): void {
  respond(msg.requestId, {
    type: 'getProvidersResult',
    providers: [...providers],
  });
}

/** Creates a new provider. Simulates a server error for
 *  `error.example.com`. */
function handleAddProvider(msg: { requestId: string; baseUrl: string; name: string }): void {
  if (String(msg.baseUrl).includes('error.example.com')) {
    respondSlow(msg.requestId, {
      type: 'addProviderResult',
      success: false,
      error: 'Connection refused: unable to reach the provider endpoint.',
    });
    return;
  }
  const id = `prov-${String(nextId++)}`;
  const provider: ProviderInfo = { id, name: msg.name, baseUrl: msg.baseUrl };
  providers.push(provider);
  respondSlow(msg.requestId, {
    type: 'addProviderResult',
    success: true,
    provider,
  });
}

/** Updates an existing provider. */
function handleEditProvider(msg: {
  requestId: string;
  id: string;
  name: string;
  baseUrl: string;
}): void {
  const idx = providers.findIndex((p) => p.id === msg.id);
  if (idx !== -1) {
    providers[idx] = { ...providers[idx], name: msg.name, baseUrl: msg.baseUrl };
  }
  respondSlow(msg.requestId, {
    type: 'editProviderResult',
    success: true,
    provider: providers[idx],
  });
}

/** Removes a provider and cascades to its models. */
function handleRemoveProvider(msg: { requestId: string; id: string }): void {
  providers = providers.filter((p) => p.id !== msg.id);
  models = models.filter((m) => m.providerId !== msg.id);
  respondSlow(msg.requestId, {
    type: 'removeProviderResult',
    success: true,
  });
}

/** Returns current model list. */
function handleGetModels(msg: { requestId: string }): void {
  respond(msg.requestId, {
    type: 'getModelsResult',
    models: [...models],
  });
}

/** Returns sample models from a simulated /v1/models fetch. */
function handleFetchAvailableModels(msg: { requestId: string }): void {
  respondSlow(msg.requestId, {
    type: 'fetchAvailableModelsResult',
    success: true,
    models: [...sampleFetchedModels],
  });
}

/** Creates a new model. */
function handleAddModel(msg: {
  requestId: string;
  providerId: string;
  modelId: string;
  config: ModelConfig;
}): void {
  const model = buildModelInfo(msg.providerId, msg.modelId, msg.config);
  models.push(model);
  respondSlow(msg.requestId, {
    type: 'addModelResult',
    success: true,
    model,
  });
}

/** Updates an existing model. */
function handleEditModel(msg: {
  requestId: string;
  providerId: string;
  modelId: string;
  config: ModelConfig;
}): void {
  const mi = models.findIndex((m) => m.id === msg.modelId && m.providerId === msg.providerId);
  if (mi !== -1) {
    models[mi] = buildModelInfo(msg.providerId, msg.modelId, msg.config);
  }
  respondSlow(msg.requestId, {
    type: 'editModelResult',
    success: true,
    model: models[mi],
  });
}

/** Removes a model by (providerId, modelId) pair. */
function handleRemoveModel(msg: { requestId: string; modelId: string; providerId: string }): void {
  models = models.filter((m) => !(m.id === msg.modelId && m.providerId === msg.providerId));
  respondSlow(msg.requestId, {
    type: 'removeModelResult',
    success: true,
  });
}

/** Returns bundled model defaults. */
function handleGetModelDefaults(msg: { requestId: string }): void {
  respond(msg.requestId, {
    type: 'getModelDefaultsResult',
    defaults: sampleDefaults,
  });
}

/** Returns current chat debug settings. */
function handleGetChatDebugSettings(msg: { requestId: string }): void {
  respond(msg.requestId, {
    type: 'getChatDebugSettingsResult',
    settings: { ...chatDebugSettings },
  });
}

/** Merges enabled / ttlHours into chat debug settings. */
function handleUpdateChatDebugSettings(msg: {
  requestId: string;
  enabled?: boolean;
  ttlHours?: number;
}): void {
  if (msg.enabled !== undefined) {
    chatDebugSettings.enabled = msg.enabled;
  }
  if (msg.ttlHours !== undefined) {
    chatDebugSettings.ttlHours = msg.ttlHours;
  }
  respondSlow(msg.requestId, {
    type: 'updateChatDebugSettingsResult',
    success: true,
    settings: { ...chatDebugSettings },
  });
}

/** Acknowledges a clear-debug-logs command. */
function handleClearChatDebugLogs(msg: { requestId: string }): void {
  respondSlow(msg.requestId, {
    type: 'clearChatDebugLogsResult',
    success: true,
  });
}

/** Resets all in-memory state to defaults. */
function handleResetSettings(msg: { requestId: string }): void {
  providers = [];
  models = [];
  usageRecords = [];
  chatDebugSettings = { enabled: false, ttlHours: 24 };
  respondSlow(msg.requestId, {
    type: 'resetSettingsResult',
    success: true,
  });
}

/** Returns usage records and aggregate summary. */
function handleGetUsageStats(msg: { requestId: string }): void {
  respond(msg.requestId, {
    type: 'getUsageStatsResult',
    records: usageRecords,
    summary: sampleUsageSummary,
  });
}

/** Clears usage records. */
function handleResetUsageStats(msg: { requestId: string }): void {
  usageRecords = [];
  respondSlow(msg.requestId, {
    type: 'resetUsageStatsResult',
    success: true,
  });
}

/** Returns all content rules ordered by sortOrder. */
function handleGetContentRules(msg: { requestId: string }): void {
  respond(msg.requestId, {
    type: 'getContentRulesResult',
    rules: [...contentRules],
  });
}

/** Returns a single content rule by ID, or null. */
function handleGetContentRule(msg: { requestId: string; id: string }): void {
  const rule = contentRules.find((r) => r.id === msg.id) ?? null;
  respond(msg.requestId, {
    type: 'getContentRuleResult',
    rule: rule ? { ...rule } : null,
  });
}

/** Creates a new content rule with the next sort order. */
function handleAddContentRule(msg: { requestId: string; params: AddContentRuleParams }): void {
  const id = `rule-${String(nextRuleId++)}`;
  const sortOrder =
    contentRules.length > 0 ? Math.max(...contentRules.map((r) => r.sortOrder)) + 1 : 0;
  const rule = buildContentRule(id, msg.params, sortOrder);
  contentRules.push(rule);
  respondSlow(msg.requestId, {
    type: 'addContentRuleResult',
    success: true,
    rule: { ...rule },
  });
}

/** Updates an existing content rule by ID. */
function handleUpdateContentRule(msg: {
  requestId: string;
  id: string;
  params: Partial<AddContentRuleParams>;
}): void {
  const idx = contentRules.findIndex((r) => r.id === msg.id);
  if (idx !== -1) {
    contentRules[idx] = {
      ...contentRules[idx],
      ...msg.params,
      updatedAt: nowISO(),
    };
    respondSlow(msg.requestId, {
      type: 'updateContentRuleResult',
      success: true,
      rule: { ...contentRules[idx] },
    });
  } else {
    respondSlow(msg.requestId, {
      type: 'updateContentRuleResult',
      success: false,
      error: `Content rule not found: ${String(msg.id)}`,
    });
  }
}

/** Deletes a content rule by ID. */
function handleDeleteContentRule(msg: { requestId: string; id: string }): void {
  const idx = contentRules.findIndex((r) => r.id === msg.id);
  if (idx !== -1) {
    contentRules.splice(idx, 1);
    respondSlow(msg.requestId, {
      type: 'deleteContentRuleResult',
      success: true,
    });
  } else {
    respondSlow(msg.requestId, {
      type: 'deleteContentRuleResult',
      success: false,
      error: `Content rule not found: ${String(msg.id)}`,
    });
  }
}

/** Reorders content rules by a provided ordered-ID list.
 *  Rules not in the list are preserved at the end. */
function handleReorderContentRules(msg: { requestId: string; orderedIds: string[] }): void {
  const orderedIds: string[] = msg.orderedIds;
  const reordered: ContentRuleInfo[] = [];
  for (let i = 0; i < orderedIds.length; i++) {
    const rule = contentRules.find((r) => r.id === orderedIds[i]);
    if (rule) {
      reordered.push({ ...rule, sortOrder: i, updatedAt: nowISO() });
    }
  }
  // Preserve any rules not in the ordered list (append at end).
  for (const rule of contentRules) {
    if (!orderedIds.includes(rule.id)) {
      reordered.push({
        ...rule,
        sortOrder: reordered.length,
        updatedAt: nowISO(),
      });
    }
  }
  contentRules = reordered;
  respondSlow(msg.requestId, {
    type: 'reorderContentRulesResult',
    success: true,
    rules: contentRules.map((r) => ({ ...r })),
  });
}

// ── Dispatcher ────────────────────────────────────────────

/**
 * Handles an incoming webview command and dispatches to the
 * appropriate typed handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleMessage(msg: any): void {
  const { requestId, type } = msg;
  if (!requestId || !type) return;

  switch (type) {
    case 'getProviders':
      handleGetProviders(msg);
      break;
    case 'addProvider':
      handleAddProvider(msg);
      break;
    case 'editProvider':
      handleEditProvider(msg);
      break;
    case 'removeProvider':
      handleRemoveProvider(msg);
      break;
    case 'getModels':
      handleGetModels(msg);
      break;
    case 'fetchAvailableModels':
      handleFetchAvailableModels(msg);
      break;
    case 'addModel':
      handleAddModel(msg);
      break;
    case 'editModel':
      handleEditModel(msg);
      break;
    case 'removeModel':
      handleRemoveModel(msg);
      break;
    case 'getModelDefaults':
      handleGetModelDefaults(msg);
      break;
    case 'getChatDebugSettings':
      handleGetChatDebugSettings(msg);
      break;
    case 'updateChatDebugSettings':
      handleUpdateChatDebugSettings(msg);
      break;
    case 'clearChatDebugLogs':
      handleClearChatDebugLogs(msg);
      break;
    case 'resetSettings':
      handleResetSettings(msg);
      break;
    case 'getUsageStats':
      handleGetUsageStats(msg);
      break;
    case 'resetUsageStats':
      handleResetUsageStats(msg);
      break;
    case 'getContentRules':
      handleGetContentRules(msg);
      break;
    case 'getContentRule':
      handleGetContentRule(msg);
      break;
    case 'addContentRule':
      handleAddContentRule(msg);
      break;
    case 'updateContentRule':
      handleUpdateContentRule(msg);
      break;
    case 'deleteContentRule':
      handleDeleteContentRule(msg);
      break;
    case 'reorderContentRules':
      handleReorderContentRules(msg);
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
