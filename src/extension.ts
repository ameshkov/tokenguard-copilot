import * as vscode from 'vscode';
import { SettingsPanel } from './settings-panel.js';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('oai-copilot.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from OAI Copilot!');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('oai-copilot.openSettings', () => {
      SettingsPanel.createOrShow(context.extensionUri);
    }),
  );
}

export function deactivate() {}
