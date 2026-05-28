/// <reference types="mocha" />

import * as assert from 'node:assert';
import { executeCommand, getExtension } from './helpers.js';

suite('Debug Logging', () => {
  suiteSetup(async () => {
    await getExtension();
  });

  test('enableDebuggingLogging with skipConfirmation does not throw', async () => {
    await assert.doesNotReject(
      executeCommand('tokenguard-copilot.enableDebuggingLogging', {
        skipConfirmation: true,
      }),
    );
  });

  test('disableDebuggingLogging does not throw', async () => {
    await assert.doesNotReject(executeCommand('tokenguard-copilot.disableDebuggingLogging'));
  });

  test('refreshDebuggingLogs does not throw', async () => {
    await assert.doesNotReject(executeCommand('tokenguard-copilot.refreshDebuggingLogs'));
  });

  test('clearDebuggingLogs with skipConfirmation does not throw', async () => {
    await assert.doesNotReject(
      executeCommand('tokenguard-copilot.clearDebuggingLogs', {
        skipConfirmation: true,
      }),
    );
  });
});
