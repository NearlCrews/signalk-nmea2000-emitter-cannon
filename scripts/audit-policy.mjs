const ALLOWED_ADVISORY_URLS = new Set(["https://github.com/advisories/GHSA-mh99-v99m-4gvg"]);

const ALLOWED_DEV_PACKAGES = new Set([
	"@canboat/canboatjs",
	"brace-expansion",
	"glob",
	"glob-stream",
	"help-me",
	"minimatch",
	"mqtt",
]);

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

	if (advisoryUrls.size !== ALLOWED_ADVISORY_URLS.size) {
		throw new Error("The expected canboatjs development advisory was not present");
	}
	for (const url of ALLOWED_ADVISORY_URLS) {
		if (!advisoryUrls.has(url)) {
			throw new Error(`The expected development advisory was not present: ${url}`);
		}
	}

	return {
		vulnerabilityCount: names.length,
		advisoryCount: advisoryUrls.size,
	};
}
