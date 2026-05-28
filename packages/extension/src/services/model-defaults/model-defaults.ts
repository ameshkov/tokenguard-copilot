import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CacheControlConfig } from '@tokenguard/shared';

/**
 * Match specification for a model defaults entry.
 *
 * - `exact`: the model ID must equal `value` exactly.
 * - `regex`: the model ID must match the regex in `value`.
 */
interface ModelDefaultsMatch {
  /** Match strategy: exact string or regex pattern. */
  type: 'exact' | 'regex';
  /** The value to match against — exact model ID or regex
   *  pattern string. */
  value: string;
}

/**
 * A single entry in the bundled model defaults JSON file.
 *
 * Each entry maps a model ID (via exact or regex match) to
 * known default configuration values.
 */
export interface ModelDefaultsEntry {
  /** How to match this entry against a model ID. */
  match: ModelDefaultsMatch;
  /** Maximum context window size in tokens. */
  contextSize: number;
  /** Maximum prompt/output tokens. */
  maxTokens: number;
  /** Cost per 1M input tokens in dollars. */
  inputCostPer1M: number;
  /** Cost per 1M output tokens in dollars. */
  outputCostPer1M: number;
  /** Cost per 1M cached input tokens in dollars. */
  cachedInputCostPer1M?: number;
  /** Supported model capabilities (e.g., "reasoning_effort",
   *  "vision"). */
  supportedCapabilities: string[];
  /** Maps reasoning effort level names to provider-specific
   *  chat completion body parameters. When present, the map
   *  keys define supported efforts. */
  reasoningEffortMap?: Record<string, Record<string, unknown>>;
  /** Default reasoning effort level. When `reasoningEffortMap`
   *  is present, this must be one of its keys. */
  defaultReasoningEffort?: string;
  /** When true, preserve `reasoning_content` from responses
   *  and inject it into subsequent requests. */
  preserveReasoning?: boolean;
  /** Cache control injection configuration. */
  cacheControl?: CacheControlConfig;
  /** Custom request body fields pre-filled from bundled
   *  model defaults. */
  customFields?: Record<string, unknown>;
}

/**
 * Model defaults returned by {@link getDefaults}.
 *
 * Contains the default configuration values for a known model,
 * without the match specification.
 */
export interface ModelDefaults {
  /** Maximum context window size in tokens. */
  contextSize: number;
  /** Maximum prompt/output tokens. */
  maxTokens: number;
  /** Cost per 1M input tokens in dollars. */
  inputCostPer1M: number;
  /** Cost per 1M output tokens in dollars. */
  outputCostPer1M: number;
  /** Cost per 1M cached input tokens in dollars. */
  cachedInputCostPer1M?: number;
  /** Supported model capabilities (e.g., "reasoning_effort",
   *  "vision"). */
  supportedCapabilities: string[];
  /** Maps reasoning effort level names to provider-specific
   *  chat completion body parameters. When present, the map
   *  keys define supported efforts. */
  reasoningEffortMap?: Record<string, Record<string, unknown>>;
  /** Default reasoning effort level. When `reasoningEffortMap`
   *  is present, this must be one of its keys. */
  defaultReasoningEffort?: string;
  /** When true, preserve `reasoning_content` from responses
   *  and inject it into subsequent requests. */
  preserveReasoning?: boolean;
  /** Cache control injection configuration. */
  cacheControl?: CacheControlConfig;
  /** Custom request body fields pre-filled from bundled
   *  model defaults. */
  customFields?: Record<string, unknown>;
}

/**
 * Compiled regex entry used internally for pattern matching.
 */
interface CompiledRegexEntry {
  pattern: RegExp;
  defaults: ModelDefaults;
}

/** Map of exact model ID → defaults. */
let exactMap: Map<string, ModelDefaults> | null = null;

/** Ordered list of compiled regex entries. */
let regexEntries: CompiledRegexEntry[] | null = null;

/** Custom path to the model-defaults.json file. */
let customJsonPath: string | null = null;

/**
 * Initializes the model defaults lookup with a custom JSON
 * file path. Call this before {@link getDefaults} to override
 * the default bundled path.
 *
 * Primarily used in tests where the runtime `__dirname`-based
 * resolution does not match the source directory layout.
 *
 * @param jsonPath - Absolute path to the model-defaults.json.
 */
export function initDefaults(jsonPath: string): void {
  customJsonPath = jsonPath;
  exactMap = null;
  regexEntries = null;
}

/**
 * Resets the cached defaults state. Useful for test isolation.
 */
export function resetDefaults(): void {
  exactMap = null;
  regexEntries = null;
  customJsonPath = null;
}

/**
 * Strips the `match` field from an entry, returning only the
 * defaults data.
 *
 * Automatically includes `parallel_tool_calls: true` as a
 * default custom field for every model. If the entry already
 * has a `parallel_tool_calls` custom field, the entry's value
 * takes precedence.
 *
 * @param entry - The full model defaults entry.
 * @returns A new object containing only the defaults fields.
 */
function toDefaults(entry: ModelDefaultsEntry): ModelDefaults {
  const builtInCustomFields: Record<string, unknown> = {
    parallel_tool_calls: true,
  };

  return {
    contextSize: entry.contextSize,
    maxTokens: entry.maxTokens,
    inputCostPer1M: entry.inputCostPer1M,
    outputCostPer1M: entry.outputCostPer1M,
    cachedInputCostPer1M: entry.cachedInputCostPer1M,
    supportedCapabilities: [...entry.supportedCapabilities],
    reasoningEffortMap:
      entry.reasoningEffortMap !== undefined ? { ...entry.reasoningEffortMap } : undefined,
    defaultReasoningEffort: entry.defaultReasoningEffort,
    preserveReasoning: entry.preserveReasoning,
    cacheControl: entry.cacheControl,
    customFields: entry.customFields
      ? { ...builtInCustomFields, ...entry.customFields }
      : builtInCustomFields,
  };
}

/**
 * Loads and compiles the model defaults from the bundled JSON
 * file. Called lazily on first access and cached thereafter.
 */
function loadDefaults(): void {
  const jsonPath = customJsonPath ?? resolve(__dirname, '..', 'assets', 'model-defaults.json');
  const raw = readFileSync(jsonPath, 'utf-8');
  const entries = JSON.parse(raw) as ModelDefaultsEntry[];

  exactMap = new Map<string, ModelDefaults>();
  regexEntries = [];

  for (const entry of entries) {
    if (entry.match.type === 'exact') {
      exactMap.set(entry.match.value, toDefaults(entry));
    } else {
      regexEntries.push({
        pattern: new RegExp(entry.match.value),
        defaults: toDefaults(entry),
      });
    }
  }
}

/**
 * Returns known default configuration values for a model ID,
 * or `null` if the model is not in the bundled defaults
 * database.
 *
 * Matching strategy:
 * 1. Exact match is checked first.
 * 2. If no exact match, regex patterns are tested in the
 *    order they appear in the JSON file. First match wins.
 *
 * @param modelId - The model identifier to look up.
 * @returns The matching defaults, or `null` if not found.
 */
export function getDefaults(modelId: string): ModelDefaults | null {
  if (exactMap === null || regexEntries === null) {
    loadDefaults();
  }

  // Exact match takes precedence.
  const exact = exactMap!.get(modelId);
  if (exact) {
    return exact;
  }

  // Fall back to regex patterns in order.
  for (const entry of regexEntries!) {
    if (entry.pattern.test(modelId)) {
      return entry.defaults;
    }
  }

  return null;
}
