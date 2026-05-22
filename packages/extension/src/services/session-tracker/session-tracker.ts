import { createHash } from 'node:crypto';
import type { SessionMappingRepository } from '../../repositories/session-mapping-repository.js';

/** A message in the chat request for session resolution. */
export interface SessionMessage {
  /** Message role (system, user, assistant, tool). */
  role: string;
  /** Message text content. */
  content: string;
  /** Tool call ID (present on tool-result messages). */
  toolCallId?: string;
}

/** Input for resolving a session ID. */
export interface ResolveSessionInput {
  /** Messages from the chat request. */
  messages: SessionMessage[];
  /** Text content of the model's response. */
  responseContent: string;
  /** Hash of the workspace folder URI. */
  workspaceId: string;
  /** Display name of the model. */
  modelName: string;
}

/** Result of session resolution. */
export interface ResolveSessionResult {
  /** The resolved or newly created session ID. */
  sessionId: string;
  /** Whether a new session was created. */
  isNew: boolean;
}

/** Input for registering tool calls to a session. */
export interface RegisterToolCallsInput {
  /** Session ID to associate tool calls with. */
  sessionId: string;
  /** Tool call IDs from the model response. */
  toolCallIds: string[];
  /** Hash of the workspace folder URI. */
  workspaceId: string;
  /** Display name of the model. */
  modelName: string;
}

/**
 * Manages session attribution for chat debug logging.
 *
 * Resolves incoming chat requests to session IDs using:
 * 1. Tool call ID lookup (primary)
 * 2. Content checksum lookup (fallback)
 * 3. New session creation (when no match found)
 */
export class SessionTracker {
  constructor(private readonly mappingRepo: SessionMappingRepository) {}

  /**
   * Resolve a chat request to a session ID.
   *
   * @param input - The request context for resolution.
   * @returns The session ID and whether it is new.
   */
  resolveSession(input: ResolveSessionInput): ResolveSessionResult {
    // 1. Try tool_call_id lookup
    const toolCallIds = input.messages
      .filter((m) => m.toolCallId !== undefined)
      .map((m) => m.toolCallId!);

    for (const tcId of toolCallIds) {
      const mapping = this.mappingRepo.findByToolCallId(tcId);
      if (mapping) {
        return {
          sessionId: mapping.sessionId,
          isNew: false,
        };
      }
    }

    // 2. Try content checksum lookup
    const checksum = this.computeChecksum(input.messages, input.responseContent);

    if (checksum) {
      const mapping = this.mappingRepo.findByContentChecksum(checksum);
      if (mapping) {
        return {
          sessionId: mapping.sessionId,
          isNew: false,
        };
      }
    }

    // 3. Create new session
    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    if (checksum) {
      this.mappingRepo.insertChecksumMapping({
        contentChecksum: checksum,
        sessionId,
        workspaceId: input.workspaceId,
        modelName: input.modelName,
        createdAt: now,
      });
    }

    return { sessionId, isNew: true };
  }

  /**
   * Register tool call IDs for a session after a model
   * response.
   *
   * @param input - The tool call registration context.
   */
  registerToolCalls(input: RegisterToolCallsInput): void {
    if (input.toolCallIds.length === 0) return;

    const now = new Date().toISOString();
    for (const toolCallId of input.toolCallIds) {
      this.mappingRepo.insertToolCallMapping({
        toolCallId,
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        modelName: input.modelName,
        createdAt: now,
      });
    }
  }

  /** Remove all session mappings. */
  clearMappings(): void {
    this.mappingRepo.deleteAll();
  }

  /**
   * Remove session mappings for specific session IDs.
   *
   * @param sessionIds - Session IDs to remove mappings
   *   for.
   */
  clearMappingsForSessions(sessionIds: string[]): void {
    this.mappingRepo.deleteBySessionIds(sessionIds);
  }

  /**
   * Compute a content checksum from the first system
   * message, first user message, and the assistant
   * response content.
   *
   * @param messages - Chat request messages.
   * @param responseContent - Model response text.
   * @returns SHA-256 hex digest, or `null` if neither a
   *   system nor user message is present.
   */
  private computeChecksum(messages: SessionMessage[], responseContent: string): string | null {
    const system = messages.find((m) => m.role === 'system');
    const user = messages.find((m) => m.role === 'user');

    if (!system && !user) return null;

    const parts = [system?.content ?? '', user?.content ?? '', responseContent];

    return createHash('sha256').update(parts.join('\0')).digest('hex');
  }
}
