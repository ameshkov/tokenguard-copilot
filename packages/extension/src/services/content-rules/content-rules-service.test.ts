import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, clearTestDb } from '../../test/db-setup.js';
import { createMockLogger } from '../../test/mock-logger.js';
import { ContentRulesRepository } from '../../repositories/index.js';
import { ContentRulesService } from './content-rules-service.js';
import type { Database } from '../../db/index.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OpenAIMessage } from '../chat-handler/index.js';

describe('ContentRulesService', () => {
  let db: Database;
  let raw: DatabaseSync;
  let repo: ContentRulesRepository;
  let service: ContentRulesService;

  beforeEach(() => {
    ({ db, raw } = createTestDb());
    repo = new ContentRulesRepository(db);
    service = new ContentRulesService(repo, createMockLogger());
  });

  afterEach(() => {
    clearTestDb(raw);
  });

  describe('applyRules', () => {
    it('returns messages unchanged when no rules exist', () => {
      const messages: OpenAIMessage[] = [
        { role: 'system', content: 'Hello system' },
        { role: 'user', content: 'Hello user' },
      ];
      const result = service.applyRules(messages, 'gpt-4o', []);
      expect(result.messages).toEqual(messages);
      expect(result.ruleResults).toEqual([]);
    });

    it('loads enabled rules ordered by sortOrder', () => {
      repo.insert({
        id: 'r1',
        name: 'Rule 1',
        enabled: 1,
        regexPattern: 'hello',
        substitution: 'hi',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      repo.insert({
        id: 'r2',
        name: 'Rule 2',
        enabled: 1,
        regexPattern: 'world',
        substitution: 'earth',
        sortOrder: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      // Disabled rule — should be skipped
      repo.insert({
        id: 'r3',
        name: 'Rule 3',
        enabled: 0,
        regexPattern: 'foo',
        substitution: 'bar',
        sortOrder: 2,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });

      const messages: OpenAIMessage[] = [{ role: 'system', content: 'hello world' }];
      const result = service.applyRules(messages, 'gpt-4o', []);

      // Rule 1: "hello" → "hi", Rule 2: "world" → "earth"
      // Sequential: "hello world" → "hi world" → "hi earth"
      expect(result.messages[0].content).toBe('hi earth');
      // Rule 3 is disabled, so it should not appear in results
      expect(result.ruleResults).toHaveLength(2);
      expect(result.ruleResults[0].ruleId).toBe('r1');
      expect(result.ruleResults[1].ruleId).toBe('r2');
    });

    describe('role filtering', () => {
      beforeEach(() => {
        repo.insert({
          id: 'r-system',
          name: 'System Rule',
          enabled: 1,
          matchRole: 'system',
          regexPattern: 'hello',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        repo.insert({
          id: 'r-user',
          name: 'User Rule',
          enabled: 1,
          matchRole: 'user',
          regexPattern: 'hello',
          substitution: 'hey',
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        repo.insert({
          id: 'r-all',
          name: 'All Rule',
          enabled: 1,
          matchRole: 'all',
          regexPattern: 'world',
          substitution: 'earth',
          sortOrder: 2,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        repo.insert({
          id: 'r-all-2',
          name: 'Another All Rule',
          enabled: 1,
          matchRole: 'all',
          regexPattern: 'test',
          substitution: 'TEST',
          sortOrder: 3,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      });

      it('system rule only transforms system messages', () => {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'hello world' },
          { role: 'user', content: 'hello world' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi earth');
        expect(result.messages[1].content).toBe('hey earth');
      });

      it('all role matches all roles', () => {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'a test here' },
          { role: 'user', content: 'a test here' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('a TEST here');
        expect(result.messages[1].content).toBe('a TEST here');
      });
    });

    describe('message number filtering', () => {
      beforeEach(() => {
        repo.insert({
          id: 'r-pos0',
          name: 'Position 0',
          enabled: 1,
          matchMessageNumber: 0,
          regexPattern: 'hello',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        repo.insert({
          id: 'r-pos1',
          name: 'Position 1',
          enabled: 1,
          matchMessageNumber: 1,
          regexPattern: 'hello',
          substitution: 'hey',
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      });

      it('transforms only the message at the specified index', () => {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'hello' },
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hello' },
          { role: 'user', content: 'hello' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi');
        expect(result.messages[1].content).toBe('hey');
        expect(result.messages[2].content).toBe('hello');
        expect(result.messages[3].content).toBe('hello');
      });

      it('null message number applies to all messages', () => {
        repo.insert({
          id: 'r-no-filter',
          name: 'No Filter',
          enabled: 1,
          matchMessageNumber: null,
          regexPattern: 'world',
          substitution: 'earth',
          sortOrder: 2,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'hello world' },
          { role: 'user', content: 'hello world' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi earth');
        expect(result.messages[1].content).toBe('hey earth');
      });
    });

    describe('model pattern matching', () => {
      beforeEach(() => {
        repo.insert({
          id: 'r-gpt',
          name: 'GPT Only',
          enabled: 1,
          matchModelPattern: 'gpt-*',
          regexPattern: 'hello',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      });

      it('applies when model matches wildcard', () => {
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi');
        expect(result.ruleResults[0].matched).toBe(true);
      });

      it('skips when model does not match wildcard', () => {
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'claude-3', []);
        expect(result.messages[0].content).toBe('hello');
        expect(result.ruleResults[0].matched).toBe(false);
      });

      it('? matches exactly one character', () => {
        repo.insert({
          id: 'r-single',
          name: 'Single Char',
          enabled: 1,
          matchModelPattern: 'gpt-?o',
          regexPattern: 'hello',
          substitution: 'hey',
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.ruleResults[1].matched).toBe(true);

        const result2 = service.applyRules(messages, 'gpt-4-turbo', []);
        expect(result2.ruleResults[1].matched).toBe(false);
      });

      it('null pattern matches all models', () => {
        repo.insert({
          id: 'r-all-models',
          name: 'All Models',
          enabled: 1,
          matchModelPattern: null,
          regexPattern: 'world',
          substitution: 'earth',
          sortOrder: 2,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello world' }];
        const result = service.applyRules(messages, 'any-model', []);
        // r-gpt rule (matchModelPattern: 'gpt-*') does not match
        // 'any-model', so "hello" is not transformed
        expect(result.messages[0].content).toBe('hello earth');
      });
    });

    describe('content pattern matching', () => {
      beforeEach(() => {
        repo.insert({
          id: 'r-content',
          name: 'Content Match',
          enabled: 1,
          matchContentPattern: 'important',
          regexPattern: 'important',
          substitution: 'CRITICAL',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      });

      it('applies when content matches regex', () => {
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'this is important now' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('this is CRITICAL now');
        expect(result.ruleResults[0].matched).toBe(true);
        expect(result.ruleResults[0].applied).toBe(true);
      });

      it('skips when content does not match regex', () => {
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'nothing to see here' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('nothing to see here');
        expect(result.ruleResults[0].matched).toBe(false);
      });

      it('null content pattern matches all messages', () => {
        repo.insert({
          id: 'r-no-content',
          name: 'No Content Filter',
          enabled: 1,
          matchContentPattern: null,
          regexPattern: 'test',
          substitution: 'TEST',
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [
          { role: 'user', content: 'a test' },
          { role: 'user', content: 'no match word' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('a TEST');
        expect(result.messages[1].content).toBe('no match word');
      });
    });

    describe('tool presence matching', () => {
      beforeEach(() => {
        repo.insert({
          id: 'r-tools',
          name: 'Tools Rule',
          enabled: 1,
          matchToolPresent: '["memory","read_file"]',
          matchRole: 'system',
          regexPattern: 'instructions',
          substitution: 'DIRECTIONS',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      });

      it('applies when all required tools are present', () => {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'follow instructions carefully' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', ['memory', 'read_file', 'search']);
        expect(result.messages[0].content).toBe('follow DIRECTIONS carefully');
        expect(result.ruleResults[0].matched).toBe(true);
      });

      it('skips when any required tool is missing', () => {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'follow instructions carefully' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', ['memory']);
        expect(result.messages[0].content).toBe('follow instructions carefully');
        expect(result.ruleResults[0].matched).toBe(false);
      });

      it('skips when no tools are provided', () => {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'follow instructions carefully' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('follow instructions carefully');
        expect(result.ruleResults[0].matched).toBe(false);
      });

      it('null tool present matches regardless', () => {
        repo.insert({
          id: 'r-no-tool',
          name: 'No Tool Filter',
          enabled: 1,
          matchToolPresent: null,
          regexPattern: 'follow',
          substitution: 'obey',
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'system', content: 'follow instructions' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('obey instructions');
      });
    });

    describe('tool absence matching', () => {
      beforeEach(() => {
        repo.insert({
          id: 'r-absent',
          name: 'Absent Rule',
          enabled: 1,
          matchToolAbsent: '["memory","web_search"]',
          matchRole: 'system',
          regexPattern: 'instructions',
          substitution: 'DIRECTIONS',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      });

      it('applies when all listed tools are absent', () => {
        const messages: OpenAIMessage[] = [{ role: 'system', content: 'follow instructions' }];
        const result = service.applyRules(messages, 'gpt-4o', ['read_file']);
        expect(result.messages[0].content).toBe('follow DIRECTIONS');
        expect(result.ruleResults[0].matched).toBe(true);
      });

      it('skips when any listed tool is present', () => {
        const messages: OpenAIMessage[] = [{ role: 'system', content: 'follow instructions' }];
        const result = service.applyRules(messages, 'gpt-4o', ['memory']);
        expect(result.messages[0].content).toBe('follow instructions');
        expect(result.ruleResults[0].matched).toBe(false);
      });

      it('applies when tool list is empty (all absent)', () => {
        const messages: OpenAIMessage[] = [{ role: 'system', content: 'follow instructions' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('follow DIRECTIONS');
        expect(result.ruleResults[0].matched).toBe(true);
      });
    });

    describe('combined tool presence + absence', () => {
      beforeEach(() => {
        repo.insert({
          id: 'r-combined',
          name: 'Combined Rule',
          enabled: 1,
          matchToolPresent: '["read_file"]',
          matchToolAbsent: '["memory"]',
          regexPattern: 'hello',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      });

      it('applies when present tools are there and absent tools are not', () => {
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'gpt-4o', ['read_file']);
        expect(result.messages[0].content).toBe('hi');
        expect(result.ruleResults[0].matched).toBe(true);
      });

      it('skips when present tool is missing', () => {
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hello');
        expect(result.ruleResults[0].matched).toBe(false);
      });

      it('skips when absent tool is present', () => {
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'gpt-4o', ['read_file', 'memory']);
        expect(result.messages[0].content).toBe('hello');
        expect(result.ruleResults[0].matched).toBe(false);
      });
    });

    describe('first assistant message boundary', () => {
      beforeEach(() => {
        repo.insert({
          id: 'r-all',
          name: 'Transform All',
          enabled: 1,
          regexPattern: 'hello',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      });

      it('stops transforming after first assistant message', () => {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'hello' },
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hello' },
          { role: 'user', content: 'hello' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi');
        expect(result.messages[1].content).toBe('hi');
        expect(result.messages[2].content).toBe('hello');
        expect(result.messages[3].content).toBe('hello');
      });

      it('processes all messages when no assistant present', () => {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'hello' },
          { role: 'user', content: 'hello' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi');
        expect(result.messages[1].content).toBe('hi');
      });

      it('processes messages before first assistant, not between assistants', () => {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'hello' },
          { role: 'assistant', content: 'ignored' },
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'ignored' },
          { role: 'user', content: 'hello' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi');
        expect(result.messages[1].content).toBe('ignored');
        expect(result.messages[2].content).toBe('hello');
        expect(result.messages[3].content).toBe('ignored');
        expect(result.messages[4].content).toBe('hello');
      });
    });

    describe('sequential rule application', () => {
      it('output of rule 1 is input to rule 2', () => {
        repo.insert({
          id: 'r1',
          name: 'Hello to Hi',
          enabled: 1,
          regexPattern: 'Hello',
          substitution: 'Hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        repo.insert({
          id: 'r2',
          name: 'Hi to Hey',
          enabled: 1,
          regexPattern: 'Hi',
          substitution: 'Hey',
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        repo.insert({
          id: 'r3',
          name: 'Hey to Yo',
          enabled: 1,
          regexPattern: 'Hey',
          substitution: 'Yo',
          sortOrder: 2,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });

        const messages: OpenAIMessage[] = [{ role: 'user', content: 'Hello world' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('Yo world');
        expect(result.ruleResults.every((r) => r.matched)).toBe(true);
        expect(result.ruleResults.every((r) => r.applied)).toBe(true);
      });
    });

    describe('regex flags', () => {
      it('g flag replaces all occurrences', () => {
        repo.insert({
          id: 'r-global',
          name: 'Global',
          enabled: 1,
          regexPattern: 'cat',
          regexFlags: 'g',
          substitution: 'dog',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'cat cat cat' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('dog dog dog');
      });

      it('i flag makes matching case-insensitive', () => {
        repo.insert({
          id: 'r-case',
          name: 'Case Insensitive',
          enabled: 1,
          regexPattern: 'hello',
          regexFlags: 'i',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'HELLO Hello hello' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi Hello hello');
      });

      it('gi flags replace all case-insensitive matches', () => {
        repo.insert({
          id: 'r-gi',
          name: 'Global Case',
          enabled: 1,
          regexPattern: 'hello',
          regexFlags: 'gi',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'HELLO Hello hello' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi hi hi');
      });

      it('m flag makes ^ and $ match line boundaries', () => {
        repo.insert({
          id: 'r-multiline',
          name: 'Multiline',
          enabled: 1,
          regexPattern: '^test',
          regexFlags: 'gm',
          substitution: 'TEST',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [
          { role: 'user', content: 'not test\ntest line\nanother test' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('not test\nTEST line\nanother test');
      });

      it('s flag makes . match newlines', () => {
        repo.insert({
          id: 'r-dotall',
          name: 'DotAll',
          enabled: 1,
          regexPattern: 'start.+end',
          regexFlags: 'gs',
          substitution: 'DONE',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'start\nmiddle\nend' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('DONE');
      });

      it('flags apply to both matchContentPattern and regex replace', () => {
        repo.insert({
          id: 'r-flags',
          name: 'Flags Both',
          enabled: 1,
          matchContentPattern: 'hello',
          regexPattern: 'hello',
          regexFlags: 'i',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'HELLO' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi');
      });
    });

    describe('capture group substitution', () => {
      it('substitutes $1, $2 capture groups', () => {
        repo.insert({
          id: 'r-capture',
          name: 'Capture Groups',
          enabled: 1,
          regexPattern: '(\\w+) (\\w+)',
          substitution: '$2 $1',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello world' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('world hello');
      });

      it('non-existent capture group stays as literal', () => {
        repo.insert({
          id: 'r-bad-capture',
          name: 'Bad Capture',
          enabled: 1,
          regexPattern: '(\\w+)',
          substitution: '[$1][$5]',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('[hello][$5]');
      });

      it('$& substitutes the entire match', () => {
        repo.insert({
          id: 'r-ampersand',
          name: 'Ampersand',
          enabled: 1,
          regexPattern: '\\w+',
          substitution: '[$&]',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('[hello]');
      });
    });

    describe('invalid regex graceful handling', () => {
      it('skips rule and logs warning for invalid regexPattern', () => {
        repo.insert({
          id: 'r-bad',
          name: 'Bad Regex',
          enabled: 1,
          regexPattern: '[open',
          substitution: 'fixed',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: '[open bracket' }];
        const logger = createMockLogger();
        const svc = new ContentRulesService(repo, logger);
        const result = svc.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('[open bracket');
        expect(result.ruleResults[0].errored).toBe(true);
        // matched=true because criteria passed before the regex error
        expect(result.ruleResults[0].matched).toBe(true);
        expect(result.ruleResults[0].applied).toBe(false);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Bad Regex'));
      });

      it('continues processing subsequent rules after an error', () => {
        repo.insert({
          id: 'r-bad',
          name: 'Bad Regex',
          enabled: 1,
          regexPattern: '[open',
          substitution: 'nope',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        repo.insert({
          id: 'r-good',
          name: 'Good Regex',
          enabled: 1,
          regexPattern: 'hello',
          substitution: 'hi',
          sortOrder: 1,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi');
        expect(result.ruleResults[0].errored).toBe(true);
        expect(result.ruleResults[1].applied).toBe(true);
      });

      it('handles invalid matchContentPattern gracefully', () => {
        repo.insert({
          id: 'r-bad-match',
          name: 'Bad Match Pattern',
          enabled: 1,
          matchContentPattern: '[open',
          regexPattern: 'hello',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hello');
        expect(result.ruleResults[0].matched).toBe(false);
      });
    });

    describe('string content only guard', () => {
      beforeEach(() => {
        repo.insert({
          id: 'r-all',
          name: 'Transform All',
          enabled: 1,
          regexPattern: 'hello',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      });

      it('skips message with array content (image + text)', () => {
        const messages: OpenAIMessage[] = [
          { role: 'system', content: 'hello system' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'hello user' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
            ],
          },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toBe('hi system');
        expect(result.messages[1].content).toEqual([
          { type: 'text', text: 'hello user' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
        ]);
      });

      it('still transforms string content messages when array ones exist', () => {
        const messages: OpenAIMessage[] = [
          {
            role: 'user',
            content: [{ type: 'text', text: 'hello image' }],
          },
          { role: 'user', content: 'hello text' },
        ];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.messages[0].content).toEqual([{ type: 'text', text: 'hello image' }]);
        expect(result.messages[1].content).toBe('hi text');
      });
    });

    describe('rule results metadata', () => {
      it('matched is true when criteria passed but replace did not change content', () => {
        repo.insert({
          id: 'r-no-change',
          name: 'No Change',
          enabled: 1,
          regexPattern: 'xyz',
          substitution: 'abc',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello world' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.ruleResults[0].matched).toBe(true);
        expect(result.ruleResults[0].applied).toBe(false);
        expect(result.ruleResults[0].errored).toBe(false);
      });

      it('matched is false when criteria did not pass', () => {
        repo.insert({
          id: 'r-filtered',
          name: 'Filtered',
          enabled: 1,
          matchRole: 'system',
          regexPattern: 'hello',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.ruleResults[0].matched).toBe(false);
        expect(result.ruleResults[0].applied).toBe(false);
        expect(result.ruleResults[0].errored).toBe(false);
      });

      it('all flags can be true simultaneously', () => {
        repo.insert({
          id: 'r-good',
          name: 'Good Rule',
          enabled: 1,
          regexPattern: 'hello',
          substitution: 'hi',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        });
        const messages: OpenAIMessage[] = [{ role: 'user', content: 'hello world' }];
        const result = service.applyRules(messages, 'gpt-4o', []);
        expect(result.ruleResults[0].matched).toBe(true);
        expect(result.ruleResults[0].applied).toBe(true);
        expect(result.ruleResults[0].errored).toBe(false);
      });
    });
  });

  describe('CRUD delegation', () => {
    it('getAll returns all rules from repository', () => {
      repo.insert({
        id: 'r1',
        name: 'Rule 1',
        enabled: 1,
        regexPattern: 'a',
        substitution: 'b',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      const rules = service.getAll();
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe('Rule 1');
    });

    it('getById returns rule or undefined', () => {
      repo.insert({
        id: 'r1',
        name: 'Rule 1',
        enabled: 1,
        regexPattern: 'a',
        substitution: 'b',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(service.getById('r1')?.name).toBe('Rule 1');
      expect(service.getById('nonexistent')).toBeUndefined();
    });

    it('create inserts a rule via repository', () => {
      const rule = service.create({
        name: 'New Rule',
        enabled: 1,
        regexPattern: 'test',
        substitution: 'TEST',
      });
      expect(rule.name).toBe('New Rule');
      expect(rule.regexPattern).toBe('test');
      expect(rule.substitution).toBe('TEST');
      // Server-generated fields are computed
      expect(rule.id).toBeDefined();
      expect(rule.sortOrder).toBe(0);
      expect(rule.createdAt).toBeDefined();
      expect(rule.updatedAt).toBeDefined();
      expect(repo.findById(rule.id)).toBeDefined();
    });

    it('update modifies a rule via repository', () => {
      repo.insert({
        id: 'r1',
        name: 'Rule 1',
        enabled: 1,
        regexPattern: 'a',
        substitution: 'b',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      const updated = service.update('r1', { name: 'Updated Rule' });
      expect(updated?.name).toBe('Updated Rule');
      expect(repo.findById('r1')?.name).toBe('Updated Rule');
    });

    it('update returns undefined for non-existent rule', () => {
      const result = service.update('nonexistent', { name: 'Nope' });
      expect(result).toBeUndefined();
    });

    it('delete removes a rule via repository', () => {
      repo.insert({
        id: 'r1',
        name: 'Rule 1',
        enabled: 1,
        regexPattern: 'a',
        substitution: 'b',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(service.delete('r1')).toBe(true);
      expect(repo.findById('r1')).toBeUndefined();
    });

    it('delete returns false for non-existent rule', () => {
      expect(service.delete('nonexistent')).toBe(false);
    });

    it('reorder delegates to repository', () => {
      repo.insert({
        id: 'r1',
        name: 'A',
        enabled: 1,
        regexPattern: 'a',
        substitution: 'b',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      repo.insert({
        id: 'r2',
        name: 'B',
        enabled: 1,
        regexPattern: 'c',
        substitution: 'd',
        sortOrder: 1,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      service.reorder(['r2', 'r1']);
      const rules = repo.findAll();
      expect(rules[0].id).toBe('r2');
      expect(rules[1].id).toBe('r1');
    });

    it('validateName checks uniqueness via repository', () => {
      repo.insert({
        id: 'r1',
        name: 'Unique',
        enabled: 1,
        regexPattern: 'a',
        substitution: 'b',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      });
      expect(service.validateName('Unique')).toBe(true);
      expect(service.validateName('New Name')).toBe(false);
      expect(service.validateName('Unique', 'r1')).toBe(false);
    });
  });
});
