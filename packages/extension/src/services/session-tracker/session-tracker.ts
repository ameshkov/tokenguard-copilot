import type { SessionMappingRepository } from '../../repositories/index.js';
import { computeFingerprint, type FingerprintMessage } from '../../utils/index.js';
import type { Logger } from '../../logger/index.js';

/** Input for resolving a session ID at request time (read-only). */
export interface ResolveSessionInput {
  /** Messages from the chat request. */
  messages: FingerprintMessage[];
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

/** Input for binding a fingerprint after the response is known. */
export interface BindFingerprintInput {
  /** The session ID resolved at request time. */
  sessionId: string;
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

/**
 * Manages session attribution for chat debug logging and the
 * `X-Session-Id` request header.
 *
 * Session resolution is two-phase:
 *
 * 1. {@link resolveSession} runs at request time and never
 *    creates a mapping. For turn 2+ the conversation fingerprint
 *    is computed from the messages alone; on a mapping hit the
 *    existing session is reused. On a miss (or turn 1, where no
 *    fingerprint is possible yet) a fresh UUID is minted
 *    **without creating a mapping**.
 *
 * 2. {@link bindFingerprint} runs after the response arrives,
 *    combining the request messages with the assistant's
 *    response content / tool call IDs to produce the same
 *    fingerprint turn 2 computes at request time. This is the
 *    single mapping write — an upsert keyed by session ID.
 */
export class SessionTracker {
  constructor(
    private readonly mappingRepo: SessionMappingRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Resolve a chat request to a session ID.
   *
   * Never creates a mapping: on a fingerprint hit (turn 2+)
   * the existing session is reused and its `updatedAt`
   * timestamp is refreshed for TTL cleanup; otherwise a
   * fresh UUID is minted with no database write.
   *
   * @param input - The request context for resolution.
   * @returns The session ID and whether it is new.
   */
  resolveSession(input: ResolveSessionInput): ResolveSessionResult {
    const fingerprint = computeFingerprint(input.messages);

    if (fingerprint) {
      const mapping = this.mappingRepo.findByContentFingerprint(fingerprint);
      if (mapping) {
        this.mappingRepo.bumpSession(mapping.sessionId, new Date().toISOString());
        this.logger.trace(
          'Session resolved: existing session',
          `session_id=${mapping.sessionId.slice(0, 8)}...`,
          `model=${input.modelName}`,
        );
        return { sessionId: mapping.sessionId, isNew: false };
      }

      // Known conversation shape but no mapping stored yet
      // (e.g. the first turn's bind did not run or failed) —
      // mint an id and wait for bindFingerprint to persist it.
      this.logger.trace('Session resolved: new session with fingerprint pending bind');
      return { sessionId: crypto.randomUUID(), isNew: true };
    }

    // No fingerprint possible (turn 1) — create session
    // without mapping, bind after the response.
    this.logger.trace('Session resolved: new session without fingerprint');
    return {
      sessionId: crypto.randomUUID(),
      isNew: true,
    };
  }

  /**
   * Bind the assistant response to the session after the
   * request completes.
   *
   * Computes the conversation fingerprint from the request
   * messages plus the assistant's response, and upserts the
   * session → fingerprint mapping (the single database write
   * in the two-phase flow). Does nothing when no fingerprint
   * can be determined (empty response with no tool calls).
   *
   * @param input - The session and response data to bind.
   */
  bindFingerprint(input: BindFingerprintInput): void {
    const fingerprint = computeFingerprint(input.messages, {
      content: input.responseContent,
      toolCallIds: input.responseToolCallIds,
    });

    if (!fingerprint) {
      this.logger.trace(
        'Session bind skipped: no fingerprint possible',
        `session_id=${input.sessionId.slice(0, 8)}...`,
      );
      return;
    }

    this.mappingRepo.upsertFingerprintMapping({
      contentFingerprint: fingerprint,
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      modelName: input.modelName,
      createdAt: new Date().toISOString(),
    });
    this.logger.debug(
      'Session bind: fingerprint stored',
      `session_id=${input.sessionId.slice(0, 8)}...`,
      `model=${input.modelName}`,
    );
  }

  /** Remove all session mappings. */
  clearMappings(): void {
    this.logger.debug('Clearing all session mappings');
    this.mappingRepo.deleteAll();
  }
}
