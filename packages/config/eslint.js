// Shared ESLint flat config for the hlabs workspace.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  // The dashboard built for the e2e pwa project (US-INST-28).
  '**/dist-pwa/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/.dev-data/**',
  '**/src-tauri/target/**',
  // The daemon bundle scripts/bundle-app.ts assembles for the app (D-113).
  '**/src-tauri/resources/**',
  '**/playwright-report/**',
  '**/test-results/**',
  '**/routeTree.gen.ts',
  '**/.astro/**',
  // The website built for its own tests, and what that build is made from (apps/site/e2e/build.ts).
  'apps/site/dist-e2e/**',
  'apps/site/dist-e2e-beta/**',
  'apps/site/.e2e/**',
  'docs/**',
];

export default tseslint.config(
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // The dashboard and the menu-bar app run in a browser: every @hlabs/api module loads the server's tRPC builder
    // (which refuses to run there), so they take only types from it; shared values live in @hlabs/shared.
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/tray/src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@hlabs/api', '@hlabs/api/*'],
              allowTypeImports: true,
              message:
                'Only types from @hlabs/api in the browser (it loads server code); put shared values in @hlabs/shared.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
