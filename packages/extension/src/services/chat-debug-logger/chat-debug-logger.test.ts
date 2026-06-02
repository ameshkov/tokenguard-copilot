import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ChatDebugLogger, type LogRequestInput } from './chat-debug-logger.js';
import type { ChatDebugSettingsService } from '../chat-debug-settings/index.js';
import type { SessionTracker } from '../session-tracker/index.js';
import { createMockLogger } from '../../test/mock-logger.js';

const baseInput: LogRequestInput = {
  requestId: 'test-request-id',
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' },
  ],
  responseContent: 'Hi there!',
  responseToolCalls: [],
  responseReasoning: null,
  modelName: 'my-provider/test-model',
  modelOptions: { reasoningEffort: 'high' },
  tools: undefined,
  startTime: new Date('2026-05-20T10:00:00.000Z'),
  endTime: new Date('2026-05-20T10:00:02.500Z'),
  cancelled: false,
  error: undefined,
  workspaceFolderUri: 'file:///home/user/project',
  workspaceFolders: ['/home/user/project'],
};

describe('ChatDebugLogger', () => {
  describe('computeWorkspaceId', () => {
    it('returns a 16-character hex string', () => {
      const id = ChatDebugLogger.computeWorkspaceId('file:///home/user/project');
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('returns the same hash for the same URI', () => {
      const uri = 'file:///home/user/project';
      const id1 = ChatDebugLogger.computeWorkspaceId(uri);
      const id2 = ChatDebugLogger.computeWorkspaceId(uri);
      expect(id1).toBe(id2);
    });

    it('returns different hashes for different URIs', () => {
      const id1 = ChatDebugLogger.computeWorkspaceId('file:///home/user/project-a');
      const id2 = ChatDebugLogger.computeWorkspaceId('file:///home/user/project-b');
      expect(id1).not.toBe(id2);
    });
  });

  describe('formatTimestamp', () => {
    it('returns a filesystem-safe timestamp string', () => {
      const ts = ChatDebugLogger.formatTimestamp(new Date('2026-05-20T17:37:46.266Z'));
      expect(ts).toBe('20260520-173746-266');
    });

    it('pads single-digit values with zeros', () => {
      const ts = ChatDebugLogger.formatTimestamp(new Date('2026-01-02T03:04:05.006Z'));
      expect(ts).toBe('20260102-030405-006');
    });
  });

  describe('formatLogMarkdown', () => {
    it('includes metadata section with model and timing', () => {
      const md = ChatDebugLogger.formatLogMarkdown(baseInput, 'test-request-id');
      expect(md).toContain('## Metadata');
      expect(md).toContain('requestId     : test-request-id');
      expect(md).toContain('my-provider/test-model');
      expect(md).toContain('2500ms');
      expect(md).toContain('cancelled     : false');
    });

    it('includes messages with role headers', () => {
      const md = ChatDebugLogger.formatLogMarkdown(baseInput, 'test-request-id');
      expect(md).toContain('### Message 1 (System)');
      expect(md).toContain('You are helpful.');
      expect(md).toContain('### Message 2 (User)');
      expect(md).toContain('Hello');
    });

    it('includes response section', () => {
      const md = ChatDebugLogger.formatLogMarkdown(baseInput, 'test-request-id');
      expect(md).toContain('## Response');
      expect(md).toContain('Hi there!');
    });

    it('includes tool definitions in metadata when present', () => {
      const input: LogRequestInput = {
        ...baseInput,
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Read file contents.',
            },
          },
        ],
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('toolCount     : 1');
      expect(md).toContain('read_file');
    });

    it('includes toolMode=auto in metadata when tools present and toolMode is auto', () => {
      const input: LogRequestInput = {
        ...baseInput,
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Read file contents.',
            },
          },
        ],
        toolMode: 'auto',
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('toolMode      : auto');
    });

    it('includes toolMode=required in metadata when toolMode is required', () => {
      const input: LogRequestInput = {
        ...baseInput,
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Read file contents.',
            },
          },
        ],
        toolMode: 'required',
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('toolMode      : required');
    });

    it('defaults toolMode to auto when not provided', () => {
      const input: LogRequestInput = {
        ...baseInput,
        tools: [
          {
            type: 'function',
            function: {
              name: 'read_file',
              description: 'Read file contents.',
            },
          },
        ],
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('toolMode      : auto');
    });

    it('shows error in response section when request failed', () => {
      const input: LogRequestInput = {
        ...baseInput,
        responseContent: '',
        error: '500 Internal Server Error',
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('## Response');
      expect(md).toContain('500 Internal Server Error');
    });

    it('shows cancellation in response section', () => {
      const input: LogRequestInput = {
        ...baseInput,
        cancelled: true,
        responseContent: 'Partial response',
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('cancelled     : true');
      expect(md).toContain('Partial response');
    });

    it('formats tool call messages correctly', () => {
      const input: LogRequestInput = {
        ...baseInput,
        messages: [
          { role: 'user', content: 'Fix the bug' },
          {
            role: 'assistant',
            content: 'Let me read the file.',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'read_file',
                  arguments: '{"path":"test.ts"}',
                },
              },
            ],
          },
          {
            role: 'tool',
            content: 'file contents here',
            tool_call_id: 'call_1',
          },
        ],
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('### Message 2 (Assistant)');
      expect(md).toContain('read_file');
      expect(md).toContain('### Message 3 (Tool Result)');
    });

    it('includes model options in metadata', () => {
      const md = ChatDebugLogger.formatLogMarkdown(baseInput, 'test-request-id');
      expect(md).toContain('"reasoningEffort":"high"');
    });

    it('does not include API keys or auth headers', () => {
      const input: LogRequestInput = {
        ...baseInput,
        modelOptions: {
          reasoningEffort: 'high',
          apiKey: 'sk-secret-key',
          authorization: 'Bearer sk-secret',
        },
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).not.toContain('sk-secret-key');
      expect(md).not.toContain('Bearer sk-secret');
    });

    it('renders reasoning_content in messages section', () => {
      const input: LogRequestInput = {
        ...baseInput,
        messages: [
          { role: 'user', content: 'Think step by step' },
          {
            role: 'assistant',
            content: 'The answer is 42.',
            reasoning_content: 'First, I need to compute the answer...',
          },
        ],
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('🧠 Reasoning');
      expect(md).toContain('First, I need to compute the answer...');
    });

    it('renders reasoning (Anthropic plaintext) in messages section', () => {
      const input: LogRequestInput = {
        ...baseInput,
        messages: [
          { role: 'user', content: 'Explain quantum' },
          {
            role: 'assistant',
            content: 'Here is my explanation.',
            reasoning: 'I think about quantum mechanics...',
          },
        ],
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('🧠 Reasoning');
      expect(md).toContain('I think about quantum mechanics...');
    });

    it('renders reasoning_details in messages section', () => {
      const input: LogRequestInput = {
        ...baseInput,
        messages: [
          { role: 'user', content: 'Complex question' },
          {
            role: 'assistant',
            content: 'Final answer.',
            reasoning_details: [
              { type: 'text', text: 'Step 1: Analyze\n' },
              { type: 'text', text: 'Step 2: Compute' },
            ],
          },
        ],
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('🧠 Reasoning');
      expect(md).toContain('Step 1: Analyze');
      expect(md).toContain('Step 2: Compute');
    });

    it('renders responseReasoning in response section', () => {
      const input: LogRequestInput = {
        ...baseInput,
        responseReasoning: 'Let me reason about this problem...',
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('### Reasoning');
      expect(md).toContain('Let me reason about this problem...');
    });

    it('omits response reasoning section when responseReasoning is null', () => {
      const md = ChatDebugLogger.formatLogMarkdown(baseInput, 'test-request-id');
      expect(md).not.toContain('### Reasoning');
    });

    it('omits response reasoning section when responseReasoning is undefined', () => {
      const input: LogRequestInput = {
        ...baseInput,
        responseReasoning: undefined,
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).not.toContain('### Reasoning');
    });

    it('omits message reasoning when no reasoning fields are present', () => {
      const md = ChatDebugLogger.formatLogMarkdown(baseInput, 'test-request-id');
      expect(md).not.toContain('🧠 Reasoning');
    });

    it('renders usage details with all fields populated', () => {
      const input: LogRequestInput = {
        ...baseInput,
        usage: {
          promptTokens: 150,
          completionTokens: 42,
          cachedTokens: 10,
          reasoningTokens: 8,
        },
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain(
        'usage: prompt 150 | completion 42 | total 192 | cached 10 | reasoning 8',
      );
      expect(md).toContain('"promptTokens": 150');
      expect(md).toContain('"completionTokens": 42');
      expect(md).toContain('"totalTokens": 192');
      expect(md).toContain('"cachedTokens": 10');
      expect(md).toContain('"reasoningTokens": 8');
    });

    it('renders usage summary without cached/reasoning labels when those are zero', () => {
      const input: LogRequestInput = {
        ...baseInput,
        usage: {
          promptTokens: 100,
          completionTokens: 20,
          cachedTokens: 0,
          reasoningTokens: 0,
        },
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      // Summary line omits cached/reasoning when zero
      expect(md).toContain('usage: prompt 100 | completion 20 | total 120');
      expect(md).not.toContain('| cached 0');
      expect(md).not.toContain('| reasoning 0');
      // JSON block still contains the fields
      expect(md).toContain('"cachedTokens": 0');
      expect(md).toContain('"reasoningTokens": 0');
    });

    it('omits usage section when usage is null', () => {
      const input: LogRequestInput = {
        ...baseInput,
        usage: null,
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).not.toContain('usage:');
    });

    it('omits usage section when usage is undefined', () => {
      const md = ChatDebugLogger.formatLogMarkdown(baseInput, 'test-request-id');
      expect(md).not.toContain('usage:');
    });

    it('includes contentRules in metadata when present', () => {
      const input: LogRequestInput = {
        ...baseInput,
        contentRules: [
          { ruleId: 'r1', ruleName: 'Strip skills', matched: true, applied: true, errored: false },
          { ruleId: 'r2', ruleName: 'Add prefix', matched: false, applied: false, errored: false },
        ],
      };

      const result = ChatDebugLogger.formatLogMarkdown(input, 'test-uuid');
      expect(result).toContain('contentRules');
      expect(result).toContain('Strip skills');
      expect(result).toContain('Add prefix');
    });

    it('omits contentRules when undefined', () => {
      const input: LogRequestInput = {
        ...baseInput,
        // contentRules intentionally omitted
      };
      const result = ChatDebugLogger.formatLogMarkdown(input, 'test-uuid');
      expect(result).not.toContain('contentRules');
    });

    it('renders empty contentRules array', () => {
      const input: LogRequestInput = {
        ...baseInput,
        contentRules: [],
      };
      const result = ChatDebugLogger.formatLogMarkdown(input, 'test-uuid');
      expect(result).toContain('contentRules');
    });

    it('renders image part placeholder for data-URI images', () => {
      const input: LogRequestInput = {
        ...baseInput,
        messages: [
          { role: 'user', content: 'What is in this image?' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Check this image:' },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
                },
              },
            ],
          },
        ],
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('🖼️');
      expect(md).toContain('image/png');
    });

    it('renders image part placeholder for external URLs', () => {
      const input: LogRequestInput = {
        ...baseInput,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this photo:' },
              {
                type: 'image_url',
                image_url: { url: 'https://example.com/photo.jpg' },
              },
            ],
          },
        ],
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('🖼️');
      expect(md).toContain('external URL');
    });

    it('renders multiple image parts separately', () => {
      const input: LogRequestInput = {
        ...baseInput,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAA=' },
              },
              {
                type: 'image_url',
                image_url: { url: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA=' },
              },
            ],
          },
        ],
      };
      const md = ChatDebugLogger.formatLogMarkdown(input, 'test-request-id');
      expect(md).toContain('🖼️');
      // Should contain two image lines
      const imageLines = md.match(/🖼️/g);
      expect(imageLines).toHaveLength(2);
    });
  });

  describe('logRequest', () => {
    let tmpDir: string;
    let logger: ChatDebugLogger;
    let settingsService: ChatDebugSettingsService;
    let sessionTracker: SessionTracker;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'chat-debug-'));
      settingsService = {
        getSettings: () => ({ enabled: true, ttlHours: 24 }),
      } as unknown as ChatDebugSettingsService;
      sessionTracker = {
        resolveSession: () => ({
          sessionId: 'test-session-id',
          isNew: true,
        }),
      } as unknown as SessionTracker;
      logger = new ChatDebugLogger(settingsService, sessionTracker, tmpDir, createMockLogger());
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it('uses provided requestId in filename', () => {
      logger.logRequest(baseInput);

      const workspaceId = ChatDebugLogger.computeWorkspaceId(baseInput.workspaceFolderUri);
      const sessionDir = join(tmpDir, workspaceId, 'my-provider-test-model--test-session-id');
      const files = readdirSync(sessionDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d{8}-\d{6}-\d{3}-test-request-id\.md$/);
    });

    it('creates session directory with encoded model name', () => {
      const input: LogRequestInput = {
        ...baseInput,
        modelName: 'openai/gpt-4o',
      };
      logger.logRequest(input);

      const workspaceId = ChatDebugLogger.computeWorkspaceId(input.workspaceFolderUri);
      // Session dir should use sanitized model name: openai-gpt-4o--test-session-id
      const sessionDir = join(tmpDir, workspaceId, 'openai-gpt-4o--test-session-id');
      const files = readdirSync(sessionDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d{8}-\d{6}-\d{3}-.+\.md$/);
    });

    it('writes a Markdown file to the correct path', () => {
      logger.logRequest(baseInput);

      const workspaceId = ChatDebugLogger.computeWorkspaceId(baseInput.workspaceFolderUri);
      const sessionDir = join(tmpDir, workspaceId, 'my-provider-test-model--test-session-id');
      const files = readdirSync(sessionDir);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d{8}-\d{6}-\d{3}-.+\.md$/);
    });

    it('does not write when debug is disabled', () => {
      settingsService.getSettings = () => ({
        enabled: false,
        ttlHours: 24,
      });
      logger.logRequest(baseInput);

      const workspaceId = ChatDebugLogger.computeWorkspaceId(baseInput.workspaceFolderUri);
      const wsDir = join(tmpDir, workspaceId);
      expect(existsSync(wsDir)).toBe(false);
    });

    it('creates nested directories if they do not exist', () => {
      logger.logRequest(baseInput);

      const workspaceId = ChatDebugLogger.computeWorkspaceId(baseInput.workspaceFolderUri);
      const sessionDir = join(tmpDir, workspaceId, 'my-provider-test-model--test-session-id');
      expect(existsSync(sessionDir)).toBe(true);
    });

    it('writes atomically using temp file + rename', () => {
      logger.logRequest(baseInput);

      const workspaceId = ChatDebugLogger.computeWorkspaceId(baseInput.workspaceFolderUri);
      const sessionDir = join(tmpDir, workspaceId, 'my-provider-test-model--test-session-id');
      const files = readdirSync(sessionDir);
      expect(files.every((f) => f.endsWith('.md'))).toBe(true);
      expect(files.some((f) => f.includes('.tmp'))).toBe(false);
    });

    it('produces unique filenames for concurrent requests', () => {
      logger.logRequest(baseInput);
      logger.logRequest({ ...baseInput, requestId: 'another-request-id' });

      const workspaceId = ChatDebugLogger.computeWorkspaceId(baseInput.workspaceFolderUri);
      const sessionDir = join(tmpDir, workspaceId, 'my-provider-test-model--test-session-id');
      const files = readdirSync(sessionDir);
      expect(files).toHaveLength(2);
      expect(files[0]).not.toBe(files[1]);
    });

    it('does not throw when write fails', () => {
      const badLogger = new ChatDebugLogger(
        settingsService,
        sessionTracker,
        '/nonexistent/path/that/should/fail',
        createMockLogger(),
      );
      expect(() => badLogger.logRequest(baseInput)).not.toThrow();
    });

    it('file content does not contain API key values', () => {
      const input: LogRequestInput = {
        ...baseInput,
        modelOptions: {
          reasoningEffort: 'high',
          apiKey: 'sk-secret-12345',
        },
      };
      logger.logRequest(input);

      const workspaceId = ChatDebugLogger.computeWorkspaceId(input.workspaceFolderUri);
      const sessionDir = join(tmpDir, workspaceId, 'my-provider-test-model--test-session-id');
      const files = readdirSync(sessionDir);
      const content = readFileSync(join(sessionDir, files[0]), 'utf-8');
      expect(content).not.toContain('sk-secret-12345');
    });

    it('invokes onLogWrite callback after successful write', () => {
      const onLogWrite = vi.fn();
      const loggerWithCb = new ChatDebugLogger(
        settingsService,
        sessionTracker,
        tmpDir,
        createMockLogger(),
        onLogWrite,
      );

      loggerWithCb.logRequest(baseInput);

      expect(onLogWrite).toHaveBeenCalledOnce();
    });

    it('does not invoke onLogWrite when logging is disabled', () => {
      const onLogWrite = vi.fn();
      settingsService.getSettings = () => ({
        enabled: false,
        ttlHours: 24,
      });
      const loggerWithCb = new ChatDebugLogger(
        settingsService,
        sessionTracker,
        tmpDir,
        createMockLogger(),
        onLogWrite,
      );

      loggerWithCb.logRequest(baseInput);

      expect(onLogWrite).not.toHaveBeenCalled();
    });

    it('does not throw when onLogWrite is not provided', () => {
      expect(() => logger.logRequest(baseInput)).not.toThrow();
    });
  });

  describe('sanitizeModelName', () => {
    it('passes through simple model names unchanged', () => {
      expect(ChatDebugLogger.sanitizeModelName('gpt-4o')).toBe('gpt-4o');
    });

    it('replaces forward slashes with hyphens', () => {
      expect(ChatDebugLogger.sanitizeModelName('openai/gpt-4o')).toBe('openai-gpt-4o');
    });

    it('replaces backslashes with hyphens', () => {
      expect(ChatDebugLogger.sanitizeModelName('openai\\gpt-4o')).toBe('openai-gpt-4o');
    });

    it('replaces colons with hyphens', () => {
      expect(ChatDebugLogger.sanitizeModelName('provider:model:v2')).toBe('provider-model-v2');
    });

    it('replaces multiple unsafe characters', () => {
      expect(ChatDebugLogger.sanitizeModelName('a/b\\c:d<e>f')).toBe('a-b-c-d-e-f');
    });

    it('collapses consecutive hyphens after sanitization', () => {
      expect(ChatDebugLogger.sanitizeModelName('provider//model')).toBe('provider-model');
    });

    it('trims leading and trailing hyphens', () => {
      expect(ChatDebugLogger.sanitizeModelName('/model/')).toBe('model');
    });
  });
});
