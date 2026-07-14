import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const expectedBranch = "main";
const expectedUpstream = "origin/main";

function capture(command, args) {
	return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function exists(command, args, absentStatus = 1) {
	const result = spawnSync(command, args, { encoding: "utf8" });
	if (result.error) {
		throw result.error;
	}
	if (result.status === 0) {
		return true;
	}
	if (result.status === absentStatus) {
		return false;
	}
	throw new Error(result.stderr.trim() || `${command} exited with status ${result.status}`);
}

function main() {
	const options = new Set(process.argv.slice(2));
	for (const option of options) {
		if (option !== "--check") {
			throw new Error(`unknown release option: ${option}`);
		}
	}

	const checkOnly = options.has("--check");
	const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
	const { version } = packageJson;

	if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error("package.json must contain a stable release version");
	}

	const tag = `v${version}`;

	if (capture("git", ["branch", "--show-current"]) !== expectedBranch) {
		throw new Error(`release must run from the ${expectedBranch} branch`);
	}

	if (capture("git", ["status", "--porcelain"]) !== "") {
		throw new Error("release requires a clean working tree");
	}

	if (
		capture("git", [
			"rev-parse",
			"--abbrev-ref",
			"--symbolic-full-name",
			"@{upstream}",
		]) !== expectedUpstream
	) {
		throw new Error(`the ${expectedBranch} branch must track ${expectedUpstream}`);
	}

	execFileSync(
		"git",
		[
			"fetch",
			"--quiet",
			"origin",
			"+refs/heads/main:refs/remotes/origin/main",
		],
		{ stdio: "inherit" },
	);

	const counts = capture("git", [
		"rev-list",
		"--left-right",
		"--count",
		`HEAD...${expectedUpstream}`,
	])
		.split(/\s+/)
		.map(Number);
	if (counts.length !== 2 || counts.some((count) => !Number.isInteger(count))) {
		throw new Error(`could not compare ${expectedBranch} with ${expectedUpstream}`);
	}
	const [, behind] = counts;
	if (behind > 0) {
		throw new Error(`${expectedBranch} is behind or has diverged from ${expectedUpstream}`);
	}

	if (exists("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`])) {
		throw new Error(`local tag ${tag} already exists`);
	}

	if (
		exists("git", ["ls-remote", "--exit-code", "--tags", "origin", `refs/tags/${tag}`], 2)
	) {
		throw new Error(`remote tag ${tag} already exists`);
	}

	execFileSync("gh", ["auth", "status", "--hostname", "github.com"], {
		stdio: "inherit",
	});

	if (checkOnly) {
		console.log(`Release preflight passed for ${tag}`);
		return;
	}

	execFileSync("git", ["tag", tag], { stdio: "inherit" });

	try {
		execFileSync(
			"git",
			[
				"push",
				"--atomic",
				"origin",
				"refs/heads/main:refs/heads/main",
				`refs/tags/${tag}:refs/tags/${tag}`,
			],
			{ stdio: "inherit" },
		);
	} catch (error) {
		execFileSync("git", ["tag", "--delete", tag], { stdio: "inherit" });
		throw error;
	}

	execFileSync("gh", ["release", "create", tag, "--verify-tag", "--generate-notes"], {
		stdio: "inherit",
	});
}

try {
	main();
} catch (error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`Release failed: ${message}`);
	process.exitCode = 1;
}
