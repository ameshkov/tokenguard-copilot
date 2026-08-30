import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('vscode', () => ({
  LanguageModelThinkingPart: class {
    constructor(
      public value: string | string[],
      public id?: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      public metadata?: { readonly [key: string]: any },
    ) {}
  },
}));

import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { SessionMappingRepository } from '../../repositories/index.js';
import { SessionTracker } from './session-tracker.js';
import { computeFingerprint, type FingerprintMessage } from '../../utils/index.js';
import { createMockLogger } from '../../test/mock-logger.js';
import type { Database } from '../../db/index.js';
import type { DatabaseSync } from 'node:sqlite';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const turn1Messages: FingerprintMessage[] = [
  { role: 'system', content: 'You are helpful' },
  { role: 'user', content: 'Hello' },
];

const turn2Messages: FingerprintMessage[] = [
  ...turn1Messages,
  { role: 'assistant', content: 'Hi there' },
  { role: 'user', content: 'Follow-up question' },
];

describe('SessionTracker', () => {
  let db: Database;
  let raw: DatabaseSync;
  let repo: SessionMappingRepository;
  let tracker: SessionTracker;

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    repo = new SessionMappingRepository(db);
    tracker = new SessionTracker(repo, createMockLogger());
  });

  afterEach(() => {
    clearTestDb(raw);
    raw.close();
  });

  describe('resolveSession', () => {
    it('mints a session id without a DB row on turn 1', () => {
      const result = tracker.resolveSession({
        messages: turn1Messages,
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      expect(result.sessionId).toMatch(UUID_RE);
      expect(result.isNew).toBe(true);
      // Phase A does not create a mapping yet.
      expect(repo.getDistinctSessionIds()).toEqual([]);
    });

    it('resolves to the same session id on turn 2 when turn 1 bound its fingerprint', () => {
      const turn1 = tracker.resolveSession({
        messages: turn1Messages,
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      tracker.bindFingerprint({
        sessionId: turn1.sessionId,
        messages: turn1Messages,
        responseContent: 'Hi there',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      const turn2 = tracker.resolveSession({
        messages: turn2Messages,
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(turn2.sessionId).toBe(turn1.sessionId);
      expect(turn2.isNew).toBe(false);
    });

    it('mints a new session id on turn 2 when turn 1 never bound a fingerprint', () => {
      const turn1 = tracker.resolveSession({
        messages: turn1Messages,
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      // No bindFingerprint — e.g. the first request failed
      // without a response. Turn 2 cannot resolve to it.
      const turn2 = tracker.resolveSession({
        messages: turn2Messages,
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(turn2.sessionId).not.toBe(turn1.sessionId);
      expect(turn2.isNew).toBe(true);
    });

    it('mints a new id without a DB write when no fingerprint is possible', () => {
      const result = tracker.resolveSession({
        messages: [],
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      expect(result.sessionId).toMatch(UUID_RE);
      expect(result.isNew).toBe(true);
      expect(repo.getDistinctSessionIds()).toEqual([]);
    });

    it('reuses the existing session on turn 2 via the tool-call fingerprint', () => {
      const turn1 = tracker.resolveSession({
        messages: turn1Messages,
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      tracker.bindFingerprint({
        sessionId: turn1.sessionId,
        messages: turn1Messages,
        responseContent: '',
        responseToolCallIds: ['call_def', 'call_abc'],
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      // Turn 2: first assistant message carries the tool calls
      // (order is irrelevant to the fingerprint).
      const turn2 = tracker.resolveSession({
        messages: [
          ...turn1Messages,
          {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call_abc' }, { id: 'call_def' }],
          },
          { role: 'tool', content: 'Result A' },
          { role: 'user', content: 'Continue with results' },
        ],
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      expect(turn2.sessionId).toBe(turn1.sessionId);
      expect(turn2.isNew).toBe(false);
    });
  });

  describe('bindFingerprint', () => {
    it('creates the session mapping row for a bound response', () => {
      const { sessionId } = tracker.resolveSession({
        messages: turn1Messages,
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      tracker.bindFingerprint({
        sessionId,
        messages: turn1Messages,
        responseContent: 'Hi there',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      const fingerprint = computeFingerprint(turn1Messages, { content: 'Hi there' });
      const row = repo.findByContentFingerprint(fingerprint!);
      expect(row).toBeDefined();
      expect(row!.sessionId).toBe(sessionId);
      expect(repo.getDistinctSessionIds()).toEqual([sessionId]);
    });

    it('does not write a mapping when no fingerprint can be determined', () => {
      const { sessionId } = tracker.resolveSession({
        messages: [],
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      tracker.bindFingerprint({
        sessionId,
        messages: [],
        responseContent: '',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      expect(repo.getDistinctSessionIds()).toEqual([]);
    });

    it('updates the fingerprint on a second bind instead of adding a row', () => {
      const { sessionId } = tracker.resolveSession({
        messages: turn1Messages,
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      tracker.bindFingerprint({
        sessionId,
        messages: turn1Messages,
        responseContent: 'Hi there',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      // A second bind (e.g. the request was retried) must
      // refresh the row rather than create a duplicate.
      tracker.bindFingerprint({
        sessionId,
        messages: turn1Messages,
        responseContent: 'Hi there!',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      expect(repo.getDistinctSessionIds()).toEqual([sessionId]);
      const stale = computeFingerprint(turn1Messages, { content: 'Hi there' });
      const current = computeFingerprint(turn1Messages, { content: 'Hi there!' });
      expect(repo.findByContentFingerprint(stale!)).toBeUndefined();
      expect(repo.findByContentFingerprint(current!)?.sessionId).toBe(sessionId);
    });
  });

  describe('clearMappings', () => {
    it('removes all session mappings and forces a new id on the next turn', () => {
      const first = tracker.resolveSession({
        messages: turn1Messages,
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      tracker.bindFingerprint({
        sessionId: first.sessionId,
        messages: turn1Messages,
        responseContent: 'Hi there',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      tracker.clearMappings();
      expect(repo.getDistinctSessionIds()).toEqual([]);

      const second = tracker.resolveSession({
        messages: turn2Messages,
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(second.sessionId).not.toBe(first.sessionId);
      expect(second.isNew).toBe(true);
    });
  });
});
