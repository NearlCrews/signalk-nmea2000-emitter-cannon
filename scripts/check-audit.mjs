import { spawnSync } from "node:child_process";
import { assertAllowedDevAudit, assertRuntimeAuditClean } from "./audit-policy.mjs";

const npm = process.env.npm_execpath ?? (process.platform === "win32" ? "npm.cmd" : "npm");

function runAudit(args) {
	const command = npm.endsWith(".js") ? process.execPath : npm;
	const commandArgs = npm.endsWith(".js")
		? [npm, "audit", "--json", ...args]
		: ["audit", "--json", ...args];
	const result = spawnSync(command, commandArgs, {
		encoding: "utf8",
		maxBuffer: 10 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	if (result.status !== 0 && result.status !== 1) {
		throw new Error(
			result.stderr.trim() || `npm audit exited with status ${String(result.status)}`,
		);
	}
	try {
		return JSON.parse(result.stdout);
	} catch (error) {
		throw new Error(`npm audit returned invalid JSON: ${String(error)}`);
	}
}

const runtimeReport = runAudit(["--omit=dev"]);
assertRuntimeAuditClean(runtimeReport);

const fullReport = runAudit([]);
const accepted = assertAllowedDevAudit(fullReport);

process.stdout.write("Runtime dependency audit is clean.\n");
if (accepted.vulnerabilityCount > 0) {
	process.stdout.write(
		`Accepted ${accepted.vulnerabilityCount} development-only findings from the pinned ` +
			"canboatjs advisory chain (GHSA-mh99-v99m-4gvg).\n",
	);
} else {
	process.stdout.write("Full dependency audit is clean.\n");
}
