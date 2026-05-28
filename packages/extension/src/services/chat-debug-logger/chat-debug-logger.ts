import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import type { ChatDebugSettingsService } from '../chat-debug-settings/index.js';
import type { SessionTracker } from '../session-tracker/index.js';
import type { OpenAIMessage, OpenAITool, ChatUsage } from '../chat-handler/index.js';
import { extractTextContent, extractImageParts } from '../../utils/content.js';
import { extractReasoning } from '../../utils/reasoning.js';

/** Input data for logging a chat request-response pair. */
export interface LogRequestInput {
  /** Translated chat messages sent in the request. */
  messages: OpenAIMessage[];
  /** Accumulated response text content. */
  responseContent: string;
  /** Tool calls from the model response. */
  responseToolCalls: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  /** Reasoning content from the model response (pre-extracted display string). */
  responseReasoning?: string | null;
  /** Display name of the model (e.g. "provider/model-id"). */
  modelName: string;
  /** Sampling parameters and other model options. */
  modelOptions: Record<string, unknown>;
  /** Tool definitions sent with the request. */
  tools: OpenAITool[] | undefined;
  /** Tool calling mode ('auto' or 'required'). */
  toolMode?: 'auto' | 'required';
  /** When the request started. */
  startTime: Date;
  /** When the request completed. */
  endTime: Date;
  /** Whether the request was cancelled by the user. */
  cancelled: boolean;
  /** Error message if the request failed. */
  error: string | undefined;
  /** Workspace folder URI for computing workspace ID. */
  workspaceFolderUri: string;
  /** Token usage from the API response, or null if unavailable. */
  usage?: ChatUsage | null;
}

const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'authorization',
  'token',
  'secret',
  'password',
  'bearer',
]);

/**
 * Strips sensitive keys from model options.
 *
 * @param opts - The raw model options.
 * @returns A copy with sensitive keys removed.
 */
function sanitizeOptions(opts: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(opts)) {
    if (!SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Formats a message role as a human-readable label.
 *
 * @param msg - The message to label.
 * @returns Capitalized role label (e.g. "System", "Tool Result").
 */
function formatRoleLabel(msg: OpenAIMessage): string {
  if (msg.role === 'tool') return 'Tool Result';
  return msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
}

/**
 * Writes chat request-response pairs as structured Markdown
 * log files to disk.
 *
 * Checks the debug settings before logging. Uses
 * SessionTracker for session attribution. Writes atomically
 * via temp file + rename. Logging errors are silently
 * swallowed (fire-and-forget).
 */
export class ChatDebugLogger {
  /**
   * Creates a new ChatDebugLogger.
   *
   * @param settingsService - Service for reading debug settings.
   * @param sessionTracker - Service for resolving session IDs.
   * @param logsBasePath - Base directory for log files.
   * @param onLogWrite - Optional callback invoked after a
   *   successful log write to refresh the tree view.
   */
  constructor(
    private readonly settingsService: ChatDebugSettingsService,
    private readonly sessionTracker: SessionTracker,
    private readonly logsBasePath: string,
    private readonly onLogWrite?: () => void,
  ) {}

  /**
   * Sanitizes a model name for use as a filesystem
   * directory name component.
   *
   * Replaces filesystem-unsafe characters (`/`, `\`, `:`,
   * `<`, `>`, `"`, `|`, `?`, `*`) with hyphens, collapses
   * consecutive hyphens, and trims leading/trailing hyphens.
   *
   * @param modelName - The raw model name.
   * @returns A filesystem-safe model name.
   */
  static sanitizeModelName(modelName: string): string {
    return modelName
      .replace(/[/\\:<>"|?*]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Computes a workspace ID from a workspace folder URI.
   *
   * @param uri - The workspace folder URI string.
   * @returns A 16-character hex string (truncated SHA-256).
   */
  static computeWorkspaceId(uri: string): string {
    return createHash('sha256').update(uri).digest('hex').slice(0, 16);
  }

  /**
   * Formats a Date as a filesystem-safe timestamp string.
   *
   * @param date - The date to format.
   * @returns Timestamp in `YYYYMMDD-HHmmss-SSS` format.
   */
  static formatTimestamp(date: Date): string {
    const y = date.getUTCFullYear();
    const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const mi = String(date.getUTCMinutes()).padStart(2, '0');
    const s = String(date.getUTCSeconds()).padStart(2, '0');
    const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
    return `${y}${mo}${d}-${h}${mi}${s}-${ms}`;
  }

  /**
   * Formats a log entry as a structured Markdown string.
   *
   * @param input - The request-response data to format.
   * @param requestId - Unique request identifier (UUID).
   * @returns The formatted Markdown content.
   */
  static formatLogMarkdown(input: LogRequestInput, requestId: string): string {
    const duration = input.endTime.getTime() - input.startTime.getTime();
    const toolCount = input.tools?.length ?? 0;
    const messageCount = input.messages.length;

    const safeOptions = sanitizeOptions(input.modelOptions);

    const sections: string[] = [];

    // Title
    sections.push(`# ChatRequest - ${requestId}`);
    sections.push('');

    // Table of contents
    sections.push('- [Metadata](#metadata)');
    sections.push('- [Messages](#messages)');
    for (let i = 0; i < messageCount; i++) {
      const msg = input.messages[i];
      const label = formatRoleLabel(msg);
      const anchor = `message-${i + 1}-${label.toLowerCase().replace(/\s+/g, '-')}`;
      sections.push(`    - [Message ${i + 1} (${label})](#${anchor})`);
    }
    sections.push('- [Response](#response)');
    sections.push('');

    // Metadata
    sections.push('## Metadata');
    sections.push('');
    sections.push('<pre><code>');

    const metaLines = [
      `model         : ${input.modelName}`,
      `startTime     : ${input.startTime.toISOString()}`,
      `endTime       : ${input.endTime.toISOString()}`,
      `duration      : ${duration}ms`,
      `cancelled     : ${input.cancelled}`,
    ];

    if (toolCount > 0) {
      metaLines.push(`toolMode      : ${input.toolMode ?? 'auto'}`);
    }
    metaLines.push(`toolCount     : ${toolCount}`);
    metaLines.push(`messageCount  : ${messageCount}`);
    metaLines.push(`modelOptions  : ${JSON.stringify(safeOptions)}`);

    sections.push(metaLines.join('\n'));

    // Tools details
    if (input.tools && input.tools.length > 0) {
      const toolNames = input.tools.map((t) => t.function.name).join(', ');
      const toolJson = input.tools.map((t) => ({
        name: t.function.name,
        description: t.function.description ?? '',
      }));
      sections.push('<details>');
      sections.push(`<summary>tools (${toolCount}): ${toolNames}</summary>`);
      sections.push('');
      sections.push('```json');
      sections.push(JSON.stringify(toolJson, null, 2));
      sections.push('```');
      sections.push('');
      sections.push('</details>');
    }

    // Usage details
    if (input.usage) {
      const u = input.usage;
      const total = u.promptTokens + u.completionTokens;
      let summary = `usage: prompt ${u.promptTokens} | completion ${u.completionTokens} | total ${total}`;
      if (u.cachedTokens > 0) summary += ` | cached ${u.cachedTokens}`;
      if (u.reasoningTokens > 0) summary += ` | reasoning ${u.reasoningTokens}`;
      sections.push('<details>');
      sections.push(`<summary>${summary}</summary>`);
      sections.push('');
      sections.push('```json');
      sections.push(
        JSON.stringify(
          {
            promptTokens: u.promptTokens,
            completionTokens: u.completionTokens,
            totalTokens: total,
            cachedTokens: u.cachedTokens,
            reasoningTokens: u.reasoningTokens,
          },
          null,
          2,
        ),
      );
      sections.push('```');
      sections.push('');
      sections.push('</details>');
    }

    sections.push('</code></pre>');
    sections.push('');

    // Messages
    sections.push('## Messages');
    sections.push('');

    for (let i = 0; i < messageCount; i++) {
      const msg = input.messages[i];
      const label = formatRoleLabel(msg);
      sections.push(`### Message ${i + 1} (${label})`);
      sections.push('');

      // Reasoning block (first, if present)
      const msgReasoning = extractReasoning(msg);
      if (msgReasoning) {
        sections.push('~~~md');
        sections.push('🧠 Reasoning');
        sections.push(msgReasoning);
        sections.push('~~~');
        sections.push('');
      }

      // Content + tool calls block
      sections.push('~~~md');
      const textContent = extractTextContent(msg.content);
      if (textContent) {
        sections.push(textContent);
      }

      // Image parts
      const imageParts = extractImageParts(msg.content);
      for (const img of imageParts) {
        if (img.mimeType !== 'unknown') {
          const sizeKb = (img.sizeBytes / 1024).toFixed(1);
          sections.push(`🖼️ Image (${img.mimeType}, ${sizeKb} KB)`);
        } else {
          sections.push(`🖼️ Image (external URL)`);
        }
      }

      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          sections.push('');
          sections.push(`🛠️ ${tc.function.name} ${tc.function.arguments}`);
        }
      }
      sections.push('~~~');
      sections.push('');
    }

    // Response
    sections.push('## Response');
    sections.push('');

    if (input.error) {
      sections.push('### Error');
      sections.push('');
      sections.push('~~~');
      sections.push(input.error);
      sections.push('~~~');
    } else if (input.cancelled && !input.responseContent) {
      sections.push('*Request was cancelled. No response received.*');
    } else {
      if (input.cancelled) {
        sections.push('*Request was cancelled. Partial response:*');
        sections.push('');
      }

      // Render response reasoning when present
      if (input.responseReasoning) {
        sections.push('### Reasoning');
        sections.push('');
        sections.push('~~~');
        sections.push(input.responseReasoning);
        sections.push('~~~');
        sections.push('');
      }

      sections.push('### Assistant');
      sections.push('');
      sections.push('~~~md');
      if (input.responseContent) {
        sections.push(input.responseContent);
      }
      if (input.responseToolCalls.length > 0) {
        for (const tc of input.responseToolCalls) {
          sections.push('');
          sections.push(`🛠️ ${tc.name} ${tc.arguments}`);
        }
      }
      sections.push('~~~');
    }
    sections.push('');

    return sections.join('\n');
  }

  /**
   * Logs a chat request-response pair as a Markdown file.
   *
   * Checks if debug logging is enabled before writing.
   * Resolves the session via SessionTracker, creates the
   * directory structure, writes atomically (temp + rename),
   * and registers any tool calls. Errors are silently
   * swallowed.
   *
   * @param input - The request-response data to log.
   */
  logRequest(input: LogRequestInput): void {
    try {
      const settings = this.settingsService.getSettings();
      if (!settings.enabled) {
        return;
      }

      const workspaceId = ChatDebugLogger.computeWorkspaceId(input.workspaceFolderUri);

      const toolCallIds =
        input.responseToolCalls.length > 0 ? input.responseToolCalls.map((tc) => tc.id) : undefined;

      const { sessionId } = this.sessionTracker.resolveSession({
        messages: input.messages,
        responseContent: input.responseContent,
        responseToolCallIds: toolCallIds,
        workspaceId,
        modelName: input.modelName,
      });

      const requestId = randomUUID();
      const timestamp = ChatDebugLogger.formatTimestamp(input.startTime);
      const fileName = `${timestamp}-${requestId}.md`;

      const sanitizedModel = ChatDebugLogger.sanitizeModelName(input.modelName);
      const sessionDirName = `${sanitizedModel}--${sessionId}`;

      const sessionDir = join(this.logsBasePath, workspaceId, sessionDirName);
      mkdirSync(sessionDir, { recursive: true });

      const filePath = join(sessionDir, fileName);
      const tmpPath = `${filePath}.tmp`;

      const content = ChatDebugLogger.formatLogMarkdown(input, requestId);

      // Atomic write: temp file + rename
      writeFileSync(tmpPath, content, 'utf-8');
      renameSync(tmpPath, filePath);

      // Fire refresh callback after successful write.
      this.onLogWrite?.();
    } catch {
      // Fire-and-forget: logging errors do not propagate
    }
  }
}
