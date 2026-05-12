import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['out/', 'dist/', '.vscode-test/', 'packages/*/dist/'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
  },
  {
    files: ['**/*.mjs'],
    ...eslint.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
  },
);
