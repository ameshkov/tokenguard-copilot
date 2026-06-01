/**
 * Builds the User-Agent header string used for all outbound
 * HTTP requests made by the extension.
 *
 * @param version - The extension version from package.json.
 *   Defaults to `'0.0.0'` when not provided or when an
 *   empty string is passed.
 * @returns User-Agent string in the format
 *   `TokenGuardCopilot/v{version}`.
 */
export function buildUserAgent(version?: string): string {
  return `TokenGuardCopilot/v${version && version.length > 0 ? version : '0.0.0'}`;
}
