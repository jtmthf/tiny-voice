// @ts-check
import path from 'node:path';
import tseslint from 'typescript-eslint';
import importX from 'eslint-plugin-import-x';
import unicorn from 'eslint-plugin-unicorn';
import checkFile from 'eslint-plugin-check-file';
import barrelFiles from 'eslint-plugin-barrel-files';

// Inline rule: filename must match a named export (case-insensitive, ignoring `-` and `_`).
// No ESLint 10 plugin does this — `eslint-plugin-filename-export` uses the removed
// `context.getFilename()` API. This rule uses the current `context.filename` and
// covers the same semantics: files with at least one named export whose name matches
// the file's basename (stripped of separators, case-insensitive) pass.
const normalize = (s) => s.replace(/[-_]/g, '').toLowerCase();
const filenameMatchesExport = {
  meta: {
    type: 'problem',
    docs: { description: 'Filename must match at least one named export.' },
    schema: [],
    messages: {
      mismatch:
        "Filename '{{file}}' does not match any named export. Expected an export like '{{expected}}'.",
    },
  },
  create(context) {
    const exportNames = [];
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration) {
          // export const foo = / export function foo() / export class Foo
          if (node.declaration.type === 'VariableDeclaration') {
            for (const d of node.declaration.declarations) {
              if (d.id?.type === 'Identifier') exportNames.push(d.id.name);
            }
          } else if (node.declaration.id?.type === 'Identifier') {
            exportNames.push(node.declaration.id.name);
          }
        }
        for (const spec of node.specifiers ?? []) {
          if (spec.exported?.type === 'Identifier') exportNames.push(spec.exported.name);
        }
      },
      'Program:exit'(node) {
        const file = context.filename;
        const base = path.basename(file).replace(/\.(test|property\.test|spec)\.[tj]sx?$/, '').replace(/\.[tj]sx?$/, '');
        // Skip index files, Next.js reserved filenames, type-only declaration files.
        const skip = ['index', 'layout', 'page', 'route', 'loading', 'error', 'not-found', 'middleware'];
        if (skip.includes(base)) return;
        if (file.endsWith('.d.ts')) return;
        // Skip test-support collection files under **/testing/ (factories.ts, arbitraries.ts, fixtures.ts).
        if (/[/\\]testing[/\\]/.test(file)) return;
        if (exportNames.length === 0) return; // nothing to compare against
        const want = normalize(base);
        const hit = exportNames.some((n) => normalize(n) === want);
        if (!hit) {
          context.report({
            node,
            messageId: 'mismatch',
            data: { file: base, expected: base.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase()) },
          });
        }
      },
    };
  },
};
const localPlugin = { rules: { 'filename-matches-export': filenameMatchesExport } };

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
      'check-file': checkFile,
      'barrel-files': barrelFiles,
      local: localPlugin,
    },
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.ts', '*.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Deprecated API detection
      '@typescript-eslint/no-deprecated': 'error',

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

      // Enforce kebab-case filenames via check-file (replaces filenames-simple which needs ESLint <9)
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.{ts,tsx}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': [
        'error',
        { 'src/**/': 'NEXT_JS_APP_ROUTER_CASE' },
      ],

      // Filename must match a named export. See inline rule at top of this file for rationale.
      'local/filename-matches-export': 'error',

      // No barrel files (index.ts that only re-export from siblings)
      'barrel-files/avoid-barrel-files': 'error',

      // Async safety
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // Exhaustive switches on union types
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Enforce import type for type-only imports
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
        disallowTypeAnnotations: true,
      }],

      // Ban neverthrow's escape hatches — use expectOk/expectErr (tests) or
      // pattern matching / type-level guarantees (production) instead.
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='_unsafeUnwrap']",
          message: "Don't use _unsafeUnwrap. In tests use expectOk from @/shared/testing/expect-ok. In production handle the Result or fix the type design so the operation is infallible.",
        },
        {
          selector: "MemberExpression[property.name='_unsafeUnwrapErr']",
          message: "Don't use _unsafeUnwrapErr. In tests use expectErr from @/shared/testing/expect-err. In production handle the Result branch explicitly.",
        },
      ],

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
