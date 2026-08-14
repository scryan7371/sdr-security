import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**", "src/integration/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/index.ts",
        "src/drizzle/schema.ts",
        "src/drizzle/migration-schema.ts",
        "src/drizzle/runtime-schema.ts",
        "src/drizzle/schemas/**/*.ts",
        "src/nest/contracts.ts",
        "src/nest/security-auth.options.ts",
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 70,
      },
    },
  },
});
