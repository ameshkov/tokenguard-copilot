import { vi } from 'vitest';
import type { ExtensionContext as AppContext } from '../context.js';

/** HTML snippet used by node:fs mock. */
export const FAKE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'nonce-{{nonce}}'; style-src {{cspSource}} 'unsafe-inline';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TokenGuard Copilot Settings</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="{{nonce}}" src="{{scriptUri}}"></script>
  </body>
</html>`;

/**
 * Creates a minimal mock webview suitable for passing to
 * handler functions.
 *
 * @returns A mock object with a `postMessage` spy and
 *   supporting properties.
 */
export function createMockWebview() {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    asWebviewUri: vi.fn((uri: unknown) => uri),
    cspSource: 'https://test.csp.source',
    html: '',
    onDidReceiveMessage: vi.fn(),
  };
}

/**
 * Creates a mock {@link AppContext} with all services
 * pre-configured as Vitest spies.
 *
 * @returns A mock application context.
 */
export function createMockAppCtx(): AppContext {
  return {
    contentRules: {
      getAll: vi.fn().mockReturnValue([]),
      getById: vi.fn().mockReturnValue(undefined),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockReturnValue(false),
      reorder: vi.fn(),
      validateName: vi.fn().mockReturnValue(false),
    },
    providerManager: {
      getProviders: vi.fn().mockReturnValue([]),
      addProvider: vi.fn(),
      editProvider: vi.fn(),
      removeProvider: vi.fn(),
      resetAll: vi.fn(),
    },
    modelRegistry: {
      getModels: vi.fn().mockReturnValue([]),
      fetchModels: vi.fn().mockResolvedValue([]),
      addModel: vi.fn(),
      updateModel: vi.fn(),
      removeModel: vi.fn(),
    },
    chatDebugSettings: {
      getSettings: vi.fn().mockReturnValue({
        enabled: false,
        ttlHours: 24,
      }),
      updateSettings: vi.fn().mockReturnValue({
        enabled: true,
        ttlHours: 24,
      }),
    },
    chatDebugCleanup: {
      clearAll: vi.fn(),
    },
  } as unknown as AppContext;
}
