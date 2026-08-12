import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		typecheck: {
			tsconfig: "./tsconfig.json",
		},
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: ["node_modules/", "dist/", "**/*.test.ts", "**/*.spec.ts"],
			// Global floors follow the verified project baseline. Statements retain
			// their independent floor because the requested policy targets lines,
			// branches, and functions. Per-file thresholds are not used because
			// integration entry points and small display helpers intentionally have
			// much lower isolated coverage.
			thresholds: {
				statements: 85,
				branches: 80,
				functions: 90,
				lines: 90,
			},
		},
	},
});
