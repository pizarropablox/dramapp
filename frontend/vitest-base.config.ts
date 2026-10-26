import { defineConfig } from 'vitest/config';

// Loaded by `ng test` (angular.json > test > runnerConfig); Angular adds the rest of the setup.
export default defineConfig({
  test: {
    // Vitest 5 caches transformed modules in node_modules/.vitest-cache, keyed by the spec's source on
    // disk. Angular hands Vitest a bundle that inlines the code under test, so changing that code without
    // touching the spec reran a stale bundle (totals-page.spec kept testing the pre-DRAMA-47 share data).
    fsModuleCache: false,
  },
});
