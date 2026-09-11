import { createContext, useContext } from "react";
import type { ConfigIssue } from "../config/validation.js";

/** A validation issue paired with the id of the element that renders its text. */
export interface RenderedConfigIssue {
	issue: ConfigIssue;
	/** Element id of the list item showing this issue's message. */
	messageId: string;
}

const NO_ISSUES: readonly RenderedConfigIssue[] = [];

/**
 * The validation issues for the conversion being edited, published by its
 * detail body so a control can render its own `aria-invalid` and
 * `aria-describedby` in JSX. Mapping editors sit several passthrough
 * components below that body, so the list travels by context rather than
 * through every editor's props.
 */
export const ConfigIssueContext = createContext<readonly RenderedConfigIssue[]>(NO_ISSUES);

export function useConfigIssues(): readonly RenderedConfigIssue[] {
	return useContext(ConfigIssueContext);
}

/** Joins message ids into an `aria-describedby`, or nothing when there are none. */
function describedBy(messageIds: string[]): string | undefined {
	return messageIds.length === 0 ? undefined : messageIds.join(" ");
}

/**
 * Message ids that address one mapping-table cell. An issue naming the
 * collection itself rejects the whole row rather than one field, so it
 * addresses every cell in that row.
 */
export function cellIssueIds(
	issues: readonly RenderedConfigIssue[],
	collection: string,
	rowIndex: number,
	field: string,
): string | undefined {
	return describedBy(
		issues
			.filter(
				({ issue }) =>
					issue.collection === collection &&
					issue.rowIndex === rowIndex &&
					(issue.field === field || issue.field === collection),
			)
			.map(({ messageId }) => messageId),
	);
}

/** Message ids that address the publisher filter of one fixed input path. */
export function inputPathIssueIds(
	issues: readonly RenderedConfigIssue[],
	inputPath: string,
): string | undefined {
	return describedBy(
		issues.filter(({ issue }) => issue.inputPath === inputPath).map(({ messageId }) => messageId),
	);
}
