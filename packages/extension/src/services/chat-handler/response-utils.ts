/**
 * Shared response validation utilities used by both the
 * streaming and non-streaming handlers.
 */

import { truncate } from '../../utils/index.js';
import type { Logger } from '../../logger/index.js';

/** Maximum length of error response body text included in error messages. */
const MAX_ERROR_TEXT_LENGTH = 128;

/**
 * Validates an HTTP response is OK (`response.ok`).
 * Reads the error body on failure and throws an Error
 * with a truncated copy of the body text.
 *
 * The full error body is logged via the optional logger
 * before it is truncated for the error message.
 *
 * @param response - The fetch Response object.
 * @param logger - Optional logger for full body logging.
 * @throws Error with status code and truncated body text
 *   if the response is not OK.
 */
export async function validateHttpResponse(response: Response, logger?: Logger): Promise<void> {
  if (response.ok) return;

  const errorText = await response.text().catch(() => '');
  logger?.error(
    `HTTP ${response.status} ${response.statusText} response body:`,
    errorText || '(empty)',
  );
  throw new Error(
    `${response.status} ${response.statusText}` +
      (errorText ? `: ${truncate(errorText, MAX_ERROR_TEXT_LENGTH)}` : ''),
  );
}
