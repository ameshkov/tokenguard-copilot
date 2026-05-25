import * as vscode from 'vscode';
import {
  createTokenizer,
  getRegexByEncoder,
  getSpecialTokensByEncoder,
} from '@microsoft/tiktokenizer';
import { getImageDimensions } from '../../utils/image-dimensions.js';

/** Base tokens added per message (for message framing). */
const BASE_TOKENS_PER_MESSAGE = 3;

/** Base tokens added when a message has a name. */
const BASE_TOKENS_PER_NAME = 1;

/** Maximum entries in the token count LRU cache. */
const CACHE_MAX_ENTRIES = 5000;

/** Maximum total byte size of the token count LRU cache. */
const CACHE_MAX_SIZE_BYTES = 5_000_000; // 5MB

/**
 * Simple LRU cache for token counts.
 *
 * Evicts oldest entries when either the entry count or
 * total byte size exceeds the configured limits.
 */
class TokenCache {
  private cache = new Map<string, number>();
  private readonly maxSize = CACHE_MAX_ENTRIES;
  private readonly maxSizeBytes = CACHE_MAX_SIZE_BYTES;
  private currentSize = 0;

  get(key: string): number | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: string, value: number): void {
    // Calculate approximate size of new entry
    const entrySize = key.length * 2 + 8;

    // Evict oldest entries if limits would be exceeded
    while (
      (this.cache.size >= this.maxSize || this.currentSize + entrySize > this.maxSizeBytes) &&
      this.cache.size > 0
    ) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey === undefined) break;
      const evictedSize = firstKey.length * 2 + 8;
      this.cache.delete(firstKey);
      this.currentSize -= evictedSize;
    }

    this.cache.set(key, value);
    this.currentSize += entrySize;
  }
}

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
  private tokenCache = new TokenCache();

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

    // Check cache first
    const cached = this.tokenCache.get(text);
    if (cached !== undefined) {
      return cached;
    }

    const tokenizer = await this.tokenizerPromise;
    if (!tokenizer) return 0;
    try {
      const count = tokenizer.encode(text).length;
      this.tokenCache.set(text, count);
      return count;
    } catch {
      // Fallback: estimate tokens from character count
      const fallback = Math.max(1, Math.round(text.length / 2));
      this.tokenCache.set(text, fallback);
      return fallback;
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
          total += this.calculateImageTokens(part.data, part.mimeType);
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
   * Calculate token cost for an image using OpenAI's
   * tile-based formula.
   *
   * 1. Scale image to fit within 2048×2048 square.
   * 2. Scale so shortest side is 768px.
   * 3. Divide into 512×512 tiles: ceil(w/512) × ceil(h/512).
   * 4. Total = tiles × 170 + 85.
   *
   * @param data - Raw image file bytes.
   * @param mimeType - MIME type (e.g. `image/png`).
   * @returns Estimated token count.
   */
  private calculateImageTokens(data: Uint8Array, mimeType: string): number {
    let width: number;
    let height: number;
    try {
      ({ width, height } = getImageDimensions(data, mimeType));
    } catch {
      // Fallback: use 2000 as a safe overestimate. This
      // covers up to ~120 tiles (~30000×768 extreme
      // panorama), ensuring the user isn't under-billed
      // when dimensions can't be parsed (e.g. unsupported
      // format, corrupted data).
      return 2000;
    }

    if (width <= 0 || height <= 0) {
      return 85; // single-tile base cost for degenerate images
    }

    // Step 1: Scale to fit within 2048×2048
    if (width > 2048 || height > 2048) {
      const scale = 2048 / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    // Step 2: Scale so shortest side is 768
    const scale = 768 / Math.min(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);

    // Step 3: Compute tiles
    const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);

    // Step 4: Token cost (OpenAI formula)
    return tiles * 170 + 85;
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
