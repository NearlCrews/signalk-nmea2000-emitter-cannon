// Cross-platform replacement for the previous unix-only clean step
// ("rm -rf dist && rm -f public/*.js public/*.mjs public/*.LICENSE.txt
// public/*.map"). Runs on Linux, macOS, and Windows CI runners alike.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

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
