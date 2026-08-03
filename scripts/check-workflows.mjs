import { readdir, readFile } from "node:fs/promises";

const workflowDirectory = ".github/workflows";
const workflowPaths = (await readdir(workflowDirectory))
	.filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
	.map((name) => `${workflowDirectory}/${name}`);
const failures = [];

for (const path of workflowPaths) {
	const workflow = await readFile(path, "utf8");
	for (const [index, line] of workflow.split("\n").entries()) {
		const action = /\buses:\s+([^\s#]+)@([^\s#]+)/.exec(line);
		if (action !== null && !/^[0-9a-f]{40}$/.test(action[2] ?? "")) {
			failures.push(`${path}:${index + 1} must pin ${action[1]} to a full commit SHA.`);
		}
	}
}

const ci = await readFile(".github/workflows/ci.yml", "utf8");
if (!ci.includes("node-version: [22.22.2, 24]") || !ci.includes("run verify:release")) {
	failures.push("ci.yml must retain the supported Node matrix and the release verification gate.");
}

const pluginCi = await readFile(".github/workflows/plugin-ci.yml", "utf8");
if (!pluginCi.includes("SignalK/signalk-server/.github/workflows/plugin-ci.yml@")) {
	failures.push("plugin-ci.yml must retain the official Signal K reusable workflow.");
}

const codeql = await readFile(".github/workflows/codeql.yml", "utf8");
for (const expected of ["github/codeql-action/init@", "github/codeql-action/analyze@"]) {
	if (!codeql.includes(expected)) {
		failures.push(`codeql.yml must include ${expected}.`);
	}
}

const publish = await readFile(".github/workflows/publish.yml", "utf8");
for (const expected of ["--provenance --access public", "name: npm-package", "needs: build"]) {
	if (!publish.includes(expected)) {
		failures.push(`publish.yml must retain ${expected}.`);
	}
}

const workflowSecurity = await readFile(".github/workflows/workflow-security.yml", "utf8");
for (const expected of ["actionlint@v1.7.12", "zizmor-action@"]) {
	if (!workflowSecurity.includes(expected)) {
		failures.push(`workflow-security.yml must include ${expected}.`);
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

process.stdout.write("Workflow pins, release invariants, and workflow security checks passed.\n");
