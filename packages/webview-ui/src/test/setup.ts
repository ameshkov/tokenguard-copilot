/**
 * Vitest global setup — runs before every test file.
 *
 * Registers mock VSCode Elements custom elements so that
 * testing-library queries work in the jsdom environment.
 */

import { registerMockElements } from './element-mocks.js';

registerMockElements();
