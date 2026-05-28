import type { SessionMappingRepository } from '../../repositories/session-mapping-repository.js';
import { computeFingerprint, type FingerprintMessage } from '../../utils/fingerprint.js';

/** Input for resolving a session ID. */
export interface ResolveSessionInput {
  /** Messages from the chat request. */
  messages: FingerprintMessage[];
  /** Text content of the model's response. */
  responseContent: string;
  /** IDs of tool calls in the model's response (when content is empty). */
  responseToolCallIds?: string[];
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

/**
 * Manages session attribution for chat debug logging.
 *
 * Resolves incoming chat requests to session IDs using a
 * stable conversation fingerprint that hashes all messages
 * before the first assistant message plus the first
 * assistant's content. This fingerprint stays identical
 * across all turns of a conversation.
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
    const fingerprint = computeFingerprint(input.messages, {
      content: input.responseContent,
      toolCallIds: input.responseToolCallIds,
    });

    if (fingerprint) {
      const mapping = this.mappingRepo.findByContentFingerprint(fingerprint);
      if (mapping) {
        this.mappingRepo.bumpSession(mapping.sessionId, new Date().toISOString());
        return { sessionId: mapping.sessionId, isNew: false };
      }

      // Create new session with fingerprint
      const sessionId = crypto.randomUUID();
      this.mappingRepo.insertFingerprintMapping({
        contentFingerprint: fingerprint,
        sessionId,
        workspaceId: input.workspaceId,
        modelName: input.modelName,
        createdAt: new Date().toISOString(),
      });
      return { sessionId, isNew: true };
    }

    // No fingerprint possible — create session without mapping
    return {
      sessionId: crypto.randomUUID(),
      isNew: true,
    };
  }

  /** Remove all session mappings. */
  clearMappings(): void {
    this.mappingRepo.deleteAll();
  }
}
