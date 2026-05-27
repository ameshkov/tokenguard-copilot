import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { SessionMappingRepository } from '../../repositories/session-mapping-repository.js';
import { SessionTracker } from './session-tracker.js';
import type { Database } from '../../db/connection.js';
import type { DatabaseSync } from 'node:sqlite';

describe('SessionTracker', () => {
  let db: Database;
  let raw: DatabaseSync;
  let tracker: SessionTracker;

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    const repo = new SessionMappingRepository(db);
    tracker = new SessionTracker(repo);
  });

  afterEach(() => {
    clearTestDb(raw);
    raw.close();
  });

  describe('resolveSession', () => {
    it('creates a new session and stores fingerprint on turn 1', () => {
      const result = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
        responseContent: 'Hi there',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(result.sessionId).toBeDefined();
      expect(result.isNew).toBe(true);
    });

    it('resolves to existing session via fingerprint on turn 2+', () => {
      // Turn 1: system + user → response "Hi there"
      const turn1 = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
        responseContent: 'Hi there',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(turn1.isNew).toBe(true);

      // Turn 2: messages include the assistant with
      // content matching turn 1's responseContent
      const turn2 = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
          { role: 'user', content: 'Follow-up question' },
        ],
        responseContent: 'Follow-up answer',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(turn2.sessionId).toBe(turn1.sessionId);
      expect(turn2.isNew).toBe(false);
    });

    it('creates new session when fingerprint differs', () => {
      const first = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'Prompt A' },
          { role: 'user', content: 'Question A' },
        ],
        responseContent: 'Answer A',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      const second = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'Prompt B' },
          { role: 'user', content: 'Question B' },
        ],
        responseContent: 'Answer B',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      expect(second.sessionId).not.toBe(first.sessionId);
      expect(second.isNew).toBe(true);
    });

    it('creates session without mapping when messages are empty', () => {
      const result = tracker.resolveSession({
        messages: [],
        responseContent: 'Some response',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(result.sessionId).toBeDefined();
      expect(result.isNew).toBe(true);
    });
  });

  describe('clearMappings', () => {
    it('removes all session mappings', () => {
      const first = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: 'User' },
        ],
        responseContent: 'Response',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      tracker.clearMappings();

      // Turn 2 with same fingerprint should create a new
      // session since mappings were cleared
      const second = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: 'User' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Follow-up' },
        ],
        responseContent: 'Follow-up answer',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(second.sessionId).not.toBe(first.sessionId);
      expect(second.isNew).toBe(true);
    });
  });
});
