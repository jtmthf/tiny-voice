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
        const base = path
          .basename(file)
          .replace(/\.(test|property\.test|spec)\.[tj]sx?$/, '')
          .replace(/\.[tj]sx?$/, '');
        // Skip index files, reserved filenames, type-only declaration files.
        const skip = [
          'index',
          'layout',
          'page',
          'route',
          'loading',
          'error',
          'not-found',
          'middleware',
          'router',
          'instance',
          'dto',
          'error-messages',
          'fixtures',
        ];
        if (skip.includes(base)) return;
        if (file.endsWith('.d.ts')) return;
        // Skip test-support collection files under **/testing/ (factories.ts, arbitraries.ts, fixtures.ts).
        if (/[/\\]testing[/\\]/.test(file)) return;
        // Skip TanStack Router route files and generated routeTree
        if (file.includes('/routes/') || file.endsWith('routeTree.gen.ts')) return;
        // Skip server-function and query grouping directories
        if (/[/\\]fns[/\\]/.test(file) || /[/\\]queries[/\\]/.test(file)) return;
        if (exportNames.length === 0) return; // nothing to compare against
        const want = normalize(base);
        const hit = exportNames.some((n) => normalize(n) === want);
        if (!hit) {
          context.report({
            node,
            messageId: 'mismatch',
            data: {
              file: base,
              expected: base.replace(/(^|-)(.)/g, (_, __, c) => c.toUpperCase()),
            },
          });
        }
      },
    };
  },
};
const localPlugin = { rules: { 'filename-matches-export': filenameMatchesExport } };

// `no-restricted-syntax` does not merge across config blocks — the last block
// that sets it wins outright. These selectors are composed explicitly into each
// block below so that narrowing one concern never silently drops another.
const noUnsafeUnwrap = [
  {
    selector: "MemberExpression[property.name='_unsafeUnwrap']",
    message:
      "Don't use _unsafeUnwrap. In tests use expectOk from @/shared/testing/expect-ok. In production handle the Result or fix the type design so the operation is infallible.",
  },
  {
    selector: "MemberExpression[property.name='_unsafeUnwrapErr']",
    message:
      "Don't use _unsafeUnwrapErr. In tests use expectErr from @/shared/testing/expect-err. In production handle the Result branch explicitly.",
  },
];

const noThrowInDomain = {
  selector: 'ThrowStatement',
  message:
    'Domain code returns Result<T, DomainError> (AGENTS.md rule 1). Throw only for infrastructure failures, which belong in adapters.',
};

const noBrandCast = {
  selector:
    'TSAsExpression > TSTypeReference[typeName.name=/^(EmailAddress|TaxRate|DueDate|YearMonth|Id)$/]',
  message:
    'Do not cast into a branded type. Parse it through the value object, or — when the value is valid by construction — use its .trusted() with a comment saying why (src/shared/domain/).',
};

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      '.output/**',
      'node_modules/**',
      'dist/**',
      '*.cjs',
      'src/app/routeTree.gen.ts',
      '.agents/**',
      '.opencode/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },

  // Base TypeScript strict + stylistic (type-checked variants — projectService
  // is already configured below, so full type information is available)
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Type-aware rules need type info; these files aren't part of the TS project
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },

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
          allowDefaultProject: ['vitest.config.ts', '*.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Deprecated API detection
      '@typescript-eslint/no-deprecated': 'error',

      // strictTypeChecked already enables ban-ts-comment; require a real
      // explanation (10+ chars) on any @ts-expect-error instead of a bare one.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-expect-error': 'allow-with-description', minimumDescriptionLength: 10 },
      ],

      // number/bigint have unambiguous, lossless string forms — permit them
      // in template literals. bigint has no allow* option in this
      // typescript-eslint version because the rule already allows it
      // unconditionally. Do NOT add allowAny/allowNullish/allowBoolean;
      // those are the cases where interpolation hides a bug.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      // import-x rules
      'import-x/no-default-export': 'error',
      'import-x/no-cycle': 'error',

      // unicorn filename convention — kebab-case with TanStack Router conventions allowed
      'unicorn/filename-case': [
        'error',
        {
          case: 'kebabCase',
          ignore: ['__root\\.tsx$', '\\$[a-z]', 'routeTree\\.gen\\.ts$'],
        },
      ],

      // Enforce kebab-case filenames via check-file
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.{ts,tsx}': 'KEBAB_CASE' },
        { ignoreMiddleExtensions: true },
      ],
      'check-file/folder-naming-convention': ['error', { 'src/**/': 'KEBAB_CASE' }],

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
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: true,
        },
      ],

      // One path convention, not two: relative imports are for siblings and
      // direct children only. Anything further away uses the '@/' alias.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*', '../../../*'],
              message:
                "Use the '@/' alias for cross-directory imports. Relative imports are for siblings and direct children only.",
            },
          ],
        },
      ],

      // Ban neverthrow's escape hatches — use expectOk/expectErr (tests) or
      // pattern matching / type-level guarantees (production) instead — and
      // hand-rolled brand casts, which the domain kit replaces.
      'no-restricted-syntax': ['error', ...noUnsafeUnwrap, noBrandCast],
    },
  },

  // Domain code returns Result<T, DomainError> (AGENTS.md rule 1); throw only
  // for infrastructure failures, which belong in adapters.
  {
    files: [
      'src/{clients,invoicing,reporting}/{entities,commands,queries,value-objects,errors,ports}/**/*.ts',
      'src/shared/{money,ids,time,outcome}/**/*.ts',
    ],
    ignores: ['**/*.test.ts', '**/*.property.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', noThrowInDomain, ...noUnsafeUnwrap, noBrandCast],
    },
  },

  // The domain kit is where `trusted` lives, so it is the one place a brand
  // cast is sanctioned. It is still domain code: no throwing.
  {
    files: ['src/shared/domain/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.property.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', noThrowInDomain, ...noUnsafeUnwrap],
    },
  },

  // Test support (factories, arbitraries) and the kit's own tests construct
  // known-valid values directly; they may cast and may throw.
  {
    files: [
      'src/shared/domain/**/*.test.ts',
      'src/shared/domain/**/*.property.test.ts',
      '**/testing/**/*.ts',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...noUnsafeUnwrap],
    },
  },

  // Relax rules for config files, scripts, and e2e infrastructure
  {
    files: [
      '*.config.ts',
      '*.config.js',
      'scripts/**',
      'e2e/**/*.config.ts',
      'e2e/global-setup.ts',
    ],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },

  // Relax rules for TanStack Router route files and app layer (Route const export)
  {
    files: ['src/app/**/*.tsx', 'src/app/**/*.ts'],
    rules: {
      'import-x/no-default-export': 'off',
    },
  },

  // TanStack Router special filenames (__root.tsx, $id.tsx) aren't kebab-case
  {
    files: ['src/app/routes/**/__root.{ts,tsx}', 'src/app/routes/**/$*.{ts,tsx}'],
    rules: {
      'check-file/filename-naming-convention': 'off',
    },
  },

  // Relax rules for test files
  {
    files: ['**/*.test.ts', '**/*.property.test.ts', '**/*.spec.ts'],
    rules: {
      'import-x/no-default-export': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
