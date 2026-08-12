import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePackReport } from "./package-report.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const packagePath = resolve(root, "package.json");
const artifactDirectory = resolve(root, "artifacts");
const originalPackage = readFileSync(packagePath, "utf8");
const gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
assert.match(gitHead, /^[0-9a-f]{40}$/, "release checkout must resolve to a full Git commit");

rmSync(artifactDirectory, { force: true, recursive: true });
mkdirSync(artifactDirectory, { recursive: true });
let report;
try {
	const manifest = JSON.parse(originalPackage);
	writeFileSync(packagePath, `${JSON.stringify({ ...manifest, gitHead }, null, "\t")}\n`);
	const npmCli = process.env.npm_execpath;
	assert.ok(npmCli, "npm_execpath is required; run this script through npm");
	const output = execFileSync(
		process.execPath,
		[npmCli, "pack", "--json", "--ignore-scripts", "--pack-destination", artifactDirectory],
		{ cwd: root, encoding: "utf8" },
	);
	report = normalizePackReport(JSON.parse(output));
} finally {
	writeFileSync(packagePath, originalPackage);
}

assert.equal(typeof report?.filename, "string", "npm pack returned no tarball filename");
const tarball = resolve(artifactDirectory, basename(report.filename));
const packedManifest = JSON.parse(
	execFileSync("tar", ["-xOzf", tarball, "package/package.json"], { encoding: "utf8" }),
);
assert.equal(
	packedManifest.gitHead,
	gitHead,
	"packed manifest does not identify the release commit",
);
process.stdout.write(`Release tarball created with gitHead ${gitHead}: ${tarball}\n`);
