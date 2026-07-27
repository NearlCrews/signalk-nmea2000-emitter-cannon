import assert from "node:assert/strict";
import { assertAllowedDevAudit, assertRuntimeAuditClean } from "./audit-policy.mjs";

const emptyReport = {
	auditReportVersion: 2,
	vulnerabilities: {},
};

const allowedReport = {
	auditReportVersion: 2,
	vulnerabilities: {
		"@canboat/canboatjs": {
			severity: "high",
			via: ["mqtt"],
			effects: [],
			nodes: ["node_modules/@canboat/canboatjs"],
		},
		"brace-expansion": {
			severity: "high",
			via: [
				{
					url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
				},
			],
			effects: ["minimatch"],
			nodes: ["node_modules/brace-expansion"],
		},
		glob: {
			severity: "high",
			via: ["minimatch"],
			effects: ["glob-stream"],
			nodes: ["node_modules/glob"],
		},
		"glob-stream": {
			severity: "high",
			via: ["glob"],
			effects: ["help-me"],
			nodes: ["node_modules/glob-stream"],
		},
		"help-me": {
			severity: "high",
			via: ["glob-stream"],
			effects: ["mqtt"],
			nodes: ["node_modules/help-me"],
		},
		minimatch: {
			severity: "high",
			via: ["brace-expansion"],
			effects: ["glob"],
			nodes: ["node_modules/glob/node_modules/minimatch"],
		},
		mqtt: {
			severity: "high",
			via: ["help-me"],
			effects: ["@canboat/canboatjs"],
			nodes: ["node_modules/mqtt"],
		},
	},
};

assert.deepEqual(assertAllowedDevAudit(emptyReport), {
	vulnerabilityCount: 0,
	advisoryCount: 0,
});
assert.doesNotThrow(() => assertRuntimeAuditClean(emptyReport));
assert.deepEqual(assertAllowedDevAudit(allowedReport), {
	vulnerabilityCount: 7,
	advisoryCount: 1,
});
assert.throws(() => assertRuntimeAuditClean(allowedReport), /Runtime audit reported/);
assert.throws(
	() =>
		assertAllowedDevAudit({
			...allowedReport,
			vulnerabilities: {
				...allowedReport.vulnerabilities,
				lodash: {
					severity: "high",
					via: [],
					effects: [],
					nodes: ["node_modules/lodash"],
				},
			},
		}),
	/Unexpected audited package: lodash/,
);
assert.throws(
	() =>
		assertAllowedDevAudit({
			...allowedReport,
			vulnerabilities: {
				...allowedReport.vulnerabilities,
				"brace-expansion": {
					...allowedReport.vulnerabilities["brace-expansion"],
					via: [{ url: "https://github.com/advisories/GHSA-unknown" }],
				},
			},
		}),
	/Unexpected advisory/,
);
assert.throws(() => assertAllowedDevAudit({}), /unsupported report/);

process.stdout.write("Audit policy tests passed.\n");
