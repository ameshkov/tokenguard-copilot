import {
  type LanguageModelChatRequestMessage,
  LanguageModelChatMessageRole,
  LanguageModelThinkingPart,
  LanguageModelTextPart,
  LanguageModelToolCallPart,
  LanguageModelToolResultPart,
  LanguageModelDataPart,
} from 'vscode';
import { thinkingPartsToReasoning } from '../../utils/index.js';
import type { OpenAIMessage, OpenAIContentPartUnion, OpenAIToolCall } from './chat-handler.js';

/**
 * Converts a Uint8Array to a base64-encoded data URI.
 *
 * @param data - The binary data.
 * @param mimeType - The MIME type (e.g. `'image/png'`).
 * @returns A base64 data URI string.
 */
function uint8ArrayToBase64(data: Uint8Array, mimeType: string): string {
  const base64 = Buffer.from(data).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Accumulator for parts collected from a single VS Code
 * chat message during translation to OpenAI format.
 */
interface PartAccumulator {
  /** Accumulated plain text content. */
  textBuffer: string;
  /**
   * Content parts array (non-null when the message
   * contains images or mixed content).
   */
  contentParts: OpenAIContentPartUnion[] | null;
  /** Collected tool calls. */
  toolCalls: OpenAIToolCall[];
  /** Collected thinking parts (for reasoning extraction). */
  thinkingParts: LanguageModelThinkingPart[];
  /** Collected tool results. */
  toolResults: { callId: string; content: string }[];
}

/**
 * Maps a VS Code chat message role to the corresponding
 * OpenAI message role string.
 *
 * VS Code's `LanguageModelChatMessageRole` enum uses
 * `User = 1`, `Assistant = 2`, and `System = 3`
 * (proposed `languageModelSystem` API). This method
 * converts each to the matching OpenAI role.
 *
 * @param role - VS Code chat message role enum value.
 * @returns OpenAI role string.
 */
export function mapRole(role: LanguageModelChatMessageRole): 'system' | 'user' | 'assistant' {
  switch (role) {
    case LanguageModelChatMessageRole.Assistant:
      return 'assistant';
    case LanguageModelChatMessageRole.System:
      return 'system';
    default:
      return 'user';
  }
}

/**
 * Collects all content parts from a VS Code message into
 * the accumulator, classifying them as text, images, tool
 * calls, tool results, or thinking parts.
 *
 * @param messageContent - The `msg.content` array from
 *   a VS Code chat request message.
 * @param acc - Mutable accumulator for collected parts.
 */
function collectParts(messageContent: readonly unknown[], acc: PartAccumulator): void {
  for (const part of messageContent) {
    if (part instanceof LanguageModelTextPart) {
      if (acc.contentParts !== null) {
        acc.contentParts.push({ type: 'text', text: part.value });
      } else {
        acc.textBuffer += part.value;
      }
    } else if (part instanceof LanguageModelToolCallPart) {
      acc.toolCalls.push({
        id: part.callId,
        type: 'function',
        function: {
          name: part.name,
          arguments: JSON.stringify(part.input),
        },
      });
    } else if (part instanceof LanguageModelToolResultPart) {
      let toolContent = '';
      const toolContentParts: OpenAIContentPartUnion[] = [];
      for (const item of part.content) {
        if (item instanceof LanguageModelTextPart) {
          toolContent += item.value;
        } else if (item instanceof LanguageModelDataPart && item.mimeType.startsWith('image/')) {
          toolContentParts.push({
            type: 'image_url',
            image_url: {
              url: uint8ArrayToBase64(item.data, item.mimeType),
            },
          });
        }
      }
      let finalToolContent: string;
      if (toolContentParts.length > 0) {
        const parts: OpenAIContentPartUnion[] = [];
        if (toolContent) {
          parts.push({ type: 'text', text: toolContent });
        }
        parts.push(...toolContentParts);
        finalToolContent = JSON.stringify(parts);
      } else {
        finalToolContent = toolContent || JSON.stringify(part.content);
      }
      acc.toolResults.push({
        callId: part.callId,
        content: finalToolContent,
      });
    } else if (part instanceof LanguageModelDataPart && part.mimeType.startsWith('image/')) {
      if (acc.contentParts === null) {
        acc.contentParts = [];
        if (acc.textBuffer) {
          acc.contentParts.push({ type: 'text', text: acc.textBuffer });
          acc.textBuffer = '';
        }
      }
      acc.contentParts.push({
        type: 'image_url',
        image_url: {
          url: uint8ArrayToBase64(part.data, part.mimeType),
        },
      });
    } else if (part instanceof LanguageModelThinkingPart) {
      acc.thinkingParts.push(part);
    }
  }
}

/**
 * Builds one or more OpenAI-format messages from a VS Code
 * message and the collected part accumulator.
 *
 * Tool-result-only messages produce dedicated `'tool'`
 * role messages. All other messages become a single
 * assistant/user/system message with optional tool calls
 * and reasoning content.
 *
 * @param msg - The original VS Code chat request message
 *   (used for its role).
 * @param acc - The accumulator with collected parts.
 * @returns Array of OpenAI-format messages (normally one,
 *   but may be multiple for tool results).
 */
function buildOpenAIMessages(
  msg: { readonly role: LanguageModelChatMessageRole },
  acc: PartAccumulator,
): OpenAIMessage[] {
  // Tool result messages get their own role
  if (acc.toolResults.length > 0) {
    return acc.toolResults.map((tr) => ({
      role: 'tool' as const,
      content: tr.content,
      tool_call_id: tr.callId,
    }));
  }

  const role = mapRole(msg.role);

  let content: string | OpenAIContentPartUnion[] | null;
  if (acc.contentParts !== null) {
    if (acc.textBuffer) {
      acc.contentParts.push({ type: 'text', text: acc.textBuffer });
    }
    content = acc.contentParts;
  } else {
    content = acc.textBuffer || null;
  }

  const openAIMsg: OpenAIMessage = {
    role,
    content,
  };

  if (acc.toolCalls.length > 0) {
    openAIMsg.tool_calls = acc.toolCalls;
  }

  // Extract reasoning from thinking parts (primary source)
  if (acc.thinkingParts.length > 0 && role === 'assistant') {
    const reasoning = thinkingPartsToReasoning(acc.thinkingParts);
    if (reasoning) {
      openAIMsg.reasoning_content = reasoning.reasoning_content;
      openAIMsg.reasoning = reasoning.reasoning;
      openAIMsg.reasoning_details = reasoning.reasoning_details;
    }
  }

  return [openAIMsg];
}

/**
 * Translates VS Code chat messages into OpenAI-format
 * messages.
 *
 * Extracts text content from `LanguageModelTextPart`
 * instances, concatenates multiple text parts per message,
 * maps VS Code roles to OpenAI roles, and converts
 * `LanguageModelDataPart` image parts to `image_url`
 * content parts.
 *
 * @param messages - VS Code chat request messages.
 * @returns Array of OpenAI-format messages.
 */
export function translateMessages(
  messages: readonly LanguageModelChatRequestMessage[],
): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  for (const msg of messages) {
    const acc: PartAccumulator = {
      textBuffer: '',
      contentParts: null,
      toolCalls: [],
      thinkingParts: [],
      toolResults: [],
    };

    collectParts(msg.content, acc);
    result.push(...buildOpenAIMessages(msg, acc));
  }

  return result;
}
