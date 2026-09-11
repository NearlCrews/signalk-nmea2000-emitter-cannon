import { readFileSync } from "node:fs";
import { assertAllowedDevAudit } from "./audit-policy.mjs";

let fullReport;
try {
	fullReport = JSON.parse(readFileSync(0, "utf8"));
} catch (error) {
	throw new Error(`npm audit returned invalid JSON: ${String(error)}`);
}

const accepted = assertAllowedDevAudit(fullReport);

if (accepted.vulnerabilityCount > 0) {
	process.stdout.write(
		`Accepted ${accepted.vulnerabilityCount} development-only findings from ` +
			`${accepted.advisoryCount} allowlisted advisories.\n`,
	);
} else {
	process.stdout.write("Full dependency audit is clean.\n");
}
