import { defineConfig } from "vitest/config";

// V1.1-2 test kind-split. Classification rule (mechanical): a file is
// `integration` when it touches Postgres (`withDb`, `seedDataAvailable`,
// `ALLOW_DESTRUCTIVE_DB_TESTS`), the Docker daemon (live sandbox paths),
// or dataset-gated shape-runners (`dataset === null` skips); everything else
// is `unit`. New test files default to `unit` - add them here only when
// they touch infra. `e2e` (compose boot + probes) lives in `tests/e2e/`.
const integrationFiles = [
  "apps/api/tests/skill-update.test.ts",
  "apps/api/tests/curriculum.test.ts",
  "apps/api/tests/learning-loop.test.ts",
  "apps/api/tests/session-context.test.ts",
  "apps/api/tests/transcript.test.ts",
  "apps/api/tests/recommendation.test.ts",
  "apps/api/tests/voice-session.test.ts",
  "apps/api/tests/loop-verification.test.ts",
  "apps/api/tests/sandbox.test.ts",
  "apps/api/tests/python-runners.test.ts",
  "apps/api/tests/cpp-runners.test.ts",
  "apps/api/tests/javascript-runners.test.ts",
  "packages/store/tests/persistence.test.ts",
  "packages/store/tests/problem-content.test.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["apps/**/*.test.{ts,tsx}", "packages/**/*.test.{ts,tsx}"],
          // Custom `include` replaces default discovery: re-assert the
          // node_modules guard so symlinked workspace packages (e.g.
          // apps/api/node_modules/@interview-coach/store) and nested
          // dependency tests (zod's own suite) are never collected.
          exclude: [...integrationFiles, "tests/e2e/**", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "integration",
          include: integrationFiles,
        },
      },
      {
        test: {
          name: "e2e",
          include: ["tests/e2e/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
