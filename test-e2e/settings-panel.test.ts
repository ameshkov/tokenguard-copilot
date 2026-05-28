/// <reference types="mocha" />

import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { executeCommand, getExtension, waitForCondition } from './helpers.js';

suite('Settings Panel', () => {
  suiteSetup(async () => {
    await getExtension();
  });

  teardown(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  test('opening settings creates a webview panel', async () => {
    await executeCommand('tokenguard-copilot.openSettings');

    const tab = await waitForCondition(() => {
      for (const group of vscode.window.tabGroups.all) {
        for (const t of group.tabs) {
          if (t.label.includes('TokenGuard Copilot Settings')) {
            return t;
          }
        }
      }
      return undefined;
    });

    assert.ok(tab, 'Settings panel tab should exist');
  });

  test('opening settings twice reuses the panel', async () => {
    await executeCommand('tokenguard-copilot.openSettings');
    await waitForCondition(() => {
      for (const group of vscode.window.tabGroups.all) {
        for (const t of group.tabs) {
          if (t.label.includes('TokenGuard Copilot Settings')) {
            return t;
          }
        }
      }
      return undefined;
    });

    // Open again — should reuse, not duplicate.
    await executeCommand('tokenguard-copilot.openSettings');

    // Small delay to let any duplicate panel appear.
    await new Promise((resolve) => setTimeout(resolve, 500));

    let count = 0;
    for (const group of vscode.window.tabGroups.all) {
      for (const t of group.tabs) {
        if (t.label.includes('TokenGuard Copilot Settings')) {
          count++;
        }
      }
    }

    assert.strictEqual(count, 1, 'Only one settings panel should exist');
  });
});
