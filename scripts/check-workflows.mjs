import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import {
	browserInstallFailures,
	playwrightEngines,
	reachableScripts,
	weeklyCronMinutes,
	workflowJobs,
	workflowTriggers,
} from "./workflow-policy.mjs";

const workflowDirectory = ".github/workflows";
const workflows = new Map();
for (const name of await readdir(workflowDirectory)) {
	if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
	workflows.set(
		`${workflowDirectory}/${name}`,
		await readFile(`${workflowDirectory}/${name}`, "utf8"),
	);
}
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const { scripts } = packageJson;
const failures = [];
const workflow = (name) => workflows.get(`${workflowDirectory}/${name}`) ?? "";
const SCHEDULED_ONLY =
	"if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'";
// The only jobs that may run the full audit: the weekly one, and the release gate.
const DEV_AUDIT_HOMES = new Set(["workflow-security.yml:dependency-audit", "publish.yml:build"]);
const runsDevAudit = (text) =>
	reachableScripts(scripts, text).has("audit:full") ||
	/\bnpm(?:@\S+)?\s+audit\b(?![^\n]*--omit=dev)/.test(text);

for (const [path, text] of workflows) {
	for (const [index, line] of text.split("\n").entries()) {
		const action = /\buses:\s+([^\s#]+)@([^\s#]+)/.exec(line);
		if (action === null) continue;
		if (!/^[0-9a-f]{40}$/.test(action[2] ?? "")) {
			failures.push(`${path}:${index + 1} must pin ${action[1]} to a full commit SHA.`);
		}
		// A pin's trailing comment names the tag or branch the SHA came from.
		// A date there cannot be maintained: Dependabot rewrites the SHA and
		// leaves the comment alone, so the date then names the wrong commit and
		// only a hand-resolved lookup catches it. The SHA is the single truth.
		if (/#[^\n]*\b\d{4}-\d{2}-\d{2}\b/.test(line)) {
			failures.push(
				`${path}:${index + 1} must not date the pin comment for ${action[1]}: the SHA is the record.`,
			);
		}
	}

	// A newer push supersedes an older run of the same workflow on the same ref.
	// Publishing is the exception: a cancelled publish can strand a release.
	const cancelInProgress = path.endsWith("/publish.yml") ? "false" : "true";
	if (
		!new RegExp(
			`^concurrency:\\n(?: {2}.*\\n)*? {2}cancel-in-progress: ${cancelInProgress}$`,
			"m",
		).test(text)
	) {
		failures.push(`${path} must declare concurrency with cancel-in-progress: ${cancelInProgress}.`);
	}

	// The development-tree audit fails on advisories in lint and test tools that
	// no user installs, so it gates releases and runs on the weekly schedule,
	// never on a push or pull request. It rides an existing scheduled workflow:
	// a workflow of its own would add a run on main HEAD, where the plugin
	// registry reads only the newest 20 runs.
	const runsOnChange =
		workflowTriggers(text).has("push") || workflowTriggers(text).has("pull_request");
	for (const [job, jobText] of workflowJobs(text)) {
		if (!runsDevAudit(jobText)) continue;
		if (!DEV_AUDIT_HOMES.has(`${path.split("/").at(-1)}:${job}`)) {
			failures.push(`${path} job ${job} must not run the full dependency audit.`);
		} else if (runsOnChange && !jobText.includes(SCHEDULED_ONLY)) {
			failures.push(`${path} job ${job} must run the full dependency audit only on schedule.`);
		}
	}
}

const workflowSecurity = workflow("workflow-security.yml");
if (
	!workflowTriggers(workflowSecurity).has("schedule") ||
	!runsDevAudit(workflowJobs(workflowSecurity).get("dependency-audit") ?? "")
) {
	failures.push("workflow-security.yml must run the full dependency audit on its weekly schedule.");
}
if (!reachableScripts(scripts, "npm run verify:release").has("audit:full")) {
	failures.push("verify:release must keep running the full dependency audit.");
}
for (const gate of ["verify", "verify:commit"]) {
	const reached = reachableScripts(scripts, `npm run ${gate}`);
	if (reached.has("test:panel:browser") || reached.has("audit:full")) {
		failures.push(`${gate} must stay free of browser suites and the full dependency audit.`);
	}
}

const ci = workflow("ci.yml");
const ciJobs = workflowJobs(ci);
const verifyJobs = [...ciJobs].filter(([, text]) => reachableScripts(scripts, text).has("verify"));
const verifyJob = verifyJobs[0]?.[1] ?? "";
if (verifyJobs.length !== 1 || !/node-version: 24\n/.test(verifyJob)) {
	failures.push("ci.yml must run the Node-independent verify chain exactly once, on Node 24.");
}
for (const gate of ["test:panel:browser", "package:check", "audit:runtime"]) {
	if (!reachableScripts(scripts, verifyJob).has(gate)) {
		failures.push(`ci.yml verify job must run ${gate}.`);
	}
}

// The extra Node leg proves the toolchain floor devEngines advertises, and only
// what can vary by Node: install, build, and the unit tests.
const floor = /\^(\d+\.\d+\.\d+)/.exec(packageJson.devEngines?.runtime?.version ?? "")?.[1];
const floorJob = ciJobs.get("engines-floor") ?? "";
const floorScripts = [...reachableScripts(scripts, floorJob)].sort().join(", ");
const expectedFloorScripts = [...reachableScripts(scripts, "npm run build && npm test")]
	.sort()
	.join(", ");
if (
	floor === undefined ||
	!floorJob.includes(`node-version: ${floor}\n`) ||
	floorScripts !== expectedFloorScripts
) {
	failures.push(
		`ci.yml engines-floor job must build and unit test on Node ${floor} and nothing more.`,
	);
}

const adminJob = ciJobs.get("signalk-admin") ?? "";
const adminScripts = reachableScripts(scripts, adminJob);
if (
	!adminJob.includes("signalk-server: ['2.24.0', latest]") ||
	!adminScripts.has("pack:release") ||
	!adminScripts.has("test:integration") ||
	!adminJob.includes("artifacts/*.tgz")
) {
	failures.push(
		"ci.yml signalk-admin job must mount the packed panel in Signal K 2.24.0 and latest.",
	);
}

const statusNeeds = /needs: \[([^\]]*)\]/.exec(ciJobs.get("ci-status") ?? "")?.[1];
const otherJobs = [...ciJobs.keys()]
	.filter((name) => name !== "ci-status")
	.sort()
	.join(", ");
if (
	statusNeeds
		?.split(",")
		.map((name) => name.trim())
		.sort()
		.join(", ") !== otherJobs ||
	!(ciJobs.get("ci-status") ?? "").includes("name: CI Status")
) {
	failures.push("ci.yml CI Status, the required check, must need every other CI job.");
}

const pluginCi = workflow("plugin-ci.yml");
if (!pluginCi.includes("SignalK/signalk-server/.github/workflows/plugin-ci.yml@")) {
	failures.push("plugin-ci.yml must retain the official Signal K reusable workflow.");
}
// The release commit is already on main, and its push run is the one the
// registry credits. The ci.yml signalk-admin job supersedes the reusable
// integration job.
if (/^ {4}tags:/m.test(pluginCi) || pluginCi.includes("enable-signalk-integration: true")) {
	failures.push("plugin-ci.yml must not trigger on tags or enable the reusable integration job.");
}
// The registry reads only the newest 20 runs for the release commit, so a
// weekly Plugin CI run lands after every other scheduled run on main HEAD.
// CodeQL default setup (Thursday, about 07:50 UTC) is configured in repository
// settings, so it is checked here as a fixed floor rather than read from a file.
const CODEQL_DEFAULT_SETUP = 4 * 1440 + 7 * 60 + 52;
const pluginCiSchedule = weeklyCronMinutes(pluginCi);
const otherSchedules = [...workflows]
	.filter(([path]) => !path.endsWith("/plugin-ci.yml"))
	.flatMap(([, text]) => weeklyCronMinutes(text));
if (
	pluginCiSchedule.length !== 1 ||
	!otherSchedules.every((minute) => minute < pluginCiSchedule[0]) ||
	pluginCiSchedule[0] <= CODEQL_DEFAULT_SETUP
) {
	failures.push(
		"plugin-ci.yml must run one weekly schedule after every other scheduled run, CodeQL included.",
	);
}

const publish = workflow("publish.yml");
for (const expected of [
	"--provenance --access public",
	"name: npm-package",
	"needs: build",
	"npm@12.0.2",
	"pack:release",
	"Verify registry source commit",
	"gitHead",
	"run verify:release",
]) {
	if (!publish.includes(expected)) {
		failures.push(`publish.yml must retain ${expected}.`);
	}
}

for (const expected of ["actionlint@v1.7.12", "zizmor-action@"]) {
	if (!workflowSecurity.includes(expected)) {
		failures.push(`workflow-security.yml must include ${expected}.`);
	}
}

// Every job that drives a Playwright suite installs each engine that suite
// imports, read from the scripts themselves rather than a list kept here.
const enginesByFile = new Map();
const enginesForFile = (file) => {
	if (!enginesByFile.has(file)) {
		enginesByFile.set(
			file,
			existsSync(file) ? playwrightEngines(readFileSync(file, "utf8")) : new Set(),
		);
	}
	return enginesByFile.get(file);
};
failures.push(...browserInstallFailures(workflows, scripts, enginesForFile));

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

process.stdout.write(
	"Workflow pins, pipeline shape, browser installs, and workflow security checks passed.\n",
);
