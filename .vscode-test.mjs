import { defineConfig } from '@vscode/test-cli';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// macOS limits Unix domain socket paths to 103 chars, and VS Code
// creates its IPC socket inside the user-data dir. The test runner's
// default `.vscode-test/user-data` path exceeds the limit for deeply
// nested workspaces, so VS Code fails to launch. Using a short,
// stable user-data dir under the OS temp directory keeps E2E runs
// working everywhere. The database test resolves the real global
// storage path from the extension's exports, so it follows this
// location automatically.
const E2E_USER_DATA_DIR = join(tmpdir(), 'tokenguard-copilot-e2e');

export default defineConfig({
  files: 'out/test-e2e/**/*.test.js',
  mocha: {
    timeout: 20000,
  },
  launchArgs: [
    '--enable-proposed-api=adguard.tokenguard-copilot',
    `--user-data-dir=${E2E_USER_DATA_DIR}`,
  ],
});
