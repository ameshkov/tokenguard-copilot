/**
 * Type declarations for the VS Code proposed
 * `languageModelThinkingPart` API.
 *
 * `LanguageModelThinkingPart` exists at runtime in both
 * stable and Insiders VS Code builds but is not yet
 * included in the stable `@types/vscode`. This module
 * augmentation provides compile-time type safety.
 */
declare module 'vscode' {
  /**
   * A language model response part containing
   * thinking/reasoning content. Thinking tokens
   * represent the model's internal reasoning process
   * that typically streams before the final response.
   */
  export class LanguageModelThinkingPart {
    /**
     * The thinking/reasoning text content.
     */
    value: string | string[];

    /**
     * Optional unique identifier for this thinking
     * sequence.
     */
    id?: string;

    /**
     * Optional metadata associated with this thinking
     * sequence.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: { readonly [key: string]: any };

    /**
     * Construct a thinking part with the given content.
     *
     * @param value - The thinking text content.
     * @param id - Optional unique identifier for this
     *   thinking sequence.
     * @param metadata - Optional metadata associated
     *   with this thinking sequence.
     */
    constructor(
      value: string | string[],
      id?: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata?: { readonly [key: string]: any },
    );
  }
}
