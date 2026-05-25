/**
 * @tokenguard/shared — shared types and protocol.
 *
 * Re-exports message protocol definitions used by both
 * the extension host and the webview UI.
 */
export * from './messages.js';

/**
 * MIME type for token usage data parts reported to
 * VS Code via LanguageModelDataPart.
 *
 * Must match "usage" — the value expected by
 * Copilot Chat.
 */
export const USAGE_DATA_PART_MIME = 'usage';
