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
      name: 'no-clients-into-other-adapters',
      severity: 'error',
      comment:
        'clients must not import adapters from invoicing or reporting.',
      from: { path: '^src/clients/' },
      to: { path: '^src/(invoicing|reporting)/adapters/' },
    },
    {
      name: 'no-invoicing-into-other-adapters',
      severity: 'error',
      comment:
        'invoicing must not import adapters from clients or reporting.',
      from: { path: '^src/invoicing/' },
      to: { path: '^src/(clients|reporting)/adapters/' },
    },
    {
      name: 'no-reporting-into-other-adapters',
      severity: 'error',
      comment:
        'reporting must not import adapters from clients or invoicing.',
      from: { path: '^src/reporting/' },
      to: { path: '^src/(clients|invoicing)/adapters/' },
    },
    {
      name: 'no-shared-into-app',
      severity: 'error',
      comment:
        'Shared kernel must not depend on the app layer.',
      from: {
        path: '^src/shared/',
        pathNot: '\\.test\\.ts$',
      },
      to: { path: '^src/app/' },
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
