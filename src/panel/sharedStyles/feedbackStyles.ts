import type { CSSProperties } from "react";

const badgeBase: CSSProperties = {
	display: "inline-block",
	fontSize: "var(--skn-font-small)",
	padding: "1px var(--skn-space-compact)",
	borderRadius: "var(--skn-radius-sm)",
};

const note: CSSProperties = {
	background: "var(--skn-warn-bg)",
	border: "1px solid var(--skn-warn-border)",
	borderRadius: "var(--skn-radius-sm)",
	color: "var(--skn-warn-fg)",
	fontSize: "var(--skn-font-small)",
	lineHeight: 1.45,
	margin: "var(--skn-space-1) 0 var(--skn-space-compact)",
	padding: "var(--skn-space-compact) var(--skn-space-1)",
};

/** Badges, notes, loading states, errors, and first-run guidance. */
export const FEEDBACK_STYLES = {
	cardPurpose: {
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-muted)",
		lineHeight: 1.45,
		margin: "2px 0 var(--skn-space-compact)",
	},
	// Legacy is a fact, not a warning, so the badge stays neutral.
	cardLegacy: {
		...badgeBase,
		marginLeft: "var(--skn-space-1)",
		fontWeight: 500,
		background: "var(--skn-surface-raised)",
		color: "var(--skn-text-muted)",
		border: "1px solid var(--skn-border)",
		cursor: "help",
	},
	pgnHover: {
		cursor: "help",
		textDecoration: "underline dotted",
		textUnderlineOffset: 2,
	},
	helpHint: {
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-muted)",
		lineHeight: 1.45,
		margin: "2px 0 var(--skn-space-compact)",
	},
	mappingLive: {
		color: "var(--skn-success-fg)",
		fontSize: "var(--skn-font-small)",
		marginTop: "var(--skn-space-half)",
	},
	mappingMissing: {
		color: "var(--skn-warn-fg)",
		fontSize: "var(--skn-font-small)",
		marginTop: "var(--skn-space-half)",
	},
	notePrefix: {
		fontWeight: 600,
		marginRight: "var(--skn-space-half)",
	},
	note,
	noteInfo: {
		...note,
		background: "var(--skn-info-bg)",
		border: "1px solid var(--skn-info-border)",
		color: "var(--skn-info-fg)",
	},
	errorMark: {
		color: "var(--skn-danger-fg)",
		fontSize: "var(--skn-font-body)",
		fontWeight: 700,
	},
	loadingText: {
		color: "var(--skn-text-muted)",
		fontSize: "var(--skn-font-body)",
	},
	savedPill: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		fontSize: "var(--skn-font-small)",
		lineHeight: 1,
		color: "var(--skn-success-fg)",
		background: "var(--skn-success-bg)",
		border: "1px solid var(--skn-success-border)",
		borderRadius: "var(--skn-radius-pill)",
		padding: "5px var(--skn-space-2)",
		marginLeft: "var(--skn-space-1)",
	},
	visuallyHidden: {
		position: "absolute",
		width: 1,
		height: 1,
		padding: 0,
		margin: -1,
		overflow: "hidden",
		clip: "rect(0,0,0,0)",
		whiteSpace: "nowrap",
		border: 0,
	},
} satisfies Record<string, CSSProperties>;
