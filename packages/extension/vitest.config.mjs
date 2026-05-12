import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    passWithNoTests: true,
  },
});
//# sourceMappingURL=vitest.config.mjs.map
