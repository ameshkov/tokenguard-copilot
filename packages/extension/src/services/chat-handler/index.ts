/**
 * Chat Handler barrel — re-exports the ChatHandler class
 * and all supporting modules.
 */
export { ChatHandler } from './chat-handler.js';
export { mapRole, translateMessages } from './translate-messages.js';
export { buildRequestBody, parseCustomFields } from './build-request-body.js';
export { extractUsageFromResponse } from './extract-usage.js';
export { handleNonStreaming } from './handle-non-streaming.js';
export { handleStreaming } from './handle-streaming.js';
export { processStreamingDataLine, flushToolCalls } from './process-streaming-chunk.js';
export type { StreamingChunkState } from './process-streaming-chunk.js';
export {
  createCapturingProgress,
  handleChatError,
  handleChatSuccess,
  logChatDebugRequest,
} from './handle-helpers.js';
export type {
  OpenAITool,
  OpenAIToolCall,
  OpenAIContentPart,
  OpenAIContentPartUnion,
  OpenAIMessage,
  ChatContext,
  ReasoningCollector,
  ChatUsage,
  UsageCollector,
} from './chat-types.js';
