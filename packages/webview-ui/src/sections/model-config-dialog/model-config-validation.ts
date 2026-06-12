import type {
  CacheControlConfig,
  CacheControlTtl,
  CustomField,
  ModelConfig,
} from '@tokenguard/shared';
import { hasCustomFieldErrors } from '../custom-fields-editor.js';

/** Snapshot of all form state values used for validation and model building. */
export interface ModelConfigFormState {
  displayName: string;
  maxContextWindowTokens: string;
  maxOutputTokens: string;
  streaming: boolean;
  vision: boolean;
  temperature: string;
  topP: string;
  frequencyPenalty: string;
  presencePenalty: string;
  defaultReasoningEffort: string;
  reasoningEffortMap: Record<string, string>;
  preserveReasoning: boolean;
  inputCostPer1m: string;
  outputCostPer1m: string;
  cachedInputCostPer1m: string;
  cacheControlEnabled: boolean;
  cacheMaxMarkers: string;
  cacheTtl: CacheControlTtl | '';
  customFields: CustomField[];
}

/**
 * Validates the entire model config form state.
 *
 * @param state - The current form state.
 * @returns An error record keyed by field name. Empty object = valid.
 */
export function validateFormState(state: ModelConfigFormState): Record<string, string> {
  const newErrors: Record<string, string> = {};
  const ctx = Number(state.maxContextWindowTokens);
  const prompt = Number(state.maxOutputTokens);

  if (!state.maxContextWindowTokens || isNaN(ctx) || ctx <= 0) {
    newErrors.maxContextWindowTokens = 'Must be a positive number';
  }
  if (!state.maxOutputTokens || isNaN(prompt) || prompt <= 0) {
    newErrors.maxOutputTokens = 'Must be a positive number';
  }
  if (ctx > 0 && prompt > 0 && prompt >= ctx) {
    newErrors.maxOutputTokens = 'Must be less than max context window tokens';
  }
  if (state.temperature !== '') {
    const t = Number(state.temperature);
    if (isNaN(t) || t < 0 || t > 2) {
      newErrors.temperature = 'Must be between 0 and 2';
    }
  }
  if (state.topP !== '') {
    const t = Number(state.topP);
    if (isNaN(t) || t < 0 || t > 1) {
      newErrors.topP = 'Must be between 0 and 1';
    }
  }
  if (state.frequencyPenalty !== '') {
    const f = Number(state.frequencyPenalty);
    if (isNaN(f) || f < -2 || f > 2) {
      newErrors.frequencyPenalty = 'Must be between -2 and 2';
    }
  }
  if (state.presencePenalty !== '') {
    const p = Number(state.presencePenalty);
    if (isNaN(p) || p < -2 || p > 2) {
      newErrors.presencePenalty = 'Must be between -2 and 2';
    }
  }
  for (const name of Object.keys(state.reasoningEffortMap)) {
    const params = state.reasoningEffortMap[name];
    if (params && params.trim()) {
      try {
        const parsed = JSON.parse(params);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          newErrors[`effortMap_${name}`] = 'Must be a JSON object';
        }
      } catch {
        newErrors[`effortMap_${name}`] = 'Invalid JSON';
      }
    }
  }
  if (hasCustomFieldErrors(state.customFields)) {
    newErrors.customFields = 'Fix custom field errors';
  }
  return newErrors;
}

/**
 * Maps error field keys to human-readable labels.
 *
 * @param field - The error field key.
 * @returns A human-readable label for the field.
 */
export function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    maxContextWindowTokens: 'Max Context Window Tokens',
    maxOutputTokens: 'Max Output Tokens',
    temperature: 'Temperature',
    topP: 'Top P',
    frequencyPenalty: 'Frequency Penalty',
    presencePenalty: 'Presence Penalty',
    newEffortParams: 'New Effort Body Params',
    customFields: 'Custom Fields',
  };
  if (labels[field]) return labels[field];
  if (field.startsWith('effortMap_')) {
    return `Body Params for "${field.slice('effortMap_'.length)}"`;
  }
  return field;
}

/**
 * Builds a {@link CacheControlConfig} from the form state.
 *
 * @param enabled - Whether cache control is enabled.
 * @param maxMarkers - Max markers as a string (parsed as number).
 * @param ttl - Cache TTL or empty string.
 * @returns The cache control config, or `null` when disabled.
 */
export function buildCacheControl(
  enabled: boolean,
  maxMarkers: string,
  ttl: CacheControlTtl | '',
): CacheControlConfig | null {
  if (!enabled) return null;
  const config: CacheControlConfig = {
    enabled: true,
    maxMarkers: Number(maxMarkers) || 4,
  };
  if (ttl !== '') {
    config.ttl = ttl;
  }
  return config;
}

/**
 * Builds a JSON string for the reasoningEffortMap.
 *
 * @param reasoningEffortMap - The effort map from form state.
 * @returns A JSON string, or `null` when there are no entries.
 */
function buildReasoningEffortMapJson(reasoningEffortMap: Record<string, string>): string | null {
  const names = Object.keys(reasoningEffortMap);
  const map: Record<string, Record<string, unknown>> = {};
  let hasEntries = false;
  for (const name of names) {
    const params = reasoningEffortMap[name];
    if (params) {
      try {
        map[name] = JSON.parse(params) as Record<string, unknown>;
        hasEntries = true;
      } catch {
        // Skip invalid JSON entries
      }
    }
  }
  return hasEntries ? JSON.stringify(map) : null;
}

/**
 * Builds a full {@link ModelConfig} from the form state.
 *
 * @param state - The current form state.
 * @returns The model configuration ready for submission.
 */
export function buildModelConfig(state: ModelConfigFormState): ModelConfig {
  return {
    displayName: state.displayName.trim() || null,
    maxContextWindowTokens: Number(state.maxContextWindowTokens),
    maxOutputTokens: Number(state.maxOutputTokens),
    streaming: state.streaming,
    vision: state.vision,
    temperature: state.temperature !== '' ? Number(state.temperature) : null,
    topP: state.topP !== '' ? Number(state.topP) : null,
    frequencyPenalty: state.frequencyPenalty !== '' ? Number(state.frequencyPenalty) : null,
    presencePenalty: state.presencePenalty !== '' ? Number(state.presencePenalty) : null,
    defaultReasoningEffort: state.defaultReasoningEffort || null,
    reasoningEffortMap: buildReasoningEffortMapJson(state.reasoningEffortMap),
    preserveReasoning: state.preserveReasoning,
    inputCostPer1m: state.inputCostPer1m !== '' ? Number(state.inputCostPer1m) : null,
    outputCostPer1m: state.outputCostPer1m !== '' ? Number(state.outputCostPer1m) : null,
    cachedInputCostPer1m:
      state.cachedInputCostPer1m !== '' ? Number(state.cachedInputCostPer1m) : null,
    cacheControl: buildCacheControl(
      state.cacheControlEnabled,
      state.cacheMaxMarkers,
      state.cacheTtl,
    ),
    customFields: state.customFields.length > 0 ? JSON.stringify(state.customFields) : null,
  };
}
