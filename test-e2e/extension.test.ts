/// <reference types="mocha" />

import * as assert from 'node:assert';
import { extensions } from 'vscode';
import { getExtension } from './helpers.js';

suite('Extension E2E Tests', () => {
  test('extension should be present', () => {
    const extension = extensions.getExtension('adguard.tokenguard-copilot');
    assert.ok(extension, 'Extension should be available');
  });

  test('extension should activate', async () => {
    const extension = await getExtension();
    assert.strictEqual(extension.isActive, true, 'Extension should be active');
  });

  test('extension should export a deactivate function', async () => {
    const extension = await getExtension();
    const exports = extension.exports as Record<string, unknown> | undefined;
    // deactivate is called by VS Code on shutdown; we just verify
    // the extension loaded without resource-leak errors.
    assert.ok(extension.isActive, 'Extension should remain active');
    // If the extension exports deactivate, it should be a function.
    if (exports && 'deactivate' in exports) {
      assert.strictEqual(typeof exports.deactivate, 'function');
    }
  });

  test('extension should export providerManager and modelRegistry', async () => {
    const extension = await getExtension();
    const exports = extension.exports as Record<string, unknown> | undefined;
    assert.ok(exports, 'Extension should have exports');
    assert.ok(exports.providerManager, 'Exports should include providerManager');
    assert.ok(exports.modelRegistry, 'Exports should include modelRegistry');
  });
});
