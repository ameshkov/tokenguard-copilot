/// <reference types="mocha" />

import * as assert from 'node:assert';
import * as vscode from 'vscode';
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
      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes(commandId), `Command "${commandId}" should be registered`);
    });
  }
});
