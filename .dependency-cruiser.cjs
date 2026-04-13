/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No circular dependencies allowed.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Files that are not imported by any other file.',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)index\\.ts$',
          '\\.test\\.ts$',
          '\\.property\\.test\\.ts$',
          '^src/app/',
        ],
      },
      to: {},
    },
    {
      name: 'domain-no-adapters',
      severity: 'error',
      comment:
        'Domain code (entities, commands, queries, ports) must not depend on adapters or app layer.',
      from: {
        path: '^src/(clients|invoicing|reporting)/(entities|commands|queries|ports)',
      },
      to: {
        path: [
          '^src/(clients|invoicing|reporting)/adapters',
          '^src/app/',
        ],
      },
    },
    {
      name: 'no-cross-module-internals',
      severity: 'error',
      comment:
        'Modules may only import from other modules via their index.ts barrel.',
      from: {
        path: '^src/(clients|invoicing|reporting)/',
      },
      to: {
        path: '^src/(clients|invoicing|reporting)/',
        pathNot: [
          // Allow imports within the same module (handled by "from" path prefix match)
          // Allow imports of other modules' index.ts
          '^src/(clients|invoicing|reporting)/index\\.ts$',
        ],
      },
      module: {
        // Only flag when importing a DIFFERENT module's internals
        pathNot: '^src/$1/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
};
