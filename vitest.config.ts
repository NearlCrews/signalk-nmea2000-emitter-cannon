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
			// Floor set just under current coverage so PRs can't silently tank it.
			// Raise these numbers as coverage improves; never lower without intent.
			thresholds: {
				statements: 70,
				branches: 55,
				functions: 80,
				lines: 70,
			},
		},
	},
});
