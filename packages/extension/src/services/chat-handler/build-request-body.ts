/**
 * Builds the JSON request body for the `/chat/completions`
 * API endpoint.
 */

import type { CustomField } from '@tokenguard/shared';
import type { ChatContext, OpenAIMessage } from './chat-types.js';

/**
 * Parses the JSON-serialized custom fields string from
 * a model record and converts each field's value
 * according to its type discriminator.
 *
 * Returns an object mapping property names to their
 * converted values. Fields with invalid values
 * (e.g. malformed JSON) are silently skipped.
 *
 * @param customFields - JSON string of
 *   `CustomField[]`, or `null`.
 * @returns Key-value pairs to merge into the request
 *   body.
 */
export function parseCustomFields(customFields: string | null): Record<string, unknown> {
  if (!customFields) {
    return {};
  }

  let fields: CustomField[];
  try {
    fields = JSON.parse(customFields) as CustomField[];
  } catch {
    return {};
  }

  if (!Array.isArray(fields)) {
    return {};
  }

  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (!field.property) {
      continue;
    }

    switch (field.type) {
      case 'string':
        result[field.property] = field.value;
        break;
      case 'number': {
        if (field.value === '') {
          break;
        }
        const n = Number(field.value);
        if (!Number.isFinite(n)) {
          break;
        }
        result[field.property] = n;
        break;
      }
      case 'boolean':
        if (field.value === '') {
          break;
        }
        result[field.property] = field.value === 'true';
        break;
      case 'json':
        if (field.value === '') {
          break;
        }
        try {
          result[field.property] = JSON.parse(field.value) as unknown;
        } catch {
          // Skip fields with invalid JSON values.
        }
        break;
    }
  }
  return result;
}

/**
 * Builds the request body for the `/chat/completions`
 * endpoint.
 *
 * Includes model ID, messages, streaming flag, sampling
 * parameters, and reasoning effort configuration. When the
 * model has a `reasoningEffortMap` in its defaults, the
 * configured effort level is translated into
 * provider-specific body parameters by merging the
 * corresponding map entry. For models without a map, the
 * standard `reasoning_effort` field is used.
 *
 * @param messages - OpenAI-format messages.
 * @param ctx - Chat context with model, provider, and
 *   defaults.
 * @returns Request body object.
 */
export function buildRequestBody(
  messages: OpenAIMessage[],
  ctx: ChatContext,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: ctx.model.id,
    messages,
    stream: ctx.model.streaming === 1,
  };

  if (ctx.model.streaming === 1) {
    body.stream_options = { include_usage: true };
  }

  if (ctx.model.temperature !== null) {
    body.temperature = ctx.model.temperature;
  }
  if (ctx.model.topP !== null) {
    body.top_p = ctx.model.topP;
  }
  if (ctx.model.frequencyPenalty !== null) {
    body.frequency_penalty = ctx.model.frequencyPenalty;
  }
  if (ctx.model.presencePenalty !== null) {
    body.presence_penalty = ctx.model.presencePenalty;
  }

  // Reasoning effort
  const effortLevel = ctx.reasoningEffort ?? ctx.model.defaultReasoningEffort;
  if (effortLevel && ctx.model.reasoningEffortMap) {
    try {
      const effortMap = JSON.parse(ctx.model.reasoningEffortMap) as Record<
        string,
        Record<string, unknown>
      >;
      if (effortLevel in effortMap) {
        Object.assign(body, effortMap[effortLevel]);
      }
    } catch {
      // Invalid JSON — skip reasoning effort
    }
  }

  // Tool definitions
  if (ctx.tools && ctx.tools.length > 0) {
    body.tools = ctx.tools;
    body.tool_choice = ctx.toolMode ?? 'auto';
    body.parallel_tool_calls = true;
  }

  // Custom fields — highest override priority
  const customFieldValues = parseCustomFields(ctx.model.customFields);
  Object.assign(body, customFieldValues);

  return body;
}
