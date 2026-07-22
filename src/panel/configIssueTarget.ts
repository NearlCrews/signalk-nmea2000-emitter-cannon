import type { ConfigIssue } from "../config/validation.js";

function mappingScope(root: HTMLElement, collection: string | undefined): HTMLElement {
	if (collection === undefined) return root;
	for (const candidate of root.querySelectorAll<HTMLElement>("[data-mapping-collection]")) {
		if (candidate.dataset.mappingCollection === collection) return candidate;
	}
	return root;
}

/** Locate the mapping row identified by a validation issue. */
export function configIssueRow(
	root: HTMLElement,
	issue: ConfigIssue,
): HTMLTableRowElement | undefined {
	if (issue.rowIndex === undefined) return undefined;
	return (
		mappingScope(root, issue.collection)
			.querySelectorAll<HTMLTableRowElement>("tbody tr")
			.item(issue.rowIndex) ?? undefined
	);
}

/** Locate controls that should expose a validation issue to assistive technology. */
export function configIssueControls(root: HTMLElement, issue: ConfigIssue): HTMLElement[] {
	const row = configIssueRow(root, issue);
	if (row) return [...row.querySelectorAll<HTMLElement>("input, select")];

	if (issue.inputPath !== undefined) {
		return [...root.querySelectorAll<HTMLElement>("[data-signalk-source-path]")].filter(
			(control) => control.dataset.signalkSourcePath === issue.inputPath,
		);
	}

	const fieldHint = issue.field.toLowerCase().includes("instance")
		? "instance"
		: issue.field.toLowerCase().includes("source")
			? "source"
			: issue.field.toLowerCase().includes("group")
				? "group"
				: issue.field
						.replace(/[A-Z]/g, (letter) => ` ${letter}`)
						.trim()
						.split(" ")[0];
	if (!fieldHint) return [];
	return [...root.querySelectorAll<HTMLElement>("input[aria-label], select[aria-label]")].filter(
		(control) => control.getAttribute("aria-label")?.toLowerCase().includes(fieldHint) ?? false,
	);
}
