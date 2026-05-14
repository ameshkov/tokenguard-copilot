import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  tags: ['-internal'],
  sentry: false,
  ignoreDependencies: [
    // Peer dependency of @vscode/test-cli, loaded at runtime.
    '@vscode/test-electron',
  ],
  workspaces: {
    '.': {
      entry: ['test-e2e/**/*.test.ts!'],
      project: ['test-e2e/**/*.ts!'],
    },
    'packages/shared': {
      project: ['src/**/*.ts!', '!src/**/*.test.ts'],
    },
    'packages/extension': {
      entry: ['src/extension.ts!'],
      // Module barrel files are not yet imported but exist for
      // structural convention. Exclude from unused-files check.
      // TODO: remove this ignore once barrels are consumed by
      // upper layers.
      ignore: ['src/**/index.ts'],
      ignoreDependencies: [
        // Provided by the VS Code extension host at runtime.
        'vscode',
      ],
      project: ['src/**/*.ts!', '!src/**/*.test.ts', '!src/test/**'],
    },
    'packages/webview-ui': {
      entry: ['src/index.tsx!'],

      project: ['src/**/*.{ts,tsx}!', '!src/**/*.test.{ts,tsx}'],
    },
  },
};

export default config;
