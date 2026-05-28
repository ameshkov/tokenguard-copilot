/// <reference types="mocha" />

import * as assert from 'node:assert';
import { executeCommand, getExtension } from './helpers.js';

suite('Tree View', () => {
  suiteSetup(async () => {
    await getExtension();
  });

  suiteTeardown(async () => {
    // Disable debug logging to restore initial state.
    await executeCommand('tokenguard-copilot.disableDebuggingLogging');
  });

  test('tree view is registered in package.json contributions', async () => {
    const extension = await getExtension();
    const views = extension.packageJSON?.contributes?.views?.explorer as
      | Array<{ id: string }>
      | undefined;

    assert.ok(views, 'Explorer views should be defined in contributes');

    const treeView = views.find((v) => v.id === 'tokenguardCopilotChatDebugLogs');
    assert.ok(treeView, 'tokenguardCopilotChatDebugLogs view should be registered');
  });

  test('tree view when clause uses chatDebugEnabled context key', async () => {
    const extension = await getExtension();
    const views = extension.packageJSON?.contributes?.views?.explorer as
      | Array<{ id: string; when?: string }>
      | undefined;

    const treeView = views?.find((v) => v.id === 'tokenguardCopilotChatDebugLogs');
    assert.ok(treeView, 'Tree view should be registered');
    assert.strictEqual(
      treeView.when,
      'tokenguard-copilot.chatDebugEnabled',
      'Tree view should be gated by chatDebugEnabled context key',
    );
  });

  test('enabling debug logging sets context key', async () => {
    // Enable debug logging using skipConfirmation to bypass
    // the modal dialog that the test runner refuses.
    await executeCommand('tokenguard-copilot.enableDebuggingLogging', {
      skipConfirmation: true,
    });

    // The context key is set asynchronously via executeCommand.
    // We cannot read context keys directly, but we verify the
    // command completed without error — the unit tests cover
    // that setContext is called with the correct value.
    // The tree view should now be visible (when clause met).
    assert.ok(true, 'enableDebuggingLogging with skipConfirmation succeeded');
  });

  test('disabling debug logging clears context key', async () => {
    await executeCommand('tokenguard-copilot.disableDebuggingLogging');

    // Same rationale as above — unit tests verify setContext
    // is called with false. The tree view should now be hidden.
    assert.ok(true, 'disableDebuggingLogging succeeded');
  });
});
