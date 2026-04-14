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
        pathNot: '\\.test\\.ts$',
      },
      to: {
        path: [
          '^src/(clients|invoicing|reporting)/adapters',
          '^src/app/',
        ],
      },
    },
    {
      name: 'no-clients-into-invoicing-internals',
      severity: 'error',
      comment: 'clients may only import from invoicing/index.ts.',
      from: { path: '^src/clients/' },
      to: { path: '^src/invoicing/(?!index\\.ts$)' },
    },
    {
      name: 'no-clients-into-reporting-internals',
      severity: 'error',
      comment: 'clients may only import from reporting/index.ts.',
      from: { path: '^src/clients/' },
      to: { path: '^src/reporting/(?!index\\.ts$)' },
    },
    {
      name: 'no-invoicing-into-clients-internals',
      severity: 'error',
      comment: 'invoicing may only import from clients/index.ts.',
      from: { path: '^src/invoicing/' },
      to: { path: '^src/clients/(?!index\\.ts$)' },
    },
    {
      name: 'no-invoicing-into-reporting-internals',
      severity: 'error',
      comment: 'invoicing may only import from reporting/index.ts.',
      from: { path: '^src/invoicing/' },
      to: { path: '^src/reporting/(?!index\\.ts$)' },
    },
    {
      name: 'no-reporting-into-clients-internals',
      severity: 'error',
      comment: 'reporting may only import from clients/index.ts.',
      from: { path: '^src/reporting/' },
      to: { path: '^src/clients/(?!index\\.ts$)' },
    },
    {
      name: 'no-reporting-into-invoicing-internals',
      severity: 'error',
      comment: 'reporting may only import from invoicing/index.ts.',
      from: { path: '^src/reporting/' },
      to: { path: '^src/invoicing/(?!index\\.ts$)' },
    },
    {
      name: 'no-next-outside-app',
      severity: 'error',
      comment:
        'next/* imports are framework concerns and must stay in src/app/. Domain modules and shared kernel must not depend on Next.js.',
      from: {
        path: '^src/(clients|invoicing|reporting|shared)/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: '^next/' },
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
