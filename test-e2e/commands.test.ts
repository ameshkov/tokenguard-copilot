/// <reference types="mocha" />

import * as assert from 'node:assert';
import { commands } from 'vscode';
import { getExtension } from './helpers.js';

/** All command IDs registered by the extension. */
const COMMAND_IDS = [
  'tokenguard-copilot.openSettings',
  'tokenguard-copilot.enableDebuggingLogging',
  'tokenguard-copilot.disableDebuggingLogging',
  'tokenguard-copilot.clearDebuggingLogs',
  'tokenguard-copilot.refreshDebuggingLogs',
];

suite('Commands', () => {
  suiteSetup(async () => {
    await getExtension();
  });

  for (const commandId of COMMAND_IDS) {
    test(`command "${commandId}" should be registered`, async () => {
      const allCommands = await commands.getCommands(true);
      assert.ok(allCommands.includes(commandId), `Command "${commandId}" should be registered`);
    });
  }
});
