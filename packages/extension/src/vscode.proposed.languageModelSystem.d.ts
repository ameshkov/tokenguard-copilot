/**
 * Type declarations for the VS Code proposed
 * `languageModelSystem` API.
 *
 * `LanguageModelChatMessageRole.System` (value `3`)
 * exists at runtime and is sent by VS Code Copilot Chat
 * to language model providers, but is not yet included
 * in the stable `@types/vscode`. This module
 * augmentation provides compile-time type safety for
 * receiving system-role messages.
 *
 * @see https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.languageModelSystem.d.ts
 */
declare module 'vscode' {
  export enum LanguageModelChatMessageRole {
    /**
     * The system role, used for system prompts that
     * instruct the model's behavior.
     */
    System = 3,
  }
}
