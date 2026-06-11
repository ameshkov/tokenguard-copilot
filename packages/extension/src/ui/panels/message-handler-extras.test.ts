import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtensionContext as AppContext } from '../../context.js';
import type { WebviewCommand } from '@tokenguard/shared';
import type { ContentRule } from '../../db/index.js';
import { type Webview } from 'vscode';
import { createMockWebview, createMockAppCtx } from '../../test/settings-panel-helpers.js';
import {
  handleGetChatDebugSettings,
  handleUpdateChatDebugSettings,
  handleClearChatDebugLogs,
  handleGetContentRules,
  handleGetContentRule,
  handleAddContentRule,
  handleUpdateContentRule,
  handleDeleteContentRule,
  handleReorderContentRules,
} from './message-handler-extras.js';

vi.mock('vscode', () => ({
  window: { showInformationMessage: vi.fn() },
  commands: { executeCommand: vi.fn() },
}));

describe('message-handler-extras', () => {
  let appCtx: AppContext;
  let webview: Webview;

  beforeEach(() => {
    vi.clearAllMocks();
    appCtx = createMockAppCtx();
    webview = createMockWebview() as unknown as Webview;
  });

  // ── Debug handlers ─────────────────────────────────────

  describe('Debug handlers', () => {
    it('handles getChatDebugSettings request', async () => {
      const settings = { enabled: false, ttlHours: 24 };
      vi.mocked(appCtx.chatDebugSettings.getSettings).mockReturnValue(settings);

      await handleGetChatDebugSettings(appCtx, webview, {
        type: 'getChatDebugSettings',
        requestId: 'r21',
      } as Extract<WebviewCommand, { type: 'getChatDebugSettings' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'getChatDebugSettingsResult',
        requestId: 'r21',
        settings,
      });
    });

    it('handles updateChatDebugSettings success', async () => {
      const updated = { enabled: true, ttlHours: 12 };
      vi.mocked(appCtx.chatDebugSettings.updateSettings).mockReturnValue(updated);

      await handleUpdateChatDebugSettings(appCtx, webview, {
        type: 'updateChatDebugSettings',
        requestId: 'r22',
        enabled: true,
        ttlHours: 12,
      } as Extract<WebviewCommand, { type: 'updateChatDebugSettings' }>);

      expect(appCtx.chatDebugSettings.updateSettings).toHaveBeenCalledWith({
        enabled: true,
        ttlHours: 12,
      });
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'updateChatDebugSettingsResult',
        requestId: 'r22',
        success: true,
        settings: updated,
      });
    });

    it('handles updateChatDebugSettings failure', async () => {
      vi.mocked(appCtx.chatDebugSettings.updateSettings).mockImplementation(() => {
        throw new Error('ttlHours must be at least 1');
      });

      await handleUpdateChatDebugSettings(appCtx, webview, {
        type: 'updateChatDebugSettings',
        requestId: 'r23',
        ttlHours: 0,
      } as Extract<WebviewCommand, { type: 'updateChatDebugSettings' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'updateChatDebugSettingsResult',
        requestId: 'r23',
        success: false,
        error: 'ttlHours must be at least 1',
      });
    });

    it('handles clearChatDebugLogs request', async () => {
      await handleClearChatDebugLogs(appCtx, webview, {
        type: 'clearChatDebugLogs',
        requestId: 'r24',
      } as Extract<WebviewCommand, { type: 'clearChatDebugLogs' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'clearChatDebugLogsResult',
        requestId: 'r24',
        success: true,
      });
    });
  });

  // ── Content rule handlers ──────────────────────────────

  describe('Content rule handlers', () => {
    function makeRule(overrides: Partial<ContentRule> = {}): ContentRule {
      return {
        id: 'r1',
        name: 'Test Rule',
        enabled: 1,
        matchRole: 'all',
        matchMessageNumber: null,
        matchModelPattern: null,
        matchContentPattern: null,
        matchToolPresent: null,
        matchToolAbsent: null,
        regexPattern: 'hello',
        regexFlags: 'gi',
        substitution: 'hi',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides,
      };
    }

    it('handles getContentRules request', async () => {
      const rule = makeRule();
      vi.mocked(appCtx.contentRules.getAll).mockReturnValue([rule]);

      await handleGetContentRules(appCtx, webview, {
        type: 'getContentRules',
        requestId: 'r-cr-1',
      } as Extract<WebviewCommand, { type: 'getContentRules' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'getContentRulesResult',
        requestId: 'r-cr-1',
        rules: [
          {
            id: 'r1',
            name: 'Test Rule',
            enabled: true,
            matchRole: 'all',
            matchMessageNumber: null,
            matchModelPattern: null,
            matchContentPattern: null,
            matchToolPresent: null,
            matchToolAbsent: null,
            regexPattern: 'hello',
            regexFlags: 'gi',
            substitution: 'hi',
            sortOrder: 0,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      });
    });

    it('handles getContentRule request — found', async () => {
      const rule = makeRule({ matchRole: 'user', regexFlags: 'g' });
      vi.mocked(appCtx.contentRules.getById).mockReturnValue(rule);

      await handleGetContentRule(appCtx, webview, {
        type: 'getContentRule',
        requestId: 'r-cr-2',
        id: 'r1',
      } as Extract<WebviewCommand, { type: 'getContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'getContentRuleResult',
        requestId: 'r-cr-2',
        rule: expect.objectContaining({ id: 'r1', enabled: true }),
      });
    });

    it('handles getContentRule request — not found', async () => {
      vi.mocked(appCtx.contentRules.getById).mockReturnValue(undefined);

      await handleGetContentRule(appCtx, webview, {
        type: 'getContentRule',
        requestId: 'r-cr-3',
        id: 'nonexistent',
      } as Extract<WebviewCommand, { type: 'getContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'getContentRuleResult',
        requestId: 'r-cr-3',
        rule: null,
      });
    });

    it('handles addContentRule success', async () => {
      const created = makeRule({
        id: 'r-new',
        name: 'New Rule',
        regexPattern: 'test',
        regexFlags: 'gi',
        substitution: 'replaced',
      });
      vi.mocked(appCtx.contentRules.create).mockReturnValue(created);

      await handleAddContentRule(appCtx, webview, {
        type: 'addContentRule',
        requestId: 'r-cr-4',
        params: {
          name: 'New Rule',
          enabled: true,
          matchRole: 'all',
          matchMessageNumber: null,
          matchModelPattern: null,
          matchContentPattern: null,
          matchToolPresent: null,
          matchToolAbsent: null,
          regexPattern: 'test',
          regexFlags: 'gi',
          substitution: 'replaced',
        },
      } as Extract<WebviewCommand, { type: 'addContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'addContentRuleResult',
        requestId: 'r-cr-4',
        success: true,
        rule: expect.objectContaining({ id: 'r-new', enabled: true }),
      });
    });

    it('handles addContentRule validation failure — empty name', async () => {
      await handleAddContentRule(appCtx, webview, {
        type: 'addContentRule',
        requestId: 'r-cr-5',
        params: {
          name: '',
          enabled: true,
          matchRole: 'all',
          matchMessageNumber: null,
          matchModelPattern: null,
          matchContentPattern: null,
          matchToolPresent: null,
          matchToolAbsent: null,
          regexPattern: 'test',
          regexFlags: 'g',
          substitution: 'x',
        },
      } as Extract<WebviewCommand, { type: 'addContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'addContentRuleResult',
        requestId: 'r-cr-5',
        success: false,
        error: 'Name is required.',
      });
    });

    it('handles addContentRule validation failure — invalid regex', async () => {
      await handleAddContentRule(appCtx, webview, {
        type: 'addContentRule',
        requestId: 'r-cr-6',
        params: {
          name: 'Bad Regex',
          enabled: true,
          matchRole: 'all',
          matchMessageNumber: null,
          matchModelPattern: null,
          matchContentPattern: null,
          matchToolPresent: null,
          matchToolAbsent: null,
          regexPattern: '[unclosed',
          regexFlags: 'g',
          substitution: 'x',
        },
      } as Extract<WebviewCommand, { type: 'addContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'addContentRuleResult',
        requestId: 'r-cr-6',
        success: false,
        error: 'Invalid regex pattern.',
      });
    });

    it('handles addContentRule validation failure — invalid flags', async () => {
      await handleAddContentRule(appCtx, webview, {
        type: 'addContentRule',
        requestId: 'r-cr-7',
        params: {
          name: 'Bad Flags',
          enabled: true,
          matchRole: 'all',
          matchMessageNumber: null,
          matchModelPattern: null,
          matchContentPattern: null,
          matchToolPresent: null,
          matchToolAbsent: null,
          regexPattern: 'test',
          regexFlags: 'gix',
          substitution: 'x',
        },
      } as Extract<WebviewCommand, { type: 'addContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'addContentRuleResult',
        requestId: 'r-cr-7',
        success: false,
        error: 'Invalid regex flags. Only g, i, m, s are allowed.',
      });
    });

    it('handles updateContentRule success', async () => {
      const updated = makeRule({
        name: 'Updated Rule',
        enabled: 0,
        matchRole: 'user',
        regexPattern: 'updated',
        regexFlags: 'g',
        substitution: 'new',
      });
      vi.mocked(appCtx.contentRules.update).mockReturnValue(updated);

      await handleUpdateContentRule(appCtx, webview, {
        type: 'updateContentRule',
        requestId: 'r-cr-8',
        id: 'r1',
        params: {
          name: 'Updated Rule',
          enabled: false,
          matchRole: 'user',
          regexPattern: 'updated',
          regexFlags: 'g',
          substitution: 'new',
        },
      } as Extract<WebviewCommand, { type: 'updateContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'updateContentRuleResult',
        requestId: 'r-cr-8',
        success: true,
        rule: expect.objectContaining({ id: 'r1', enabled: false }),
      });
    });

    it('handles updateContentRule — not found', async () => {
      vi.mocked(appCtx.contentRules.update).mockReturnValue(undefined);

      await handleUpdateContentRule(appCtx, webview, {
        type: 'updateContentRule',
        requestId: 'r-cr-9',
        id: 'nonexistent',
        params: {
          name: 'Ghost',
          regexPattern: 'test',
          regexFlags: 'g',
          substitution: 'x',
        },
      } as Extract<WebviewCommand, { type: 'updateContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'updateContentRuleResult',
        requestId: 'r-cr-9',
        success: false,
        error: 'Content rule not found.',
      });
    });

    it('handles updateContentRule validation failure — duplicate name', async () => {
      vi.mocked(appCtx.contentRules.validateName).mockReturnValue(true);

      await handleUpdateContentRule(appCtx, webview, {
        type: 'updateContentRule',
        requestId: 'r-cr-10',
        id: 'r2',
        params: {
          name: 'Duplicate',
          regexPattern: 'test',
          regexFlags: 'g',
          substitution: 'x',
        },
      } as Extract<WebviewCommand, { type: 'updateContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'updateContentRuleResult',
        requestId: 'r-cr-10',
        success: false,
        error: 'A content rule with the name "Duplicate" already exists.',
      });
    });

    it('handles deleteContentRule success', async () => {
      vi.mocked(appCtx.contentRules.delete).mockReturnValue(true);

      await handleDeleteContentRule(appCtx, webview, {
        type: 'deleteContentRule',
        requestId: 'r-cr-11',
        id: 'r1',
      } as Extract<WebviewCommand, { type: 'deleteContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'deleteContentRuleResult',
        requestId: 'r-cr-11',
        success: true,
      });
    });

    it('handles deleteContentRule — not found', async () => {
      vi.mocked(appCtx.contentRules.delete).mockReturnValue(false);

      await handleDeleteContentRule(appCtx, webview, {
        type: 'deleteContentRule',
        requestId: 'r-cr-12',
        id: 'nonexistent',
      } as Extract<WebviewCommand, { type: 'deleteContentRule' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'deleteContentRuleResult',
        requestId: 'r-cr-12',
        success: false,
        error: 'Content rule not found.',
      });
    });

    it('handles reorderContentRules success', async () => {
      const reorderedRules = [
        makeRule({
          id: 'r2',
          name: 'B',
          regexPattern: 'b',
          regexFlags: 'g',
          substitution: 'bb',
        }),
        makeRule({
          id: 'r1',
          name: 'A',
          regexPattern: 'a',
          regexFlags: 'g',
          substitution: 'aa',
          sortOrder: 1,
        }),
      ];
      vi.mocked(appCtx.contentRules.reorder).mockImplementation(() => {});
      vi.mocked(appCtx.contentRules.getAll).mockReturnValue(reorderedRules);

      await handleReorderContentRules(appCtx, webview, {
        type: 'reorderContentRules',
        requestId: 'r-cr-13',
        orderedIds: ['r2', 'r1'],
      } as Extract<WebviewCommand, { type: 'reorderContentRules' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'reorderContentRulesResult',
        requestId: 'r-cr-13',
        success: true,
        rules: expect.any(Array),
      });
    });

    it('handles reorderContentRules failure', async () => {
      vi.mocked(appCtx.contentRules.reorder).mockImplementation(() => {
        throw new Error('Rule not found');
      });

      await handleReorderContentRules(appCtx, webview, {
        type: 'reorderContentRules',
        requestId: 'r-cr-14',
        orderedIds: ['bad-id'],
      } as Extract<WebviewCommand, { type: 'reorderContentRules' }>);

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'reorderContentRulesResult',
        requestId: 'r-cr-14',
        success: false,
        error: 'Rule not found',
      });
    });
  });
});
