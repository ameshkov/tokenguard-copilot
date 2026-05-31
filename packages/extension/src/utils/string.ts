/**
 * Truncates a string to a maximum length, appending
 * "..." if truncated.
 *
 * @param value - The string to truncate.
 * @param maxLength - Maximum length including the "..." suffix.
 * @returns The truncated string.
 */
export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength) + '...';
}
