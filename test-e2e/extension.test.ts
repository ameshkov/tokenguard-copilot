/// <reference types="mocha" />

import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Extension E2E Tests', () => {
  test('extension should be present', () => {
    const extension = vscode.extensions.getExtension('ameshkov.tokenguard-copilot');
    assert.ok(extension, 'Extension should be available');
  });

  test('extension should activate', async () => {
    const extension = vscode.extensions.getExtension('ameshkov.tokenguard-copilot');
    assert.ok(extension, 'Extension should be available');

    await extension.activate();
    assert.strictEqual(extension.isActive, true, 'Extension should be active');
  });

  test('helloWorld command should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes('tokenguard-copilot.helloWorld'),
      'helloWorld command should be registered',
    );
  });
});
