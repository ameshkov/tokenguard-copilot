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
    rules: {
      // TODO: The target values are 50 and 300 for function and files, they
      // should be reduced gradually.
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      // Using larger values for .tsx files as they tend to be larger as they
      // also include layout code.
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.test.mts'],
    rules: {
      // TODO: They should be enabled eventually (only max-lines).
      'max-lines': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    files: ['**/*.mjs'],
    ...eslint.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
  },
);
