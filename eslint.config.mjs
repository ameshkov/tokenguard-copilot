import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['out/', 'dist/', '.vscode-test/'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
