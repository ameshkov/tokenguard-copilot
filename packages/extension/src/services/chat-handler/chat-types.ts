/**
 * Type definitions for the chat handler service.
 *
 * Extracted from `chat-handler.ts` to reduce file size and
 * decouple type consumers from implementation details.
 */

import type { CacheControlConfig } from '@tokenguard/shared';
import type { Model, Provider } from '../../db/index.js';
import type { ChatDebugLogger } from '../chat-debug-logger/index.js';
import type { ContentRulesService } from '../content-rules/index.js';
import type { ReasoningFields } from '../../utils/index.js';
import type { Logger } from '../../logger/index.js';

// ---------------------------------------------------------------------------
// OpenAI-format types
// ---------------------------------------------------------------------------

/**
 * OpenAI-format tool definition for the
 * `/chat/completions` request body.
 */
export interface OpenAITool {
  /** Tool type — always `'function'`. */
  type: 'function';
  /** Function definition. */
  function: {
    /** Function name. */
    name: string;
    /** Function description. */
    description?: string;
    /** JSON Schema for the function parameters. */
    parameters?: Record<string, unknown>;
  };
}

/**
 * OpenAI-format tool call returned by the model in an
 * assistant message or streaming delta.
 */
export interface OpenAIToolCall {
  /** Tool call ID assigned by the model. */
  id: string;
  /** Tool type — always `'function'`. */
  type: 'function';
  /** Function call details. */
  function: {
    /** Function name. */
    name: string;
    /** JSON-encoded arguments. */
    arguments: string;
  };
}

/**
 * A single content part in an OpenAI-format message with an
 * optional `cache_control` marker.
 */
export interface OpenAIContentPart {
  /** Content type — always `'text'`. */
  type: 'text';
  /** Text content. */
  text: string;
  /** Cache control marker injected by the cache control service. */
  cache_control?: {
    /** Cache type — typically `'ephemeral'`. */
    type: string;
    /** Optional TTL in seconds. */
    ttl?: number;
  };
}

/**
 * An image URL content part for OpenAI-format messages.
 * The URL is a base64-encoded data URI.
 *
 * @internal Exported as part of OpenAIContentPartUnion;
 *   not imported directly by consumers.
 */
export interface OpenAIImageContentPart {
  /** Content type — always `'image_url'`. */
  type: 'image_url';
  /** Image URL (data URI or external URL). */
  image_url: {
    /** The image URL. */
    url: string;
  };
  /** Cache control marker injected by the cache control service. */
  cache_control?: {
    /** Cache type — typically `'ephemeral'`. */
    type: string;
    /** Optional TTL in seconds. */
    ttl?: number;
  };
}

/** Union of supported content part types. */
export type OpenAIContentPartUnion = OpenAIContentPart | OpenAIImageContentPart;

/**
 * OpenAI-format chat message for the `/chat/completions`
 * request body.
 *
 * Supports text messages (system/user/assistant), assistant
 * messages with tool calls, and tool-result messages.
 */
export interface OpenAIMessage {
  /** Message role. */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /**
   * Text content — may be a plain string, a structured content-part
   * array (used when cache control markers are injected or images
   * are present), or null for tool-call-only messages.
   */
  content: string | OpenAIContentPartUnion[] | null;
  /** Tool calls requested by the assistant. */
  tool_calls?: OpenAIToolCall[];
  /** ID of the tool call this message responds to. */
  tool_call_id?: string;
  /** Reasoning content (string) — DeepSeek, Kimi, GLM, Qwen, MiMo. */
  reasoning_content?: string;
  /** Reasoning (string) — Anthropic plaintext. */
  reasoning?: string;
  /** Reasoning details (array) — Anthropic structured. */
  reasoning_details?: Array<{ type: string; text?: string }>;
}

// ---------------------------------------------------------------------------
// Chat context & supporting types
// ---------------------------------------------------------------------------

/**
 * Context required to handle a chat completion request for
 * a specific model.
 */
export interface ChatContext {
  /** The model database row. */
  model: Model;
  /** The provider database row. */
  provider: Provider;
  /** The provider's API key. */
  apiKey: string;
  /**
   * User-selected reasoning effort level from the model
   * picker, or the model's default. `null` when the model
   * does not support reasoning effort.
   */
  reasoningEffort?: string | null;
  /**
   * OpenAI-format tool definitions from the VS Code request
   * options. `undefined` when no tools are provided.
   */
  tools?: OpenAITool[];

  /**
   * Tool calling mode passed to the OpenAI API as
   * `tool_choice`. `'auto'` lets the model decide whether
   * to call tools; `'required'` forces a tool call.
   * Defaults to `'auto'` when not set.
   */
  toolMode?: 'auto' | 'required';

  /**
   * Logger for writing debug log files. When provided
   * and debug mode is enabled, request-response pairs
   * are logged after response handling completes.
   * Logging is fire-and-forget — errors do not propagate.
   */
  chatDebugLogger?: ChatDebugLogger;

  /**
   * Workspace folder URI string for computing the
   * workspace ID in debug logs. Required when
   * `chatDebugLogger` is provided.
   */
  workspaceFolderUri?: string;

  /**
   * Workspace folder paths for display in debug log
   * metadata (supports multi-root workspaces).
   */
  workspaceFolders?: string[];

  /**
   * Cache control configuration for injecting
   * `cache_control` markers into content blocks.
   * When enabled, markers are placed on the farthest
   * content blocks within a sliding window.
   */
  cacheControl?: CacheControlConfig;

  /**
   * Optional logger for runtime diagnostics.
   * When provided, logs request lifecycle events
   * and errors.
   */
  logger?: Logger;

  /**
   * Content rules service for applying regex-based
   * message transformations before the request is sent.
   * `undefined` when no rules service is configured.
   */
  contentRules?: ContentRulesService;

  /**
   * Extension version string for the User-Agent header
   * sent with the HTTP request. When not provided, the
   * User-Agent falls back to `TokenGuardCopilot/v0.0.0`.
   */
  version?: string;
}

/**
 * Mutable wrapper passed to streaming/non-streaming
 * handlers to capture raw reasoning fields from
 * responses.
 */
export interface ReasoningCollector {
  /** The collected reasoning fields, or `null` if none. */
  fields: ReasoningFields | null;
}

/**
 * Token usage extracted from a chat completion response.
 * Mirrors {@link TokenUsage} from the usage-tracker module
 * but defined here to avoid circular imports.
 */
export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
}

/**
 * Mutable wrapper passed to streaming/non-streaming
 * handlers to capture usage data for recording.
 */
export interface UsageCollector {
  /** Collected usage data, or null if not yet available. */
  usage: ChatUsage | null;
}
