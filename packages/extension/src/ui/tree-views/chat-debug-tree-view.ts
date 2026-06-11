import {
  type Disposable,
  EventEmitter,
  FileType,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
  type TreeDataProvider,
  Uri,
  workspace,
} from 'vscode';
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

/**
 * Formats a filesystem-safe timestamp into a human-readable date string.
 *
 * Input:  "20260521-100000-000"
 * Output: "2026-05-21 10:00:00"
 *
 * @param timestamp - The timestamp string in YYYYMMDD-HHmmss-SSS format.
 * @returns Formatted date string.
 */
function formatTimestampForDisplay(timestamp: string): string {
  const year = timestamp.slice(0, 4);
  const month = timestamp.slice(4, 6);
  const day = timestamp.slice(6, 8);
  const hour = timestamp.slice(9, 11);
  const minute = timestamp.slice(11, 13);
  const second = timestamp.slice(13, 15);
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Extracts the request ID from a log filename.
 *
 * Input:  "20260521-100000-000-req1.md"
 * Output: "req1"
 *
 * @param fileName - The log filename.
 * @returns The request ID string.
 */
function extractRequestId(fileName: string): string {
  const withoutExt = fileName.replace('.md', '');
  return withoutExt.slice(20); // skip 19-char timestamp + 1 hyphen
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
  sessionUri: Uri;
}

/**
 * Tree data provider for chat debug log sessions.
 *
 * Scans `globalStorageUri/logs/{workspaceId}/` for session
 * directories and their Markdown log files. Sessions are
 * sorted by most recent modification time descending. Log
 * files within each session are sorted by timestamp ascending.
 */
export class ChatDebugTreeViewProvider implements TreeDataProvider<TreeItem>, Disposable {
  private readonly _onDidChangeTreeData = new EventEmitter<TreeItem | undefined | void>();

  /** Event that fires when the tree data changes. */
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Cached session data, rebuilt on refresh(). */
  private sessions: SessionEntry[] = [];

  /** Workspace ID for scoping log scans. */
  private readonly workspaceId: string | undefined;

  /** URI to the workspace's log directory. */
  private readonly workspaceLogsUri: Uri | undefined;

  /**
   * Creates a new ChatDebugTreeViewProvider.
   *
   * @param globalStorageUri - Extension global storage URI.
   */
  constructor(private readonly globalStorageUri: Uri) {
    const folders = workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      this.workspaceId = ChatDebugLogger.computeWorkspaceId(folders[0].uri.toString());
      this.workspaceLogsUri = Uri.joinPath(globalStorageUri, 'logs', this.workspaceId);
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
  getTreeItem(element: TreeItem): TreeItem {
    return element;
  }

  /**
   * Returns child nodes for the given element.
   *
   * @param element - Parent element, or undefined for root.
   * @returns Session nodes at root, log nodes under a session.
   */
  async getChildren(element?: TreeItem): Promise<TreeItem[]> {
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
  private async getRootChildren(): Promise<TreeItem[]> {
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

    let entries: [string, FileType][];
    try {
      entries = await workspace.fs.readDirectory(this.workspaceLogsUri);
    } catch {
      return [];
    }

    const sessionDirs = entries.filter(([, type]) => type === FileType.Directory);
    const sessions: SessionEntry[] = [];

    for (const [dirName] of sessionDirs) {
      const sessionUri = Uri.joinPath(this.workspaceLogsUri!, dirName);

      let logEntries: [string, FileType][];
      try {
        logEntries = await workspace.fs.readDirectory(sessionUri);
      } catch {
        continue;
      }

      const logFiles = logEntries
        .filter(([name, type]) => type === FileType.File && name.endsWith('.md'))
        .sort(([a], [b]) => a.localeCompare(b));

      if (logFiles.length === 0) continue;

      // Get mtime from the most recent log file
      const mostRecentLogUri = Uri.joinPath(sessionUri, logFiles[logFiles.length - 1][0]);
      let mtime: number;
      try {
        const stat = await workspace.fs.stat(mostRecentLogUri);
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
  private createSessionItem(session: SessionEntry): TreeItem {
    const item = new TreeItem(session.label, TreeItemCollapsibleState.Collapsed);
    item.id = `session-${session.id}`;
    item.contextValue = CONTEXT_SESSION;
    item.description = `${session.logCount} turn(s)`;
    item.iconPath = new ThemeIcon('comment-discussion');
    return item;
  }

  /**
   * Creates a placeholder tree item with a message.
   */
  private createPlaceholder(message: string): TreeItem {
    const item = new TreeItem(message);
    item.contextValue = 'chatDebugPlaceholder';
    return item;
  }

  /**
   * Returns log file tree items for a session, sorted by
   * timestamp ascending.
   */
  private async getSessionChildren(element: TreeItem): Promise<TreeItem[]> {
    const dirName = element.id?.replace('session-', '');
    if (!dirName || !this.workspaceLogsUri) return [];

    const sessionUri = Uri.joinPath(this.workspaceLogsUri, dirName);

    let entries: [string, FileType][];
    try {
      entries = await workspace.fs.readDirectory(sessionUri);
    } catch {
      return [];
    }

    const logFiles = entries
      .filter(([name, type]) => type === FileType.File && name.endsWith('.md'))
      .sort(([a], [b]) => a.localeCompare(b));

    return logFiles.map(([fileName], index) => this.createLogItem(sessionUri, fileName, index));
  }

  /**
   * Creates a tree item for a log file node.
   *
   * @param sessionUri - URI of the session directory.
   * @param fileName - Log filename.
   * @param index - Zero-based index for ordering.
   * @returns A tree item with formatted label and request ID description.
   */
  private createLogItem(sessionUri: Uri, fileName: string, index: number): TreeItem {
    const uri = Uri.joinPath(sessionUri, fileName);
    // Extract timestamp portion (first 19 chars: YYYYMMDD-HHmmss-SSS)
    const timestamp = fileName.slice(0, 19);
    const formattedDate = formatTimestampForDisplay(timestamp);
    const requestId = extractRequestId(fileName);
    const item = new TreeItem(`${index + 1}. ${formattedDate}`, TreeItemCollapsibleState.None);
    item.id = `log-${fileName}`;
    item.contextValue = CONTEXT_LOG;
    item.description = requestId;
    item.iconPath = new ThemeIcon('file');
    item.resourceUri = uri;
    item.command = {
      command: 'vscode.open',
      title: 'Open Log',
      arguments: [uri, { preview: true }],
    };
    return item;
  }
}
