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
    let textBuffer = '';
    let contentParts: OpenAIContentPartUnion[] | null = null;
    const toolCalls: OpenAIToolCall[] = [];
    const thinkingParts: LanguageModelThinkingPart[] = [];
    const toolResults: Array<{
      callId: string;
      content: string;
    }> = [];

    for (const part of msg.content) {
      if (part instanceof LanguageModelTextPart) {
        if (contentParts !== null) {
          contentParts.push({ type: 'text', text: part.value });
        } else {
          textBuffer += part.value;
        }
      } else if (part instanceof LanguageModelToolCallPart) {
        toolCalls.push({
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
        toolResults.push({
          callId: part.callId,
          content: finalToolContent,
        });
      } else if (part instanceof LanguageModelDataPart && part.mimeType.startsWith('image/')) {
        if (contentParts === null) {
          contentParts = [];
          if (textBuffer) {
            contentParts.push({ type: 'text', text: textBuffer });
            textBuffer = '';
          }
        }
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: uint8ArrayToBase64(part.data, part.mimeType),
          },
        });
      } else if (part instanceof LanguageModelThinkingPart) {
        thinkingParts.push(part);
      }
    }

    // Tool result messages get their own role
    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        result.push({
          role: 'tool',
          content: tr.content,
          tool_call_id: tr.callId,
        });
      }
      continue;
    }

    const role = mapRole(msg.role);

    let content: string | OpenAIContentPartUnion[] | null;
    if (contentParts !== null) {
      if (textBuffer) {
        contentParts.push({ type: 'text', text: textBuffer });
      }
      content = contentParts;
    } else {
      content = textBuffer || null;
    }

    const openAIMsg: OpenAIMessage = {
      role,
      content,
    };

    if (toolCalls.length > 0) {
      openAIMsg.tool_calls = toolCalls;
    }

    // Extract reasoning from thinking parts (primary source)
    if (thinkingParts.length > 0 && role === 'assistant') {
      const reasoning = thinkingPartsToReasoning(thinkingParts);
      if (reasoning) {
        openAIMsg.reasoning_content = reasoning.reasoning_content;
        openAIMsg.reasoning = reasoning.reasoning;
        openAIMsg.reasoning_details = reasoning.reasoning_details;
      }
    }

    result.push(openAIMsg);
  }

  return result;
}
