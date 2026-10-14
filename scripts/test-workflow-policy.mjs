import assert from "node:assert/strict";
import {
	browserEnginesFor,
	browserInstallFailures,
	installedEngines,
	npmScriptsInvoked,
	playwrightEngines,
	reachableScripts,
	weeklyCronMinutes,
	workflowJobs,
	workflowTriggers,
} from "./workflow-policy.mjs";

const workflow = `name: CI

on:
  push:
    branches: [main]
  pull_request:

# A comment at column 0 does not end the jobs block.
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: npx playwright install --with-deps chromium
      - run: npx --yes npm@12.0.2 run verify:browser

  floor:
    steps:
      - run: npm ci
      - run: npm test
`;

const jobs = workflowJobs(workflow);
assert.deepEqual([...jobs.keys()], ["verify", "floor"]);
assert.match(jobs.get("verify") ?? "", /verify:browser/);
assert.doesNotMatch(jobs.get("verify") ?? "", /npm test/);
assert.deepEqual([...workflowTriggers(workflow)], ["push", "pull_request"]);
assert.deepEqual(
	[...workflowTriggers("on: [push, workflow_dispatch]\njobs:\n")],
	["push", "workflow_dispatch"],
);
assert.deepEqual([...workflowTriggers("on: push\n")], ["push"]);

assert.deepEqual(weeklyCronMinutes("  schedule:\n    - cron: '23 6 * * 1'\n"), [
	1440 + 6 * 60 + 23,
]);
assert.deepEqual(weeklyCronMinutes('on:\n  schedule:\n    - cron: "17 10 * * 4"\n'), [
	4 * 1440 + 10 * 60 + 17,
]);
assert.deepEqual(weeklyCronMinutes(workflow), []);
assert.throws(() => weeklyCronMinutes("    - cron: '0 */6 * * *'\n"), /not a single weekly time/);

assert.deepEqual(
	npmScriptsInvoked(
		"npm run -s tsc7 -- --noEmit && npm run --silent verify && npx --yes npm@12.0.2 run build && npm test && npm ci && npm audit --omit=dev",
	),
	["tsc7", "verify", "build", "test"],
);

const scripts = {
	"verify:browser": "npm run verify && npm run test:panel:browser",
	verify: "npm run lint && npm run build",
	lint: "biome ci .",
	build: "webpack",
	prebuild: "node scripts/clean.mjs",
	"test:panel:browser": "node scripts/check-panel-browser.mjs",
	"test:integration": "node scripts/check-signalk-integration.mjs",
};
assert.deepEqual([...reachableScripts(scripts, "npm run verify:browser")].sort(), [
	"build",
	"lint",
	"prebuild",
	"test:panel:browser",
	"verify",
	"verify:browser",
]);

// The specifiers are assembled at run time: check-workflows.mjs reads this file
// as a script the verify chain runs, and literal fixtures would read as imports.
const testModule = `"@${"playwright"}/test"`;
assert.deepEqual(
	[...playwrightEngines(`import { chromium, devices, webkit as wk } from ${testModule};`)],
	["chromium", "webkit"],
);
assert.deepEqual([...playwrightEngines('import AxeBuilder from "@axe-core/playwright";')], []);
assert.throws(() => playwrightEngines(`import * as pw from ${testModule};`), /by name/);
assert.throws(
	() => playwrightEngines(`const { firefox } = await import(${testModule});`),
	/by name/,
);

assert.deepEqual(
	[...installedEngines("npx playwright install --with-deps chromium webkit")],
	["chromium", "webkit"],
);
assert.deepEqual(
	[...installedEngines("npx playwright install --with-deps")],
	["chromium", "firefox", "webkit"],
);

const engines = new Map([
	["scripts/check-panel-browser.mjs", new Set(["chromium", "webkit"])],
	["scripts/check-signalk-integration.mjs", new Set(["chromium"])],
]);
const enginesForFile = (file) => engines.get(file) ?? new Set();
assert.deepEqual(
	[...browserEnginesFor("npm run verify:browser", scripts, enginesForFile)],
	["chromium", "webkit"],
);
assert.deepEqual([...browserEnginesFor("npm run verify", scripts, enginesForFile)], []);

// The job installs Chromium only while the suite also drives WebKit.
assert.deepEqual(browserInstallFailures(new Map([["ci.yml", workflow]]), scripts, enginesForFile), [
	"ci.yml job verify runs a Playwright suite but does not install webkit.",
]);
const fixed = workflow.replace("chromium\n", "chromium webkit\n");
assert.deepEqual(browserInstallFailures(new Map([["ci.yml", fixed]]), scripts, enginesForFile), []);

// A suite that starts launching Firefox fails until the workflow installs it.
engines.set("scripts/check-panel-browser.mjs", new Set(["chromium", "firefox", "webkit"]));
assert.deepEqual(browserInstallFailures(new Map([["ci.yml", fixed]]), scripts, enginesForFile), [
	"ci.yml job verify runs a Playwright suite but does not install firefox.",
]);

process.stdout.write("Workflow policy tests passed.\n");
