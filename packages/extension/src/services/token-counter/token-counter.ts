import * as vscode from 'vscode';
import {
  createTokenizer,
  getRegexByEncoder,
  getSpecialTokensByEncoder,
} from '@microsoft/tiktokenizer';

/** Base tokens added per message (for message framing). */
const BASE_TOKENS_PER_MESSAGE = 3;

/** Base tokens added when a message has a name. */
const BASE_TOKENS_PER_NAME = 1;

/** Tokenizer encoder name. */
const TOKENIZER_ENCODER = 'o200k_base';

/** Path to the tokenizer model file relative to the extension root. */
const TOKENIZER_MODEL_PATH = 'assets/model/o200k_base.tiktoken';

/**
 * Counts tokens for chat messages using the
 * `@microsoft/tiktokenizer` library.
 */
export class TokenCounter {
  private tokenizerPromise: Promise<{ encode(text: string): number[] }> | null = null;
  private extensionPath: string;

  /**
   * Creates a TokenCounter.
   *
   * @param extensionPath - Absolute path to the extension
   *   directory (used to locate the tokenizer model file).
   */
  constructor(extensionPath: string) {
    this.extensionPath = extensionPath;
  }

  /**
   * Initialize the tokenizer. Must be called before
   * `countTokens` or `countMessageTokens`.
   *
   * Safe to call multiple times — the tokenizer is only
   * loaded once.
   */
  async initialize(): Promise<void> {
    if (!this.tokenizerPromise) {
      this.tokenizerPromise = this.loadTokenizer();
    }
    await this.tokenizerPromise;
  }

  /**
   * Count tokens in a plain text string.
   *
   * @param text - The text to count tokens for.
   * @returns Estimated token count. Returns 0 if the
   *   tokenizer is not yet initialized.
   */
  async countTokens(text: string): Promise<number> {
    if (!text) return 0;
    const tokenizer = await this.tokenizerPromise;
    if (!tokenizer) return 0;
    try {
      return tokenizer.encode(text).length;
    } catch {
      return 0;
    }
  }

  /**
   * Count tokens for a full chat request message.
   *
   * Handles text parts, tool calls, tool results, and
   * images. Accounts for per-message and per-name
   * framing tokens.
   *
   * @param message - The chat message to count tokens for.
   * @returns Estimated token count.
   */
  async countMessageTokens(message: vscode.LanguageModelChatRequestMessage): Promise<number> {
    let total = BASE_TOKENS_PER_MESSAGE + BASE_TOKENS_PER_NAME;

    for (const part of message.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        total += await this.countTokens(part.value);
      } else if (part instanceof vscode.LanguageModelDataPart) {
        if (part.mimeType.startsWith('image/')) {
          total += this.calculateImageTokens();
        } else {
          total += this.calculateBinaryTokens(part.data.byteLength);
        }
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        total += BASE_TOKENS_PER_NAME;
        total += await this.countTokens(JSON.stringify(part.input));
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        total += await this.countTokens(JSON.stringify(part.content));
      }
    }

    return total;
  }

  /**
   * Calculate approximate token cost for an image.
   *
   * @returns Conservative estimate for a medium-sized
   *   image.
   */
  private calculateImageTokens(): number {
    return 255;
  }

  /**
   * Calculate approximate token cost for non-image
   * binary data.
   *
   * @param byteLength - Size of the binary data in bytes.
   * @returns Estimated token count.
   */
  private calculateBinaryTokens(byteLength: number): number {
    if (!byteLength) return 0;
    const per16Kb = Math.ceil(byteLength / 16384);
    return Math.min(200, 20 + per16Kb);
  }

  /**
   * Load the tokenizer model from disk.
   *
   * @returns A tokenizer object with an `encode` method.
   */
  private async loadTokenizer(): Promise<{
    encode(text: string): number[];
  }> {
    const modelPath = vscode.Uri.joinPath(
      vscode.Uri.file(this.extensionPath),
      TOKENIZER_MODEL_PATH,
    ).fsPath;

    return createTokenizer(
      modelPath,
      getSpecialTokensByEncoder(TOKENIZER_ENCODER),
      getRegexByEncoder(TOKENIZER_ENCODER),
      64000,
    );
  }
}
