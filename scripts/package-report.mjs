export function normalizePackReport(parsedReport) {
	const candidate = Array.isArray(parsedReport) ? parsedReport[0] : parsedReport;
	if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
		throw new Error("npm pack returned no package report");
	}
	if (Array.isArray(candidate.files)) return candidate;

	const nestedReports = Object.values(candidate).filter(
		(value) => value !== null && typeof value === "object" && !Array.isArray(value),
	);
	if (nestedReports.length !== 1 || !Array.isArray(nestedReports[0].files)) {
		throw new Error("npm pack returned no package report");
	}
	return nestedReports[0];
}
