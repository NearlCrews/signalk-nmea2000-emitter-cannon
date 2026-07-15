module.exports = {
	forbidden: [
		{
			name: "no-circular",
			severity: "error",
			comment: "Circular dependencies make the module graph difficult to reason about.",
			from: {},
			to: { circular: true },
		},
		{
			name: "runtime-does-not-import-panel",
			severity: "error",
			comment: "The Node plugin runtime must not pull browser-only panel code into its bundle.",
			from: {
				path: "^src/(?!panel(?:/|$)|test(?:/|$))",
			},
			to: { path: "^src/panel" },
		},
		{
			name: "panel-does-not-import-runtime",
			severity: "error",
			comment: "The browser panel may share pure types and helpers, but not Node plugin services.",
			from: { path: "^src/panel" },
			to: {
				path: "^src/(advisor|conversions|index\\.ts|plugin-manager\\.ts)",
			},
		},
		{
			name: "production-does-not-import-tests",
			severity: "error",
			comment: "Production modules must not depend on test-only helpers.",
			from: { path: "^src/(?!test(?:/|$))" },
			to: { path: "^src/test" },
		},
	],
	options: {
		tsConfig: { fileName: "tsconfig.json" },
		doNotFollow: { path: "node_modules" },
	},
};
