import * as vscode from 'vscode';

/**
 * Creates a status bar item for the TokenGuard Copilot extension.
 *
 * The item displays "TokenGuard Copilot" in the status bar and opens the
 * settings panel when clicked.
 *
 * @returns The created status bar item.
 */
export function createStatusBarItem(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = '$(sparkle) TokenGuard Copilot';
  item.tooltip = 'TokenGuard Copilot — click to open settings';
  item.command = 'tokenguard-copilot.openSettings';
  item.show();
  return item;
}
