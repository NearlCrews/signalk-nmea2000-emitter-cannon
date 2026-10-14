import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Rewrite the build:plugin command so it writes to a scratch file and emits a
 * metafile, leaving every bundling option exactly as the real build sets it.
 * Anything this cannot rewrite safely throws rather than guessing.
 */
export function metafileBuildArgs(command, outfile, metafile) {
	if (/["'`$\\]/.test(command)) {
		throw new Error("build:plugin must be a plain esbuild command without quoting");
	}
	const [binary, ...args] = command.trim().split(/\s+/);
	if (binary !== "esbuild") throw new Error("build:plugin must invoke esbuild directly");
	if (args.filter((arg) => arg.startsWith("--outfile=")).length !== 1) {
		throw new Error("build:plugin must name exactly one --outfile");
	}
	return [
		...args.map((arg) => (arg.startsWith("--outfile=") ? `--outfile=${outfile}` : arg)),
		`--metafile=${metafile}`,
		"--log-level=warning",
	];
}

/** Name every package that contributes code to an esbuild bundle. */
export function inlinedPackages(metafile) {
	const names = new Set();
	for (const output of Object.values(metafile?.outputs ?? {})) {
		for (const [input, { bytesInOutput }] of Object.entries(output.inputs ?? {})) {
			// A module tree shaking removed entirely is listed with no bytes.
			if (bytesInOutput === 0) continue;
			const parts = input.split("node_modules/");
			if (parts.length === 1) continue;
			const name = /^((?:@[^/]+\/)?[^/]+)\//.exec(parts.at(-1) ?? "")?.[1];
			if (name !== undefined) names.add(name);
		}
	}
	return [...names].sort();
}

/** Build the plugin bundle the way build:plugin does and name what it inlined. */
export function pluginBundlePackages(command, cwd) {
	const scratch = mkdtempSync(join(tmpdir(), "plugin-bundle-"));
	try {
		const metafile = join(scratch, "meta.json");
		const result = spawnSync(
			join("node_modules", ".bin", "esbuild"),
			metafileBuildArgs(command, join(scratch, "index.mjs"), metafile),
			{ cwd, encoding: "utf8", shell: process.platform === "win32" },
		);
		if (result.status !== 0) {
			process.stderr.write(result.stderr ?? "");
			throw new Error("esbuild did not build the plugin bundle");
		}
		return inlinedPackages(JSON.parse(readFileSync(metafile, "utf8")));
	} finally {
		rmSync(scratch, { force: true, recursive: true });
	}
}
