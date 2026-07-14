import type { CSSProperties } from "react";
import { S } from "./styles";

/** Styles local to the compact panel toolbar. */
export const TOOLBAR_STYLES = {
	root: {
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: "var(--skn-space-2)",
		padding: "6px var(--skn-space-2)",
		background: "var(--skn-surface)",
		borderBottom: "1px solid var(--skn-border)",
		marginBottom: "var(--skn-space-2)",
	},
	searchInput: {
		flex: "1 1 200px",
		minWidth: 0,
		minHeight: "var(--skn-control-height)",
		boxSizing: "border-box",
		padding: "8px 12px",
		borderRadius: "var(--skn-radius)",
		border: "1px solid var(--skn-border)",
		background: "var(--skn-surface)",
		color: "var(--skn-text)",
		fontSize: "var(--skn-font-body)",
	},
	searchClear: {
		minHeight: "var(--skn-control-height)",
		minWidth: "var(--skn-control-height)",
		padding: "var(--skn-control-padding)",
		background: "var(--skn-surface-raised)",
		color: "var(--skn-text)",
		border: "1px solid var(--skn-border)",
		borderRadius: "var(--skn-radius)",
		cursor: "pointer",
		fontSize: "var(--skn-font-small)",
	},
	statusChip: {
		display: "inline-flex",
		alignItems: "center",
		gap: "var(--skn-space-compact)",
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-muted)",
		whiteSpace: "nowrap",
		flexShrink: 0,
	},
	statusChipStale: { marginLeft: "var(--skn-space-compact)" },
	setupButton: { ...S.btnSecondary, flexShrink: 0 },
} satisfies Record<string, CSSProperties>;
