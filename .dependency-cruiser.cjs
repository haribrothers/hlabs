// Dependency rules from docs/prd/03-monorepo.md §Dependency rules. Run with `pnpm boundaries`.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'packages-never-import-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'apps-never-import-other-apps',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'api-only-zod-trpc-shared',
      comment: 'packages/api holds contracts only: zod, @trpc/server (router definitions) and @hlabs/shared.',
      severity: 'error',
      from: { path: '^packages/api/src/' },
      to: {
        pathNot: ['^packages/(api|shared)/', 'node_modules/.*(zod|@trpc/server)/'],
      },
    },
    {
      name: 'db-only-from-daemon',
      severity: 'error',
      from: { path: '^(apps|packages)/', pathNot: '^(apps/daemon|packages/db)/' },
      to: { path: '^packages/db/' },
    },
    {
      name: 'ui-has-no-data-fetching',
      severity: 'error',
      from: { path: '^packages/ui/' },
      to: { path: ['node_modules/.*(@trpc|@tanstack/react-query)/', '^packages/api/'] },
    },
    {
      name: 'site-never-calls-hlabs',
      severity: 'error',
      from: { path: '^apps/site/' },
      to: { path: '^(packages/api|packages/db|apps/daemon)/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|node_modules|coverage|src-tauri|\\.astro)/' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
