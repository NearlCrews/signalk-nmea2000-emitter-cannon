import assert from "node:assert/strict";
import { assertAllowedDevAudit, assertRuntimeAuditClean } from "./audit-policy.mjs";

const emptyReport = {
	auditReportVersion: 2,
	vulnerabilities: {},
};

const findingReport = {
	auditReportVersion: 2,
	vulnerabilities: {
		lodash: {
			severity: "high",
			via: [
				{
					url: "https://github.com/advisories/GHSA-example",
				},
			],
			effects: [],
			nodes: ["node_modules/lodash"],
		},
	},
};

assert.deepEqual(assertAllowedDevAudit(emptyReport), {
	vulnerabilityCount: 0,
	advisoryCount: 0,
});
assert.doesNotThrow(() => assertRuntimeAuditClean(emptyReport));

// The allowlist is empty, so every audited package is unexpected.
assert.throws(() => assertAllowedDevAudit(findingReport), /Unexpected audited package: lodash/);
assert.throws(() => assertRuntimeAuditClean(findingReport), /Runtime audit reported: lodash/);

assert.throws(() => assertAllowedDevAudit({}), /unsupported report/);
assert.throws(() => assertRuntimeAuditClean({}), /unsupported report/);
assert.throws(
	() => assertAllowedDevAudit({ auditReportVersion: 2, vulnerabilities: [] }),
	/unsupported report/,
);

process.stdout.write("Audit policy tests passed.\n");
