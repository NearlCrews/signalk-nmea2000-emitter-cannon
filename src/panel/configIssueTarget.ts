import type { ConfigIssue } from "../config/validation.js";

function mappingScope(root: HTMLElement, collection: string | undefined): HTMLElement {
	if (collection === undefined) return root;
	for (const candidate of root.querySelectorAll<HTMLElement>("[data-mapping-collection]")) {
		if (candidate.dataset.mappingCollection === collection) return candidate;
	}
	return root;
}

/**
 * Locate the mapping row identified by a validation issue. Only data rows
 * count: a row's inline remove confirmation renders as its own table row
 * beneath it, which must not shift the index of the rows after it.
 */
export function configIssueRow(
	root: HTMLElement,
	issue: ConfigIssue,
): HTMLTableRowElement | undefined {
	if (issue.rowIndex === undefined) return undefined;
	return (
		mappingScope(root, issue.collection)
			.querySelectorAll<HTMLTableRowElement>("tbody tr[data-mapping-row]")
			.item(issue.rowIndex) ?? undefined
	);
}

/**
 * Locate the control a validation issue is about, so a jump can put focus on
 * it. Every editable control stamps the config field it writes, and the
 * publisher selects stamp their Signal K input path, so the lookup is an exact
 * match on the issue's own identifiers rather than a guess at label text.
 * Field names come from the validator and are plain identifiers.
 */
export function configIssueControl(root: HTMLElement, issue: ConfigIssue): HTMLElement | undefined {
	if (issue.inputPath !== undefined) {
		for (const control of root.querySelectorAll<HTMLElement>("[data-signalk-source-path]")) {
			if (control.dataset.signalkSourcePath === issue.inputPath) return control;
		}
		return undefined;
	}
	const row = configIssueRow(root, issue);
	const scope = row ?? mappingScope(root, issue.collection);
	return (
		scope.querySelector<HTMLElement>(`[data-config-field="${issue.field}"]`) ??
		row?.querySelector<HTMLElement>("input, select") ??
		undefined
	);
}
