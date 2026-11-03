/**
 * Pattern matching an unpaired UTF-16 surrogate: a leading surrogate
 * not followed by a trailing surrogate, or a trailing surrogate not
 * preceded by a leading surrogate.
 */
const UNPAIRED_SURROGATE_PATTERN =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * Replaces unpaired UTF-16 surrogates in a string with U+FFFD
 * (replacement character).
 *
 * VS Code chat history can carry such strings, e.g. when a tool
 * result was truncated in the middle of an astral character and only
 * half of its surrogate pair survived. JSON.stringify serializes a
 * lone surrogate as an escape like "\ud83d", which is grammatically
 * valid JSON but ill-formed Unicode: strict JSON parsers such as
 * Rust's serde (used by vLLM servers) reject it with a 400 error,
 * failing every request that includes the affected message.
 *
 * @param value - The string to sanitize.
 * @returns The string with unpaired surrogates replaced by U+FFFD.
 */
export function replaceUnpairedSurrogates(value: string): string {
  return value.replace(UNPAIRED_SURROGATE_PATTERN, '\uFFFD');
}

/**
 * JSON.stringify replacer that replaces unpaired UTF-16 surrogates
 * in every serialized string value with U+FFFD.
 *
 * Intended for request bodies sent to OpenAI-compatible backends so
 * that ill-formed Unicode carried over from VS Code chat history
 * cannot produce JSON that strict parsers reject.
 *
 * @param _key - The property being serialized (unused).
 * @param value - The property value being serialized.
 * @returns Strings with unpaired surrogates replaced by U+FFFD,
 * other values unchanged.
 */
export function unpairedSurrogateReplacer(_key: string, value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return replaceUnpairedSurrogates(value);
}
