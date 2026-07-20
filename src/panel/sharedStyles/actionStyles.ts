import type { CSSProperties } from "react";

const btnPrimary: CSSProperties = {
	padding: "8px 16px",
	minHeight: "var(--skn-control-height)",
	background: "var(--skn-accent)",
	color: "var(--skn-accent-text)",
	border: "none",
	borderRadius: "var(--skn-radius)",
	fontSize: "var(--skn-font-body)",
	fontWeight: 600,
	cursor: "pointer",
};

const btnSecondary: CSSProperties = {
	padding: "8px 16px",
	minHeight: "var(--skn-control-height)",
	background: "var(--skn-surface-raised)",
	color: "var(--skn-text)",
	border: "1px solid var(--skn-border)",
	borderRadius: "var(--skn-radius)",
	fontSize: "var(--skn-font-body)",
	cursor: "pointer",
};

const btnDestructive: CSSProperties = {
	padding: "8px 16px",
	minHeight: "var(--skn-control-height)",
	background: "var(--skn-surface)",
	color: "var(--skn-danger-fg)",
	border: "1px solid var(--skn-danger-border)",
	borderRadius: "var(--skn-radius)",
	fontSize: "var(--skn-font-body)",
	cursor: "pointer",
};

const btnDestructiveSm: CSSProperties = {
	...btnDestructive,
	padding: "var(--skn-control-padding)",
	fontSize: "var(--skn-font-small)",
};

const btnSecondarySm: CSSProperties = {
	...btnSecondary,
	padding: "var(--skn-control-padding)",
	fontSize: "var(--skn-font-small)",
};

/** Navigation, buttons, chips, and persistent action bars. */
export const ACTION_STYLES = {
	tabs: {
		display: "flex",
		flexWrap: "wrap",
		gap: "var(--skn-space-half)",
		borderBottom: "1px solid var(--skn-border)",
		marginBottom: "var(--skn-space-2)",
	},
	tab: {
		padding: "8px 14px",
		minHeight: "var(--skn-control-height)",
		background: "transparent",
		border: "none",
		borderBottom: "2px solid transparent",
		cursor: "pointer",
		fontSize: "var(--skn-font-body)",
		color: "var(--skn-text-muted)",
	},
	tabActive: {
		borderBottom: "2px solid var(--skn-accent)",
		color: "var(--skn-accent)",
		fontWeight: 600,
	},
	tabCount: { color: "var(--skn-text-faint)" },
	btnPrimary,
	btnSecondary,
	btnDestructive,
	btnDestructiveSm,
	btnSecondarySm,
	// The armed state makes the second, destructive tap unmistakable.
	btnDestructiveSmArmed: {
		...btnDestructiveSm,
		background: "var(--skn-danger-fg)",
		color: "var(--skn-surface)",
		borderColor: "var(--skn-danger-fg)",
		fontWeight: 600,
	},
	dirty: {
		color: "var(--skn-warn-fg)",
		fontSize: "var(--skn-font-small)",
		marginLeft: "var(--skn-space-1)",
	},
	chipRow: {
		display: "flex",
		gap: "var(--skn-space-1)",
		flexWrap: "wrap",
		marginBottom: "var(--skn-space-3)",
	},
	chip: {
		padding: "var(--skn-control-padding)",
		minHeight: "var(--skn-control-height)",
		background: "var(--skn-info-bg)",
		color: "var(--skn-info-fg)",
		border: "1px solid var(--skn-info-border)",
		borderRadius: "var(--skn-radius-pill)",
		fontSize: "var(--skn-font-small)",
		fontWeight: 500,
		cursor: "pointer",
	},
	bulkBtn: {
		...btnSecondarySm,
		whiteSpace: "nowrap",
		flexShrink: 0,
	},
} satisfies Record<string, CSSProperties>;
