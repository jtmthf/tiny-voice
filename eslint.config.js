// @ts-check
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import unicorn from 'eslint-plugin-unicorn';

export default tseslint.config(
  // Global ignores
  {
    ignores: ['.next/**', 'node_modules/**', 'dist/**', '*.cjs'],
  },

  // Base TypeScript strict + stylistic
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,

  // Main rules for all TS files
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      'import-x': importX,
      unicorn,
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // import-x rules
      'import-x/no-default-export': 'error',
      'import-x/no-cycle': 'error',

      // unicorn filename convention — kebab-case with leading underscore allowed
      'unicorn/filename-case': [
        'error',
        {
          case: 'kebabCase',
          ignore: [
            // Next.js conventional files
            'layout\\.tsx$',
            'page\\.tsx$',
            'route\\.ts$',
            'loading\\.tsx$',
            'error\\.tsx$',
            'not-found\\.tsx$',
            'next-env\\.d\\.ts$',
          ],
        },
      ],

      // TODO: eslint-plugin-filenames-simple for filename-matches-export.
      // If it proves unreliable with flat config, scripts/check-filenames.ts covers it.
    },
  },

  // Relax rules for config files and scripts at root
  {
    files: ['*.config.ts', '*.config.js', 'scripts/**'],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },

  // Relax rules for Next.js App Router files (they require default exports)
  {
    files: ['src/app/**/*.tsx', 'src/app/**/*.ts'],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },

  // Relax rules for test files
  {
    files: ['**/*.test.ts', '**/*.property.test.ts'],
    rules: {
      'import-x/no-default-export': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
