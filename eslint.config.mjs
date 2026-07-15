import tseslint from "typescript-eslint";

const typedRules = {
	"@typescript-eslint/await-thenable": "error",
	"@typescript-eslint/no-floating-promises": "error",
	"@typescript-eslint/no-misused-promises": "error",
};

export default tseslint.config(
	{
		ignores: [
			".cache/**",
			".cave/**",
			".claude/**",
			".remember/**",
			"coverage/**",
			"dist/**",
			"docs/superpowers/**",
			"public/**",
			"temp/**",
			"tmp/**",
		],
	},
	{
		files: ["src/**/*.{ts,tsx}"],
		ignores: ["src/test/**", "**/*.{test,spec}.ts", "**/*.{test,spec}.tsx"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: ["./tsconfig.json", "./tsconfig.panel.json"],
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			"@typescript-eslint": tseslint.plugin,
		},
		rules: typedRules,
	},
);
