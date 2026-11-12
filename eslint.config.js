import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      '.tools/**',
      'audio/**',
      'audio-effects/**',
      'src-tauri/**',
      'node_modules/**',
      'artifacts/**',
      'test-results/**',
      'playwright-report/**',
      // Other tools' copies of the repository.
      '.kilo/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        window: 'readonly',
        document: 'readonly',
      },
    },
  },
);
