import * as vscode from 'vscode';
import { ChatDebugLogger } from '../../services/chat-debug-logger/index.js';

/**
 * Parses a session directory name to extract the model name
 * and session ID.
 *
 * Directory names follow the format:
 * `{sanitizedModelName}--{sessionId}`
 *
 * @param dirName - The session directory name.
 * @returns Object containing `modelName` and `sessionId`.
 */
export function parseSessionDirName(dirName: string): { modelName: string; sessionId: string } {
  const separatorIndex = dirName.indexOf('--');
  if (separatorIndex === -1) {
    return { modelName: 'unknown', sessionId: dirName };
  }

  const modelName = dirName.slice(0, separatorIndex);
  const sessionId = dirName.slice(separatorIndex + 2);

  return { modelName, sessionId };
}

/** Tree item context values for distinguishing node types. */
const CONTEXT_SESSION = 'chatDebugSession';
const CONTEXT_LOG = 'chatDebugLog';

/** A session entry discovered from the filesystem. */
interface SessionEntry {
  /** Session directory name. */
  id: string;
  /** Display label: `{modelName} - {sessionId prefix}`. */
  label: string;
  /** Most recent log file modification time (epoch ms). */
  mtime: number;
  /** Number of log files in the session directory. */
  logCount: number;
  /** URI to the session directory. */
  sessionUri: vscode.Uri;
}

/**
 * Tree data provider for chat debug log sessions.
 *
 * Scans `globalStorageUri/logs/{workspaceId}/` for session
 * directories and their Markdown log files. Sessions are
 * sorted by most recent modification time descending. Log
 * files within each session are sorted by timestamp ascending.
 */
export class ChatDebugTreeViewProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | void
  >();

  /** Event that fires when the tree data changes. */
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Cached session data, rebuilt on refresh(). */
  private sessions: SessionEntry[] = [];

  /** Workspace ID for scoping log scans. */
  private readonly workspaceId: string | undefined;

  /** URI to the workspace's log directory. */
  private readonly workspaceLogsUri: vscode.Uri | undefined;

  /**
   * Creates a new ChatDebugTreeViewProvider.
   *
   * @param globalStorageUri - Extension global storage URI.
   */
  constructor(private readonly globalStorageUri: vscode.Uri) {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      this.workspaceId = ChatDebugLogger.computeWorkspaceId(folders[0].uri.toString());
      this.workspaceLogsUri = vscode.Uri.joinPath(globalStorageUri, 'logs', this.workspaceId);
    }
  }

  /**
   * Refreshes the tree view by clearing caches and firing
   * the change event.
   */
  refresh(): void {
    this.sessions = [];
    this._onDidChangeTreeData.fire();
  }

  /** Returns the tree item for the given element. */
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Returns child nodes for the given element.
   *
   * @param element - Parent element, or undefined for root.
   * @returns Session nodes at root, log nodes under a session.
   */
  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!this.workspaceLogsUri) {
      return [this.createPlaceholder('Open a workspace to see debug logs')];
    }

    if (!element) {
      return this.getRootChildren();
    }

    return this.getSessionChildren(element);
  }

  /** Disposes the event emitter. */
  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  /**
   * Scans the workspace log directory and returns session
   * tree items sorted by most recent modification time
   * descending.
   */
  private async getRootChildren(): Promise<vscode.TreeItem[]> {
    if (this.sessions.length === 0) {
      this.sessions = await this.scanSessions();
    }

    if (this.sessions.length === 0) {
      return [this.createPlaceholder('No debug logs available')];
    }

    return this.sessions.map((session) => this.createSessionItem(session));
  }

  /**
   * Scans the filesystem for session directories and their
   * log files.
   */
  private async scanSessions(): Promise<SessionEntry[]> {
    if (!this.workspaceLogsUri) return [];

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(this.workspaceLogsUri);
    } catch {
      return [];
    }

    const sessionDirs = entries.filter(([, type]) => type === vscode.FileType.Directory);
    const sessions: SessionEntry[] = [];

    for (const [dirName] of sessionDirs) {
      const sessionUri = vscode.Uri.joinPath(this.workspaceLogsUri!, dirName);

      let logEntries: [string, vscode.FileType][];
      try {
        logEntries = await vscode.workspace.fs.readDirectory(sessionUri);
      } catch {
        continue;
      }

      const logFiles = logEntries
        .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'))
        .sort(([a], [b]) => a.localeCompare(b));

      if (logFiles.length === 0) continue;

      // Get mtime from the most recent log file
      const mostRecentLogUri = vscode.Uri.joinPath(sessionUri, logFiles[logFiles.length - 1][0]);
      let mtime: number;
      try {
        const stat = await vscode.workspace.fs.stat(mostRecentLogUri);
        mtime = stat.mtime;
      } catch {
        mtime = 0;
      }

      // Parse model name and session ID from directory name
      const { modelName, sessionId } = parseSessionDirName(dirName);

      sessions.push({
        id: dirName,
        label: `${modelName} - ${sessionId.slice(0, 8)}`,
        mtime,
        logCount: logFiles.length,
        sessionUri,
      });
    }

    // Sort by mtime descending
    sessions.sort((a, b) => b.mtime - a.mtime);
    return sessions;
  }

  /**
   * Creates a tree item for a session node.
   */
  private createSessionItem(session: SessionEntry): vscode.TreeItem {
    const item = new vscode.TreeItem(session.label, vscode.TreeItemCollapsibleState.Collapsed);
    item.id = `session-${session.id}`;
    item.contextValue = CONTEXT_SESSION;
    item.description = `${session.logCount} log(s)`;
    item.iconPath = new vscode.ThemeIcon('comment-discussion');
    return item;
  }

  /**
   * Creates a placeholder tree item with a message.
   */
  private createPlaceholder(message: string): vscode.TreeItem {
    const item = new vscode.TreeItem(message);
    item.contextValue = 'chatDebugPlaceholder';
    return item;
  }

  /**
   * Returns log file tree items for a session, sorted by
   * timestamp ascending.
   */
  private async getSessionChildren(element: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const dirName = element.id?.replace('session-', '');
    if (!dirName || !this.workspaceLogsUri) return [];

    const sessionUri = vscode.Uri.joinPath(this.workspaceLogsUri, dirName);

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(sessionUri);
    } catch {
      return [];
    }

    const logFiles = entries
      .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'))
      .sort(([a], [b]) => a.localeCompare(b));

    return logFiles.map(([fileName]) => this.createLogItem(sessionUri, fileName));
  }

  /**
   * Creates a tree item for a log file node.
   */
  private createLogItem(sessionUri: vscode.Uri, fileName: string): vscode.TreeItem {
    const uri = vscode.Uri.joinPath(sessionUri, fileName);
    // Extract timestamp portion (first 19 chars: YYYYMMDD-HHmmss-SSS)
    const timestamp = fileName.slice(0, 19);
    const item = new vscode.TreeItem(timestamp);
    item.id = `log-${fileName}`;
    item.contextValue = CONTEXT_LOG;
    item.collapsibleState = vscode.TreeItemCollapsibleState.None;
    item.iconPath = new vscode.ThemeIcon('file');
    item.resourceUri = uri;
    item.command = {
      command: 'vscode.open',
      title: 'Open Log',
      arguments: [uri, { preview: true }],
    };
    return item;
  }
}
