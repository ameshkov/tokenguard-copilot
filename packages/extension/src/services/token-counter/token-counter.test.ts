import { describe, it, expect, vi, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import type * as vscode from 'vscode';

// Mock vscode
vi.mock('vscode', () => ({
  LanguageModelTextPart: class {
    constructor(public value: string) {}
  },
  LanguageModelToolCallPart: class {
    constructor(
      public callId: string,
      public name: string,
      public input: Record<string, unknown>,
    ) {}
  },
  LanguageModelToolResultPart: class {
    constructor(
      public callId: string,
      public content: unknown[],
    ) {}
  },
  LanguageModelDataPart: class {
    constructor(
      public data: Uint8Array,
      public mimeType: string,
    ) {}
  },
  LanguageModelChatMessageRole: { User: 1, Assistant: 2 },
  LanguageModelThinkingPart: class {
    constructor(
      public value: string | string[],
      public id?: string,
    ) {}
  },
  Uri: {
    file: (p: string) => ({ fsPath: p }),
    joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
      fsPath: `${base.fsPath}/${parts.join('/')}`,
    }),
  },
}));

import { TokenCounter } from './token-counter.js';

/**
 * Resolve the project root from the test runner's working
 * directory.
 *
 * When vitest runs from `packages/extension/`, the project
 * root is two levels up.
 */
const projectRoot = resolve(process.cwd(), '../..');

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeAll(async () => {
    counter = new TokenCounter(projectRoot);
    await counter.initialize();
  });

  it('returns 0 for empty string', async () => {
    const result = await counter.countTokens('');
    expect(result).toBe(0);
  });

  it('counts tokens for plain text', async () => {
    const result = await counter.countTokens('Hello world');
    // "Hello world" encodes to 2 tokens with o200k_base
    expect(result).toBe(2);
  });

  it('returns 0 when tokenizer not initialized', async () => {
    const uninitialized = new TokenCounter(projectRoot);
    const result = await uninitialized.countTokens('Hello');
    // Should not throw, returns 0
    expect(result).toBe(0);
  });

  it('counts tokens for a message with text parts', async () => {
    const vscodeModule = await import('vscode');
    const msg = {
      role: 1,
      content: [new vscodeModule.LanguageModelTextPart('Hello world')],
    } as unknown as vscode.LanguageModelChatRequestMessage;
    // Base tokens (3+1) + 2 word tokens = 6
    const result = await counter.countMessageTokens(msg);
    expect(result).toBe(6);
  });

  it('includes tool call tokens in count', async () => {
    const vscodeModule = await import('vscode');
    const msg = {
      role: 2,
      content: [
        new vscodeModule.LanguageModelToolCallPart('call_1', 'get_weather', {
          city: 'London',
        }),
      ],
    } as unknown as vscode.LanguageModelChatRequestMessage;
    const result = await counter.countMessageTokens(msg);
    // Base tokens (3+1) + name tokens (1) + tool call JSON tokens
    expect(result).toBeGreaterThan(0);
  });

  it('counts tokens for longer text', async () => {
    const result = await counter.countTokens('The quick brown fox jumps over the lazy dog');
    // 9 words, should encode to more than 8 tokens with o200k_base
    expect(result).toBeGreaterThan(8);
  });

  it('counts tokens for a message with no text parts', async () => {
    const msg = {
      role: 1,
      content: [],
    } as unknown as vscode.LanguageModelChatRequestMessage;
    // Only base tokens (3+1)
    const result = await counter.countMessageTokens(msg);
    expect(result).toBe(4);
  });
});
