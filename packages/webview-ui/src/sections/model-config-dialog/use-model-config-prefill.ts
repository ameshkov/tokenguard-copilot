import { useEffect } from 'react';
import type {
  CustomField,
  CustomFieldType,
  CacheControlTtl,
  FetchedModel,
  ModelDefaultsResult,
  ModelInfo,
} from '@tokenguard/shared';

/**
 * Infers a {@link CustomFieldType} from a JSON value.
 *
 * @param value - The value to inspect.
 * @returns The inferred type.
 */
function inferCustomFieldType(value: unknown): CustomFieldType {
  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'json';
  }
}

/** State setters for all form fields in the model config dialog. */
export interface ModelConfigPrefillSetters {
  setDisplayName: (v: string) => void;
  setMaxContextWindowTokens: (v: string) => void;
  setMaxOutputTokens: (v: string) => void;
  setStreaming: (v: boolean) => void;
  setVision: (v: boolean) => void;
  setTemperature: (v: string) => void;
  setTopP: (v: string) => void;
  setFrequencyPenalty: (v: string) => void;
  setPresencePenalty: (v: string) => void;
  setDefaultReasoningEffort: (v: string) => void;
  setReasoningEffortMap: (v: Record<string, string>) => void;
  setPreserveReasoning: (v: boolean) => void;
  setInputCostPer1m: (v: string) => void;
  setOutputCostPer1m: (v: string) => void;
  setCachedInputCostPer1m: (v: string) => void;
  setCacheControlEnabled: (v: boolean) => void;
  setCacheMaxMarkers: (v: string) => void;
  setCacheTtl: (v: CacheControlTtl | '') => void;
  setCustomFields: (v: CustomField[]) => void;
  setPrefilledFields: (v: Record<string, string>) => void;
}

/**
 * Pre-fills all form fields from an existing model (edit mode).
 *
 * @param editingModel - The existing model to copy values from.
 * @param s - The form setters.
 */
function prefillFromEditingModel(editingModel: ModelInfo, s: ModelConfigPrefillSetters): void {
  s.setDisplayName(editingModel.displayName ?? '');
  s.setMaxContextWindowTokens(String(editingModel.maxContextWindowTokens));
  s.setMaxOutputTokens(String(editingModel.maxOutputTokens));
  s.setStreaming(editingModel.streaming);
  s.setVision(editingModel.vision);
  s.setTemperature(editingModel.temperature !== null ? String(editingModel.temperature) : '');
  s.setTopP(editingModel.topP !== null ? String(editingModel.topP) : '');
  s.setFrequencyPenalty(
    editingModel.frequencyPenalty !== null ? String(editingModel.frequencyPenalty) : '',
  );
  s.setPresencePenalty(
    editingModel.presencePenalty !== null ? String(editingModel.presencePenalty) : '',
  );
  s.setDefaultReasoningEffort(editingModel.defaultReasoningEffort ?? '');
  if (editingModel.reasoningEffortMap) {
    try {
      const map = JSON.parse(editingModel.reasoningEffortMap) as Record<
        string,
        Record<string, unknown>
      >;
      const entries: Record<string, string> = {};
      for (const [key, val] of Object.entries(map)) {
        entries[key] = JSON.stringify(val);
      }
      s.setReasoningEffortMap(entries);
    } catch {
      s.setReasoningEffortMap({});
    }
  } else {
    s.setReasoningEffortMap({});
  }
  s.setPreserveReasoning(editingModel.preserveReasoning);
  s.setInputCostPer1m(
    editingModel.inputCostPer1m !== null ? String(editingModel.inputCostPer1m) : '',
  );
  s.setOutputCostPer1m(
    editingModel.outputCostPer1m !== null ? String(editingModel.outputCostPer1m) : '',
  );
  s.setCachedInputCostPer1m(
    editingModel.cachedInputCostPer1m !== null ? String(editingModel.cachedInputCostPer1m) : '',
  );
  if (editingModel.cacheControl) {
    s.setCacheControlEnabled(editingModel.cacheControl.enabled);
    s.setCacheMaxMarkers(String(editingModel.cacheControl.maxMarkers));
    s.setCacheTtl(editingModel.cacheControl.ttl !== undefined ? editingModel.cacheControl.ttl : '');
  }
  if (editingModel.customFields) {
    try {
      s.setCustomFields(JSON.parse(editingModel.customFields) as CustomField[]);
    } catch {
      s.setCustomFields([]);
    }
  }
  s.setPrefilledFields({});
}

/**
 * Pre-fills fields from the provider's /models response.
 *
 * @param fetchedModel - The fetched model data.
 * @param s - The form setters.
 * @returns Record of fields filled by the provider source.
 */
function prefillFromFetchedModel(
  fetchedModel: FetchedModel,
  s: ModelConfigPrefillSetters,
): Record<string, string> {
  const filled: Record<string, string> = {};

  if (fetchedModel.name) {
    s.setDisplayName(fetchedModel.name);
    filled.displayName = 'provider';
  }
  if (fetchedModel.maxContextWindowTokens !== null) {
    s.setMaxContextWindowTokens(String(fetchedModel.maxContextWindowTokens));
    filled.maxContextWindowTokens = 'provider';
  }
  if (fetchedModel.maxOutputTokens !== null) {
    s.setMaxOutputTokens(String(fetchedModel.maxOutputTokens));
    filled.maxOutputTokens = 'provider';
  }
  if (fetchedModel.vision !== null) {
    s.setVision(fetchedModel.vision);
    filled.vision = 'provider';
  }
  if (fetchedModel.defaultReasoningEffort !== null) {
    s.setDefaultReasoningEffort(fetchedModel.defaultReasoningEffort);
    filled.defaultReasoningEffort = 'provider';
  }

  if (
    fetchedModel.supportedReasoningEfforts !== null &&
    fetchedModel.supportedReasoningEfforts.length > 0
  ) {
    const entries: Record<string, string> = {};
    for (const effort of fetchedModel.supportedReasoningEfforts) {
      entries[effort] = JSON.stringify({ reasoning_effort: effort });
    }
    s.setReasoningEffortMap(entries);
    filled.reasoningEffortMap = 'provider';
  }

  if (fetchedModel.inputCostPer1M !== null) {
    s.setInputCostPer1m(String(fetchedModel.inputCostPer1M));
    filled.inputCostPer1m = 'provider';
  }
  if (fetchedModel.outputCostPer1M !== null) {
    s.setOutputCostPer1m(String(fetchedModel.outputCostPer1M));
    filled.outputCostPer1m = 'provider';
  }
  if (fetchedModel.cachedInputCostPer1M !== null) {
    s.setCachedInputCostPer1m(String(fetchedModel.cachedInputCostPer1M));
    filled.cachedInputCostPer1m = 'provider';
  }

  return filled;
}

/**
 * Pre-fills remaining empty fields from bundled model defaults.
 *
 * @param defaults - The bundled defaults data.
 * @param filled - Already-filled fields (won't be overwritten).
 * @param s - The form setters.
 * @returns The updated filled record.
 */
function prefillFromDefaults(
  defaults: ModelDefaultsResult,
  filled: Record<string, string>,
  s: ModelConfigPrefillSetters,
): Record<string, string> {
  if (!filled.maxContextWindowTokens && defaults.contextSize) {
    s.setMaxContextWindowTokens(String(defaults.contextSize));
    filled.maxContextWindowTokens = 'defaults';
  }
  if (!filled.maxOutputTokens && defaults.maxTokens) {
    s.setMaxOutputTokens(String(defaults.maxTokens));
    filled.maxOutputTokens = 'defaults';
  }
  if (defaults.inputCostPer1M !== undefined && !filled.inputCostPer1m) {
    s.setInputCostPer1m(String(defaults.inputCostPer1M));
    filled.inputCostPer1m = 'defaults';
  }
  if (defaults.outputCostPer1M !== undefined && !filled.outputCostPer1m) {
    s.setOutputCostPer1m(String(defaults.outputCostPer1M));
    filled.outputCostPer1m = 'defaults';
  }
  if (defaults.cachedInputCostPer1M !== undefined && !filled.cachedInputCostPer1m) {
    s.setCachedInputCostPer1m(String(defaults.cachedInputCostPer1M));
    filled.cachedInputCostPer1m = 'defaults';
  }
  if (defaults.supportedCapabilities?.includes('streaming') && !filled.streaming) {
    filled.streaming = 'defaults';
  }
  if (defaults.supportedCapabilities?.includes('vision') && !filled.vision) {
    s.setVision(true);
    filled.vision = 'defaults';
  }
  if (!filled.reasoningEffortMap && defaults.reasoningEffortMap) {
    const entries: Record<string, string> = {};
    for (const [key, val] of Object.entries(defaults.reasoningEffortMap)) {
      entries[key] = JSON.stringify(val);
    }
    s.setReasoningEffortMap(entries);
    if (Object.keys(entries).length > 0) {
      filled.reasoningEffortMap = 'defaults';
    }
    if (defaults.defaultReasoningEffort && !filled.defaultReasoningEffort) {
      s.setDefaultReasoningEffort(defaults.defaultReasoningEffort);
      filled.defaultReasoningEffort = 'defaults';
    }
  } else if (defaults.defaultReasoningEffort && !filled.defaultReasoningEffort) {
    s.setDefaultReasoningEffort(defaults.defaultReasoningEffort);
    filled.defaultReasoningEffort = 'defaults';
  }
  if (defaults.preserveReasoning !== undefined) {
    s.setPreserveReasoning(defaults.preserveReasoning);
    filled.preserveReasoning = 'defaults';
  }
  if (defaults.cacheControl) {
    s.setCacheControlEnabled(defaults.cacheControl.enabled);
    s.setCacheMaxMarkers(String(defaults.cacheControl.maxMarkers));
    if (defaults.cacheControl.ttl !== undefined) {
      s.setCacheTtl('');
    }
    filled.cacheControl = 'defaults';
  }
  if (defaults.customFields) {
    const fields: CustomField[] = Object.entries(defaults.customFields).map(([property, value]) => {
      const type = inferCustomFieldType(value);
      return { property, type, value: type === 'json' ? JSON.stringify(value) : String(value) };
    });
    s.setCustomFields(fields);
    if (fields.length > 0) {
      filled.customFields = 'defaults';
    }
  }

  return filled;
}

/**
 * Hook that pre-fills the model config form from three data sources.
 *
 * Supports three modes:
 * 1. **Edit** — copies all values from an existing {@link ModelInfo}.
 * 2. **Provider** — pre-fills from a {@link FetchedModel} /models response.
 * 3. **Defaults** — fills remaining empty fields from bundled defaults.
 *
 * The hook calls the provided setters directly, so the caller must
 * manage its own `prefilledFields` state via `useState` and pass
 * `setPrefilledFields` as part of the setters argument.
 *
 * @param editingModel - Existing model for edit mode, or `undefined`.
 * @param fetchedModel - Data from the provider's /models endpoint, or `undefined`.
 * @param defaults - Pre-fill data from bundled defaults, or `null`/`undefined`.
 * @param setters - State setter callbacks for all form fields.
 */
export function useModelConfigPreFill(
  editingModel: ModelInfo | undefined,
  fetchedModel: FetchedModel | undefined,
  defaults: ModelDefaultsResult | null | undefined,
  setters: ModelConfigPrefillSetters,
): void {
  useEffect(() => {
    if (editingModel) {
      prefillFromEditingModel(editingModel, setters);
      return;
    }

    let filled: Record<string, string> = {};

    if (fetchedModel) {
      filled = prefillFromFetchedModel(fetchedModel, setters);
    }
    if (defaults) {
      filled = prefillFromDefaults(defaults, filled, setters);
    }

    setters.setPrefilledFields(filled);
  }, [editingModel, fetchedModel, defaults]);
}
