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
import { createMockLogger } from '../../test/mock-logger.js';
import { ContentRulesRepository } from '../../repositories/index.js';
import { ContentRulesService } from './content-rules-service.js';
import type { Database } from '../../db/index.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OpenAIMessage } from '../chat-handler/index.js';

describe('ContentRulesService (substitution)', () => {
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
});
