// Cross-platform replacement for the previous unix-only clean step
// ("rm -rf dist && rm -f public/*.js public/*.mjs public/*.LICENSE.txt
// public/*.map"). Runs on Linux, macOS, and Windows CI runners alike.
//
// Two scopes, because the two callers want different things:
//
// --build (what `npm run build` and `npm run build:watch` use) removes only
// what the next build regenerates. It must stay this narrow: `npm run verify`
// runs `test:coverage` before `build`, so a wider clean here would delete the
// coverage report the chain just produced.
//
// The default scope is the one a person types. It adds the generated
// directories a developer means by "clean": the coverage and Vitest report
// output, the tool caches, the release tarball directory, and the TypeScript
// incremental state. Every one is gitignored and regenerates on demand.
// `node_modules` is deliberately not included; reinstalling is `npm ci`.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const buildOnly = process.argv.includes("--build");

// Drop the bundled plugin output.
rmSync("dist", { recursive: true, force: true });

// Drop the generated panel bundles, leaving any non-build files in place.
if (existsSync("public")) {
	for (const name of readdirSync("public")) {
		if (/\.(?:js|mjs|map)$/.test(name) || name.endsWith(".LICENSE.txt")) {
			rmSync(join("public", name), { force: true });
		}
	}
}

if (!buildOnly) {
	for (const directory of ["coverage", ".vitest", ".cache", "artifacts"]) {
		rmSync(directory, { recursive: true, force: true });
	}
	// tsc incremental state, written beside the tsconfig that produced it.
	for (const name of readdirSync(".")) {
		if (name.endsWith(".tsbuildinfo")) rmSync(name, { force: true });
	}
}
