// Development-only advisories this repository has reviewed and accepted, with
// the packages they are allowed to reach. Both sets are empty today, so the full
// dependency audit fails closed on every finding. Add an advisory URL and its
// package chain here only after reviewing the advisory, and empty them again
// once that chain leaves the tree.
const ALLOWED_ADVISORY_URLS = new Set();

const ALLOWED_DEV_PACKAGES = new Set();

function vulnerabilitiesFrom(report) {
	if (
		report === null ||
		typeof report !== "object" ||
		report.auditReportVersion !== 2 ||
		report.vulnerabilities === null ||
		typeof report.vulnerabilities !== "object" ||
		Array.isArray(report.vulnerabilities)
	) {
		throw new Error("npm audit returned an unsupported report");
	}
	return report.vulnerabilities;
}

export function assertRuntimeAuditClean(report) {
	const names = Object.keys(vulnerabilitiesFrom(report));
	if (names.length > 0) {
		throw new Error(`Runtime audit reported: ${names.join(", ")}`);
	}
}

/**
 * Accept an audit report only if every finding in it is allowlisted above.
 *
 * DO NOT DELETE THE CHECKS BELOW AS DEAD CODE. While both allowlists are empty
 * the first one rejects every package, so nothing after it can run and no test
 * can reach it. That is the correct resting state of a safety valve, not
 * evidence it is unused: the checks re-arm the moment an entry is added, and
 * they are what keeps an allowlisted advisory from quietly widening its blast
 * radius. A single upstream advisory blocked every release in this portfolio on
 * 2026-09-09, which is the case this exists for.
 */
export function assertAllowedDevAudit(report) {
	const vulnerabilities = vulnerabilitiesFrom(report);
	const names = Object.keys(vulnerabilities);
	if (names.length === 0) return { vulnerabilityCount: 0, advisoryCount: 0 };

	const advisoryUrls = new Set();
	for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
		if (!ALLOWED_DEV_PACKAGES.has(name)) {
			throw new Error(`Unexpected audited package: ${name}`);
		}
		if (
			vulnerability === null ||
			typeof vulnerability !== "object" ||
			vulnerability.severity !== "high" ||
			!Array.isArray(vulnerability.via) ||
			!Array.isArray(vulnerability.effects) ||
			!Array.isArray(vulnerability.nodes)
		) {
			throw new Error(`Malformed or changed audit entry for ${name}`);
		}
		for (const cause of vulnerability.via) {
			if (typeof cause === "string") {
				if (!ALLOWED_DEV_PACKAGES.has(cause)) {
					throw new Error(`Unexpected audit cause for ${name}: ${cause}`);
				}
				continue;
			}
			if (cause === null || typeof cause !== "object" || typeof cause.url !== "string") {
				throw new Error(`Malformed audit cause for ${name}`);
			}
			if (!ALLOWED_ADVISORY_URLS.has(cause.url)) {
				throw new Error(`Unexpected advisory for ${name}: ${cause.url}`);
			}
			advisoryUrls.add(cause.url);
		}
		for (const effect of vulnerability.effects) {
			if (typeof effect !== "string" || !ALLOWED_DEV_PACKAGES.has(effect)) {
				throw new Error(`Unexpected audit effect for ${name}: ${String(effect)}`);
			}
		}
		if (
			vulnerability.nodes.length === 0 ||
			vulnerability.nodes.some(
				(node) => typeof node !== "string" || !node.startsWith("node_modules/"),
			)
		) {
			throw new Error(`Unexpected audit node for ${name}`);
		}
	}

	return {
		vulnerabilityCount: names.length,
		advisoryCount: advisoryUrls.size,
	};
}
