import { describe, it, expect } from 'vitest';
import type * as vscode from 'vscode';
import { mockMessage } from '../../test/chat-handler-test-helpers.js';
import { mapRole, translateMessages } from './translate-messages.js';

describe('translateMessages', () => {
  // -----------------------------------------------------------------------
  // mapRole
  // -----------------------------------------------------------------------

  describe('mapRole', () => {
    it('maps User to user', () => {
      expect(mapRole(1 as vscode.LanguageModelChatMessageRole)).toBe('user');
    });

    it('maps Assistant to assistant', () => {
      expect(mapRole(2 as vscode.LanguageModelChatMessageRole)).toBe('assistant');
    });

    it('maps System to system', () => {
      expect(mapRole(3 as vscode.LanguageModelChatMessageRole)).toBe('system');
    });

    it('defaults unknown roles to user', () => {
      expect(mapRole(99 as vscode.LanguageModelChatMessageRole)).toBe('user');
    });
  });

  // -----------------------------------------------------------------------
  // translateMessages
  // -----------------------------------------------------------------------

  describe('translateMessages', () => {
    it('translates User role to user', async () => {
      const vscodeModule = await import('vscode');
      const part = new vscodeModule.LanguageModelTextPart('Hello');
      const messages = [mockMessage(1, [part as unknown as Record<string, unknown>])];
      const result = translateMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('translates Assistant role to assistant', async () => {
      const vscodeModule = await import('vscode');
      const part = new vscodeModule.LanguageModelTextPart('Hi there');
      const messages = [mockMessage(2, [part as unknown as Record<string, unknown>])];
      const result = translateMessages(messages);
      expect(result).toEqual([{ role: 'assistant', content: 'Hi there' }]);
    });

    it('translates System role to system', async () => {
      const vscodeModule = await import('vscode');
      const part = new vscodeModule.LanguageModelTextPart('You are a helpful assistant');
      const messages = [mockMessage(3, [part as unknown as Record<string, unknown>])];
      const result = translateMessages(messages);
      expect(result).toEqual([{ role: 'system', content: 'You are a helpful assistant' }]);
    });

    it('concatenates multiple text parts', async () => {
      const vscodeModule = await import('vscode');
      const p1 = new vscodeModule.LanguageModelTextPart('Part 1');
      const p2 = new vscodeModule.LanguageModelTextPart(' Part 2');
      const messages = [
        mockMessage(1, [
          p1 as unknown as Record<string, unknown>,
          p2 as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'Part 1 Part 2' }]);
    });

    it('skips non-text parts', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('text');
      const messages = [
        mockMessage(1, [
          textPart as unknown as Record<string, unknown>,
          { toolCallId: '123', result: {} },
        ]),
      ];
      const result = translateMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'text' }]);
    });

    it('translates assistant message with tool calls', async () => {
      const vscodeModule = await import('vscode');
      const toolCallPart = new vscodeModule.LanguageModelToolCallPart('call_1', 'get_weather', {
        city: 'London',
      });
      const messages = [mockMessage(2, [toolCallPart as unknown as Record<string, unknown>])];
      const result = translateMessages(messages);
      expect(result).toEqual([
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"city":"London"}',
              },
            },
          ],
        },
      ]);
    });

    it('translates assistant message with text and tool calls', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Let me check the weather.');
      const toolCallPart = new vscodeModule.LanguageModelToolCallPart('call_1', 'get_weather', {
        city: 'London',
      });
      const messages = [
        mockMessage(2, [
          textPart as unknown as Record<string, unknown>,
          toolCallPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      expect(result).toEqual([
        {
          role: 'assistant',
          content: 'Let me check the weather.',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"city":"London"}',
              },
            },
          ],
        },
      ]);
    });

    it('translates tool result messages', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Sunny, 22°C');
      const toolResultPart = new vscodeModule.LanguageModelToolResultPart('call_1', [textPart]);
      const messages = [mockMessage(1, [toolResultPart as unknown as Record<string, unknown>])];
      const result = translateMessages(messages);
      expect(result).toEqual([
        {
          role: 'tool',
          content: 'Sunny, 22°C',
          tool_call_id: 'call_1',
        },
      ]);
    });

    it('translates user message with only an image', async () => {
      const vscodeModule = await import('vscode');
      const imgData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const imgPart = new vscodeModule.LanguageModelDataPart(imgData, 'image/png');
      const messages = [mockMessage(1, [imgPart as unknown as Record<string, unknown>])];
      const result = translateMessages(messages);
      const expectedUrl = `data:image/png;base64,${Buffer.from(imgData).toString('base64')}`;
      expect(result).toEqual([
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: expectedUrl } }],
        },
      ]);
    });

    it('translates user message with text then image', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Describe this');
      const imgData = new Uint8Array([0x89, 0x50]);
      const imgPart = new vscodeModule.LanguageModelDataPart(imgData, 'image/png');
      const messages = [
        mockMessage(1, [
          textPart as unknown as Record<string, unknown>,
          imgPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      const expectedUrl = `data:image/png;base64,${Buffer.from(imgData).toString('base64')}`;
      expect(result).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            { type: 'image_url', image_url: { url: expectedUrl } },
          ],
        },
      ]);
    });

    it('translates user message with image then text', async () => {
      const vscodeModule = await import('vscode');
      const imgData = new Uint8Array([0xff, 0xd8]);
      const imgPart = new vscodeModule.LanguageModelDataPart(imgData, 'image/jpeg');
      const textPart = new vscodeModule.LanguageModelTextPart('Look at this');
      const messages = [
        mockMessage(1, [
          imgPart as unknown as Record<string, unknown>,
          textPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      const expectedUrl = `data:image/jpeg;base64,${Buffer.from(imgData).toString('base64')}`;
      expect(result).toEqual([
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: expectedUrl } },
            { type: 'text', text: 'Look at this' },
          ],
        },
      ]);
    });

    it('translates user message with multiple images', async () => {
      const vscodeModule = await import('vscode');
      const img1 = new Uint8Array([0x89, 0x50]);
      const img2 = new Uint8Array([0xff, 0xd8]);
      const imgPart1 = new vscodeModule.LanguageModelDataPart(img1, 'image/png');
      const imgPart2 = new vscodeModule.LanguageModelDataPart(img2, 'image/jpeg');
      const messages = [
        mockMessage(1, [
          imgPart1 as unknown as Record<string, unknown>,
          imgPart2 as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      expect(result).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${Buffer.from(img1).toString('base64')}` },
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${Buffer.from(img2).toString('base64')}`,
              },
            },
          ],
        },
      ]);
    });

    it('keeps plain string content when no images are present', async () => {
      const vscodeModule = await import('vscode');
      const part = new vscodeModule.LanguageModelTextPart('Hello');
      const messages = [mockMessage(1, [part as unknown as Record<string, unknown>])];
      const result = translateMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('ignores non-image data parts', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('text');
      const pdfPart = new vscodeModule.LanguageModelDataPart(
        new Uint8Array([0x25, 0x50]),
        'application/pdf',
      );
      const messages = [
        mockMessage(1, [
          textPart as unknown as Record<string, unknown>,
          pdfPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'text' }]);
    });

    it('translates tool result with image data part', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('result');
      const imgData = new Uint8Array([0x89, 0x50]);
      const imgPart = new vscodeModule.LanguageModelDataPart(imgData, 'image/png');
      const toolResultPart = new vscodeModule.LanguageModelToolResultPart('call_1', [
        textPart,
        imgPart,
      ]);
      const messages = [mockMessage(1, [toolResultPart as unknown as Record<string, unknown>])];
      const result = translateMessages(messages);
      const expectedUrl = `data:image/png;base64,${Buffer.from(imgData).toString('base64')}`;
      expect(result).toEqual([
        {
          role: 'tool',
          content: JSON.stringify([
            { type: 'text', text: 'result' },
            { type: 'image_url', image_url: { url: expectedUrl } },
          ]),
          tool_call_id: 'call_1',
        },
      ]);
    });

    it('extracts reasoning from thinking parts with presentFields', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Here is my answer.');
      const thinkingPart = new vscodeModule.LanguageModelThinkingPart(
        'Internal reasoning...',
        undefined,
        { presentFields: ['reasoning_content'] },
      );
      const messages = [
        mockMessage(2, [
          thinkingPart as unknown as Record<string, unknown>,
          textPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      expect(result).toEqual([
        {
          role: 'assistant',
          content: 'Here is my answer.',
          reasoning_content: 'Internal reasoning...',
        },
      ]);
    });

    it('extracts multiple presentFields from thinking parts', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Answer');
      const thinkingPart = new vscodeModule.LanguageModelThinkingPart(
        'Chain of thought',
        undefined,
        { presentFields: ['reasoning', 'reasoning_details'] },
      );
      const messages = [
        mockMessage(2, [
          thinkingPart as unknown as Record<string, unknown>,
          textPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      expect(result[0].reasoning).toBe('Chain of thought');
      expect(result[0].reasoning_details).toEqual([{ type: 'text', text: 'Chain of thought' }]);
      expect(result[0].reasoning_content).toBeUndefined();
    });

    it('populates all three fields when no presentFields metadata', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Answer');
      const thinkingPart = new vscodeModule.LanguageModelThinkingPart('Backward compat reasoning');
      const messages = [
        mockMessage(2, [
          thinkingPart as unknown as Record<string, unknown>,
          textPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      expect(result[0].reasoning_content).toBe('Backward compat reasoning');
      expect(result[0].reasoning).toBe('Backward compat reasoning');
      expect(result[0].reasoning_details).toEqual([
        { type: 'text', text: 'Backward compat reasoning' },
      ]);
    });

    it('no thinking parts -> no reasoning fields', async () => {
      const vscodeModule = await import('vscode');
      const textPart = new vscodeModule.LanguageModelTextPart('Just text');
      const messages = [mockMessage(2, [textPart as unknown as Record<string, unknown>])];
      const result = translateMessages(messages);
      expect(result[0].reasoning_content).toBeUndefined();
      expect(result[0].reasoning).toBeUndefined();
      expect(result[0].reasoning_details).toBeUndefined();
    });

    it('mixed text + thinking parts on assistant message', async () => {
      const vscodeModule = await import('vscode');
      const textPart1 = new vscodeModule.LanguageModelTextPart('Part 1. ');
      const thinkingPart = new vscodeModule.LanguageModelThinkingPart('Thinking...', undefined, {
        presentFields: ['reasoning_content'],
      });
      const textPart2 = new vscodeModule.LanguageModelTextPart('Part 2.');
      const messages = [
        mockMessage(2, [
          textPart1 as unknown as Record<string, unknown>,
          thinkingPart as unknown as Record<string, unknown>,
          textPart2 as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      expect(result[0].content).toBe('Part 1. Part 2.');
      expect(result[0].reasoning_content).toBe('Thinking...');
    });

    it('thinking parts on non-assistant message are ignored', async () => {
      const vscodeModule = await import('vscode');
      const thinkingPart = new vscodeModule.LanguageModelThinkingPart('User thinking');
      const textPart = new vscodeModule.LanguageModelTextPart('User message');
      const messages = [
        mockMessage(1, [
          thinkingPart as unknown as Record<string, unknown>,
          textPart as unknown as Record<string, unknown>,
        ]),
      ];
      const result = translateMessages(messages);
      expect(result[0].role).toBe('user');
      expect(result[0].reasoning_content).toBeUndefined();
    });
  });
});
