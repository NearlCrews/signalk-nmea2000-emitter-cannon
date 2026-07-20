import type { CSSProperties } from "react";

/** Shared responsive table primitives used by status and mapping tables. */
export const TABLE_STYLES = {
	wrap: { width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "auto" },
	table: {
		width: "100%",
		borderCollapse: "collapse",
		fontSize: "var(--skn-font-body)",
		color: "var(--skn-text)",
	},
	headRow: { textAlign: "left", color: "var(--skn-text-muted)" },
	title: {
		fontSize: "var(--skn-font-body)",
		fontWeight: 600,
		marginBottom: 4,
		color: "var(--skn-text)",
	},
	cell: { padding: "var(--skn-table-cell-padding)" },
	actionCell: {
		padding: "var(--skn-table-cell-padding)",
		paddingLeft: "var(--skn-space-3)",
	},
	headCell: { padding: "var(--skn-table-cell-padding)", fontWeight: 500 },
} satisfies Record<string, CSSProperties>;
