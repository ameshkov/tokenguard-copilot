import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('oai-copilot.helloWorld', () => {
      vscode.window.showInformationMessage('Hello World from OAI Copilot!');
    }),
  );
}

export function deactivate() {}
