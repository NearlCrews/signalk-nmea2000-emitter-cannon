import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { assertExactVersion, assertSharedUiVersion } from "./shared-ui-version.mjs";

const repositoryRoot = new URL("../", import.meta.url);

function withFixtureRepository(manifestVersion, installedVersion, body) {
	const dir = mkdtempSync(join(tmpdir(), "shared-ui-pin-"));
	try {
		writeFileSync(
			join(dir, "package.json"),
			JSON.stringify({ devDependencies: { "signalk-nearlcrews-ui": manifestVersion } }),
		);
		const installedDir = join(dir, "node_modules", "signalk-nearlcrews-ui");
		mkdirSync(installedDir, { recursive: true });
		writeFileSync(
			join(installedDir, "package.json"),
			JSON.stringify({ version: installedVersion }),
		);
		body(pathToFileURL(`${dir}/`));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// The shape assertion accepts a bare version and rejects everything npm writes
// when someone installs the package without pinning it.
assert.equal(assertExactVersion("0.8.2", "test"), "0.8.2");
assert.equal(assertExactVersion("1.2.3", "test"), "1.2.3");
assert.equal(assertExactVersion("0.10.11", "test"), "0.10.11");
for (const rejected of [
	"^0.8.2",
	"~0.8.2",
	">=0.8.2",
	"0.8.2-rc.1",
	"0.8.2+build.1",
	"0.8",
	"latest",
	"*",
	"",
	undefined,
	null,
	123,
]) {
	assert.throws(() => assertExactVersion(rejected, "test"), /must be an exact version/);
}

// Both assertions report what they received, so a failure names the offending
// value rather than only the value it wanted.
assert.throws(() => assertExactVersion("^0.8.2", "package.json"), /got \^0\.8\.2/);
assert.throws(() => assertExactVersion(undefined, "package.json"), /got undefined/);

// A range in the manifest fails on shape, so pasting it into the constant
// cannot repair the check: the constant is asserted the same way.
withFixtureRepository("^0.8.2", "0.8.2", (repositoryUrl) => {
	assert.throws(
		() => assertSharedUiVersion(repositoryUrl),
		/package\.json must be an exact version/,
	);
});

// An exact but unreviewed version fails on the literal, naming both sides.
withFixtureRepository("0.99.0", "0.99.0", (repositoryUrl) => {
	assert.throws(() => assertSharedUiVersion(repositoryUrl), /pins signalk-nearlcrews-ui 0\.99\.0/);
});

// The repository's own pin agrees with the constant and the installed package.
const pinned = assertExactVersion(assertSharedUiVersion(repositoryRoot), "the resolved pin");

// A manifest matching the constant still fails when node_modules disagrees.
withFixtureRepository(pinned, "0.0.1", (repositoryUrl) => {
	assert.throws(
		() => assertSharedUiVersion(repositoryUrl),
		/installed signalk-nearlcrews-ui 0\.0\.1/,
	);
});

process.stdout.write(`Shared UI pin tests passed for ${pinned}.\n`);
