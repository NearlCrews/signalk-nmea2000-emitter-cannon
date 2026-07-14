import type { CSSProperties } from "react";

const approveButton: CSSProperties = {
	padding: "var(--skn-control-padding)",
	minHeight: "var(--skn-control-height)",
	borderRadius: "var(--skn-radius)",
	fontSize: "var(--skn-font-small)",
	cursor: "pointer",
	background: "var(--skn-surface)",
	color: "var(--skn-success-fg)",
	border: "1px solid var(--skn-success-border)",
};

const rejectButton: CSSProperties = {
	...approveButton,
	color: "var(--skn-danger-fg)",
	border: "1px solid var(--skn-danger-border)",
};

/** Styles local to the advisor panel, results, and settings. */
export const ADVISOR_STYLES = {
	stackGap: { marginTop: 10 },
	intro: {
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-muted)",
		lineHeight: 1.45,
		margin: "0 0 10px",
	},
	autoBlock: {
		background: "var(--skn-success-bg)",
		border: "1px solid var(--skn-success-border)",
		borderRadius: "var(--skn-radius)",
		padding: "10px 12px",
		marginBottom: 8,
	},
	pendingBlock: {
		background: "var(--skn-warn-bg)",
		border: "1px solid var(--skn-warn-border)",
		borderRadius: "var(--skn-radius)",
		padding: "10px 12px",
		marginBottom: 8,
	},
	blockTitle: {
		fontWeight: 600,
		fontSize: "var(--skn-font-body)",
		color: "var(--skn-text)",
	},
	list: {
		margin: "6px 0 0",
		paddingLeft: 18,
		fontSize: "var(--skn-font-body)",
	},
	row: {
		borderTop: "1px solid var(--skn-warn-border)",
		paddingTop: 8,
		marginTop: 8,
	},
	rowHead: {
		display: "flex",
		alignItems: "center",
		gap: "var(--skn-space-1)",
		flexWrap: "wrap",
	},
	rowKey: {
		fontWeight: 600,
		fontSize: "var(--skn-font-body)",
		flex: 1,
		minWidth: 140,
	},
	reason: {
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-muted)",
		lineHeight: 1.45,
		marginTop: 4,
	},
	note: {
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-faint)",
		marginTop: 6,
	},
	approveButton,
	rejectButton,
	subhead: {
		fontSize: "var(--skn-font-body)",
		fontWeight: 600,
		color: "var(--skn-text)",
		margin: "12px 0 4px",
	},
	toggleLabel: {
		fontSize: "var(--skn-font-body)",
		color: "var(--skn-text)",
		flex: "1 1 auto",
		minWidth: 160,
	},
	countPill: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		minWidth: 20,
		padding: "1px 8px",
		borderRadius: "var(--skn-radius-pill)",
		background: "var(--skn-warn-bg)",
		color: "var(--skn-warn-fg)",
		border: "1px solid var(--skn-warn-border)",
		fontSize: "var(--skn-font-small)",
		fontWeight: 600,
	},
} satisfies Record<string, CSSProperties>;
