import assert from "node:assert/strict";
import { inlinedPackages, metafileBuildArgs } from "./plugin-bundle-packages.mjs";

const command =
	"esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.mjs --external:rxjs";
assert.deepEqual(metafileBuildArgs(command, "/scratch/index.mjs", "/scratch/meta.json"), [
	"src/index.ts",
	"--bundle",
	"--platform=node",
	"--format=esm",
	"--outfile=/scratch/index.mjs",
	"--external:rxjs",
	"--metafile=/scratch/meta.json",
	"--log-level=warning",
]);
assert.throws(() => metafileBuildArgs(`${command} --define:X='"y"'`, "o", "m"), /quoting/);
assert.throws(() => metafileBuildArgs("tsc -p .", "o", "m"), /esbuild directly/);
assert.throws(() => metafileBuildArgs("esbuild src/index.ts --bundle", "o", "m"), /one --outfile/);

assert.deepEqual(
	inlinedPackages({
		outputs: {
			"dist/index.mjs": {
				inputs: {
					"src/index.ts": { bytesInOutput: 900 },
					"node_modules/@sinclair/typebox/build/esm/index.mjs": { bytesInOutput: 120 },
					"node_modules/@sinclair/typebox/build/esm/type/index.mjs": { bytesInOutput: 80 },
					"node_modules/a/node_modules/nested-pkg/index.js": { bytesInOutput: 10 },
					"node_modules/tree-shaken/index.js": { bytesInOutput: 0 },
				},
			},
		},
	}),
	["@sinclair/typebox", "nested-pkg"],
);
assert.deepEqual(inlinedPackages({ outputs: {} }), []);
assert.deepEqual(inlinedPackages(undefined), []);

process.stdout.write("Plugin bundle package tests passed.\n");
