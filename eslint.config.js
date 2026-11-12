import js from '@eslint/js';
import lit from 'eslint-plugin-lit';
import litA11y from 'eslint-plugin-lit-a11y';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tmp/**', 'coverage/**', 'storybook-static/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'demo/**/*.ts', 'stories/**/*.ts', '.storybook/**/*.ts', '*.config.ts'],
    plugins: { lit, ...litA11y.configs.recommended.plugins },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...lit.configs.recommended.rules,
      ...litA11y.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // The documentation tooling runs in Node (the build, the tests) and in the browser (Storybook).
    files: ['scripts/docs/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
