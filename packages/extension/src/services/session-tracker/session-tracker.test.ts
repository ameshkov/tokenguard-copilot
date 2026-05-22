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
    it('creates a new session when no matches exist', () => {
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

    it('resolves via tool_call_id in messages', () => {
      tracker.registerToolCalls({
        sessionId: 'existing-session',
        toolCallIds: ['tc-100'],
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      const result = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
          {
            role: 'tool',
            content: 'Tool result',
            toolCallId: 'tc-100',
          },
        ],
        responseContent: 'Response',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(result.sessionId).toBe('existing-session');
      expect(result.isNew).toBe(false);
    });

    it('resolves via content checksum fallback', () => {
      const first = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'User message' },
        ],
        responseContent: 'Assistant response',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      const second = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'System prompt' },
          { role: 'user', content: 'User message' },
        ],
        responseContent: 'Assistant response',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      expect(second.sessionId).toBe(first.sessionId);
      expect(second.isNew).toBe(false);
    });

    it('creates new session when checksum differs', () => {
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

    it('prioritizes tool_call_id over checksum', () => {
      tracker.registerToolCalls({
        sessionId: 'tc-session',
        toolCallIds: ['tc-priority'],
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      // Also create a checksum session
      tracker.resolveSession({
        messages: [
          { role: 'system', content: 'Sys' },
          { role: 'user', content: 'Usr' },
        ],
        responseContent: 'Resp',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      // Request with both tool_call_id and content that
      // would match checksum
      const result = tracker.resolveSession({
        messages: [
          { role: 'system', content: 'Sys' },
          { role: 'user', content: 'Usr' },
          {
            role: 'tool',
            content: 'Result',
            toolCallId: 'tc-priority',
          },
        ],
        responseContent: 'Resp',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      expect(result.sessionId).toBe('tc-session');
      expect(result.isNew).toBe(false);
    });
  });

  describe('registerToolCalls', () => {
    it('registers multiple tool call IDs', () => {
      tracker.registerToolCalls({
        sessionId: 'sess-reg',
        toolCallIds: ['tc-r1', 'tc-r2'],
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      const r1 = tracker.resolveSession({
        messages: [
          {
            role: 'tool',
            content: 'r',
            toolCallId: 'tc-r1',
          },
        ],
        responseContent: '',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(r1.sessionId).toBe('sess-reg');

      const r2 = tracker.resolveSession({
        messages: [
          {
            role: 'tool',
            content: 'r',
            toolCallId: 'tc-r2',
          },
        ],
        responseContent: '',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(r2.sessionId).toBe('sess-reg');
    });

    it('skips empty tool call ID array', () => {
      expect(() =>
        tracker.registerToolCalls({
          sessionId: 'sess-empty',
          toolCallIds: [],
          workspaceId: 'ws-1',
          modelName: 'gpt-4o',
        }),
      ).not.toThrow();
    });
  });

  describe('clearMappings', () => {
    it('removes all session mappings', () => {
      tracker.registerToolCalls({
        sessionId: 'sess-clr',
        toolCallIds: ['tc-clr'],
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      tracker.clearMappings();

      const result = tracker.resolveSession({
        messages: [
          {
            role: 'tool',
            content: 'r',
            toolCallId: 'tc-clr',
          },
        ],
        responseContent: '',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(result.sessionId).not.toBe('sess-clr');
      expect(result.isNew).toBe(true);
    });
  });

  describe('clearMappingsForSessions', () => {
    it('removes mappings for specific sessions only', () => {
      tracker.registerToolCalls({
        sessionId: 'sess-a',
        toolCallIds: ['tc-a'],
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      tracker.registerToolCalls({
        sessionId: 'sess-b',
        toolCallIds: ['tc-b'],
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });

      tracker.clearMappingsForSessions(['sess-a']);

      const ra = tracker.resolveSession({
        messages: [
          {
            role: 'tool',
            content: 'r',
            toolCallId: 'tc-a',
          },
        ],
        responseContent: '',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(ra.sessionId).not.toBe('sess-a');

      const rb = tracker.resolveSession({
        messages: [
          {
            role: 'tool',
            content: 'r',
            toolCallId: 'tc-b',
          },
        ],
        responseContent: '',
        workspaceId: 'ws-1',
        modelName: 'gpt-4o',
      });
      expect(rb.sessionId).toBe('sess-b');
    });
  });
});
