/**
 * Safely parses a JSON string array.
 *
 * Returns an empty array if the input is null, empty, or
 * invalid JSON.
 *
 * @param raw - The JSON string to parse.
 * @returns The parsed string array, or an empty array.
 */
export function safeParseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string');
    }
    return [];
  } catch {
    return [];
  }
}
