import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  class MockUri {
    readonly scheme = 'file';
    readonly path: string;
    readonly fsPath: string;

    constructor(path: string) {
      this.path = path;
      this.fsPath = path;
    }

    toString(): string {
      return `file://${this.path}`;
    }
  }

  const FileType = {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
  };

  return {
    Uri: {
      joinPath: vi.fn(
        (base: MockUri, ...segments: string[]) => new MockUri([base.path, ...segments].join('/')),
      ),
      file: vi.fn((path: string) => new MockUri(path)),
    },
    TreeItem: class {
      label: string;
      collapsibleState?: number;
      id?: string;
      contextValue?: string;
      description?: string;
      iconPath?: unknown;
      command?: unknown;
      resourceUri?: unknown;
      constructor(label: string, collapsibleState?: number) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ThemeIcon: class {
      id: string;
      constructor(id: string) {
        this.id = id;
      }
    },
    EventEmitter: class<T> {
      private _listeners: ((event?: T) => void)[] = [];
      event = (listener: (event?: T) => void) => {
        this._listeners.push(listener);
        return { dispose: vi.fn() };
      };
      fire(event?: T): void {
        for (const l of this._listeners) l(event);
      }
      dispose = vi.fn();
    },
    workspace: {
      workspaceFolders: undefined as MockUri[] | undefined,
      fs: {
        stat: vi.fn().mockRejectedValue(new Error('not found')),
        writeFile: vi.fn().mockResolvedValue(undefined),
        readDirectory: vi.fn().mockResolvedValue([]),
      },
    },
    FileType,
  };
});

import * as vscode from 'vscode';
import { ChatDebugTreeViewProvider, parseSessionDirName } from './chat-debug-tree-view.js';

describe('ChatDebugTreeViewProvider', () => {
  let provider: ChatDebugTreeViewProvider;
  let globalStorageUri: vscode.Uri;

  beforeEach(() => {
    vi.clearAllMocks();
    globalStorageUri = {
      path: '/mock/storage',
      fsPath: '/mock/storage',
      scheme: 'file',
    } as unknown as vscode.Uri;

    // Default: one workspace folder
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [
        {
          uri: {
            scheme: 'file',
            path: '/home/user/project',
            fsPath: '/home/user/project',
            toString: () => 'file:///home/user/project',
          },
        },
      ],
      configurable: true,
    });

    provider = new ChatDebugTreeViewProvider(globalStorageUri);
  });

  describe('getChildren (root) with filesystem', () => {
    it('returns session nodes at the top level', async () => {
      const readDir = vi.mocked(vscode.workspace.fs.readDirectory);
      const stat = vi.mocked(vscode.workspace.fs.stat);

      readDir.mockResolvedValueOnce([
        ['openai-gpt-4o--sess-aaa', vscode.FileType.Directory],
        ['anthropic-claude-3--sess-bbb', vscode.FileType.Directory],
      ]);
      readDir.mockResolvedValueOnce([
        ['20260521-100000-000-req1.md', vscode.FileType.File],
        ['20260521-100100-000-req2.md', vscode.FileType.File],
      ]);
      readDir.mockResolvedValueOnce([['20260521-090000-000-req1.md', vscode.FileType.File]]);
      stat.mockResolvedValueOnce({
        mtime: 2000,
        size: 0,
        type: vscode.FileType.File,
        ctime: 0,
      });
      stat.mockResolvedValueOnce({
        mtime: 1000,
        size: 0,
        type: vscode.FileType.File,
        ctime: 0,
      });

      const children = await provider.getChildren();

      expect(children).toHaveLength(2);
      expect(children[0].label).toBe('openai-gpt-4o - sess-aaa');
      expect(children[0].description).toBe('2 log(s)');
      expect(children[0].collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
      expect(children[0].contextValue).toBe('chatDebugSession');
      expect(children[1].label).toBe('anthropic-claude-3 - sess-bbb');
      expect(children[1].description).toBe('1 log(s)');
    });

    it('returns placeholder when no sessions exist', async () => {
      vi.mocked(vscode.workspace.fs.readDirectory).mockResolvedValueOnce([]);

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('No debug logs available');
    });

    it('skips session directories with no log files', async () => {
      const readDir = vi.mocked(vscode.workspace.fs.readDirectory);

      readDir.mockResolvedValueOnce([['openai-gpt-4o--empty-session', vscode.FileType.Directory]]);
      readDir.mockResolvedValueOnce([]);

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('No debug logs available');
    });

    it('filters out non-.md files', async () => {
      const readDir = vi.mocked(vscode.workspace.fs.readDirectory);
      const stat = vi.mocked(vscode.workspace.fs.stat);

      readDir.mockResolvedValueOnce([['test-model--sess-xyz', vscode.FileType.Directory]]);
      readDir.mockResolvedValueOnce([
        ['20260521-100000-000-req1.md.tmp', vscode.FileType.File],
        ['20260521-100000-000-req1.md', vscode.FileType.File],
      ]);
      stat.mockResolvedValueOnce({
        mtime: 1000,
        size: 0,
        type: vscode.FileType.File,
        ctime: 0,
      });

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].description).toBe('1 log(s)');
    });
  });

  describe('getChildren (session)', () => {
    it('returns log nodes sorted by timestamp ascending', async () => {
      const readDir = vi.mocked(vscode.workspace.fs.readDirectory);
      const stat = vi.mocked(vscode.workspace.fs.stat);

      readDir.mockResolvedValueOnce([['openai-gpt-4o--sess-aaa', vscode.FileType.Directory]]);
      readDir.mockResolvedValueOnce([
        ['20260521-100100-000-req2.md', vscode.FileType.File],
        ['20260521-100000-000-req1.md', vscode.FileType.File],
      ]);
      stat.mockResolvedValueOnce({
        mtime: 2000,
        size: 0,
        type: vscode.FileType.File,
        ctime: 0,
      });

      const rootChildren = await provider.getChildren();
      const sessionItem = rootChildren[0];

      readDir.mockResolvedValueOnce([
        ['20260521-100100-000-req2.md', vscode.FileType.File],
        ['20260521-100000-000-req1.md', vscode.FileType.File],
      ]);

      const logChildren = await provider.getChildren(sessionItem);

      expect(logChildren).toHaveLength(2);
      expect(logChildren[0].label).toBe('20260521-100000-000');
      expect(logChildren[1].label).toBe('20260521-100100-000');
    });

    it('log nodes have correct properties', async () => {
      const readDir = vi.mocked(vscode.workspace.fs.readDirectory);
      const stat = vi.mocked(vscode.workspace.fs.stat);

      readDir.mockResolvedValueOnce([['openai-gpt-4o--sess-aaa', vscode.FileType.Directory]]);
      readDir.mockResolvedValueOnce([['20260521-100000-000-req1.md', vscode.FileType.File]]);
      stat.mockResolvedValueOnce({
        mtime: 2000,
        size: 0,
        type: vscode.FileType.File,
        ctime: 0,
      });

      const rootChildren = await provider.getChildren();
      const sessionItem = rootChildren[0];

      readDir.mockResolvedValueOnce([['20260521-100000-000-req1.md', vscode.FileType.File]]);

      const logChildren = await provider.getChildren(sessionItem);
      const logItem = logChildren[0];

      expect(logItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
      expect(logItem.contextValue).toBe('chatDebugLog');
      expect(logItem.command).toBeDefined();
      expect(logItem.command!.command).toBe('vscode.open');
      expect(logItem.resourceUri).toBeDefined();
    });

    it('returns empty array for unknown session element', async () => {
      const unknownItem = new vscode.TreeItem('unknown');
      unknownItem.id = 'session-nonexistent';

      const children = await provider.getChildren(unknownItem);

      expect(children).toHaveLength(0);
    });
  });

  describe('getTreeItem', () => {
    it('returns the element unchanged', () => {
      const item = new vscode.TreeItem('test');

      expect(provider.getTreeItem(item)).toBe(item);
    });
  });

  describe('refresh', () => {
    it('clears session cache and fires change event', async () => {
      const readDir = vi.mocked(vscode.workspace.fs.readDirectory);
      const stat = vi.mocked(vscode.workspace.fs.stat);

      readDir.mockResolvedValueOnce([['openai-gpt-4o--sess-aaa', vscode.FileType.Directory]]);
      readDir.mockResolvedValueOnce([['20260521-100000-000-req1.md', vscode.FileType.File]]);
      stat.mockResolvedValueOnce({
        mtime: 1000,
        size: 0,
        type: vscode.FileType.File,
        ctime: 0,
      });

      await provider.getChildren();

      provider.refresh();

      readDir.mockResolvedValueOnce([['anthropic-claude--sess-bbb', vscode.FileType.Directory]]);
      readDir.mockResolvedValueOnce([['20260521-110000-000-req1.md', vscode.FileType.File]]);
      stat.mockResolvedValueOnce({
        mtime: 2000,
        size: 0,
        type: vscode.FileType.File,
        ctime: 0,
      });

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('anthropic-claude - sess-bbb');
    });

    it('fires onDidChangeTreeData event', () => {
      const listener = vi.fn();
      provider.onDidChangeTreeData(listener);

      provider.refresh();

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  describe('dispose', () => {
    it('disposes the event emitter', () => {
      provider.dispose();

      expect(() => provider.dispose()).not.toThrow();
    });
  });
});

describe('parseSessionDirName', () => {
  it('extracts model name and session ID from directory name', () => {
    const { modelName, sessionId } = parseSessionDirName(
      'openai-gpt-4o--7d3e1a2b-4c5f-8901-abcd-ef1234567890',
    );

    expect(modelName).toBe('openai-gpt-4o');
    expect(sessionId).toBe('7d3e1a2b-4c5f-8901-abcd-ef1234567890');
  });

  it('handles model names with multiple hyphens', () => {
    const { modelName, sessionId } = parseSessionDirName(
      'anthropic-claude-3-sonnet--abc123-def456',
    );

    expect(modelName).toBe('anthropic-claude-3-sonnet');
    expect(sessionId).toBe('abc123-def456');
  });

  it('handles model names with provider slash (sanitized)', () => {
    const { modelName, sessionId } = parseSessionDirName('provider-model-name--session-uuid');

    expect(modelName).toBe('provider-model-name');
    expect(sessionId).toBe('session-uuid');
  });

  it('returns "unknown" for malformed directory names', () => {
    const { modelName, sessionId } = parseSessionDirName('malformed-directory-name');

    expect(modelName).toBe('unknown');
    expect(sessionId).toBe('malformed-directory-name');
  });

  it('splits on the first `--` separator only', () => {
    const { modelName, sessionId } = parseSessionDirName('model--name--session--id');

    expect(modelName).toBe('model');
    expect(sessionId).toBe('name--session--id');
  });
});
