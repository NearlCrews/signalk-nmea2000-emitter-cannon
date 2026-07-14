import type { CSSProperties } from "react";

/** Shared responsive table primitives used by status and mapping tables. */
export const TABLE_STYLES = {
	wrap: { overflowX: "auto" },
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
	cell: { padding: 6 },
	actionCell: { padding: 6, paddingLeft: 16 },
	headCell: { padding: 6, fontWeight: 500 },
} satisfies Record<string, CSSProperties>;
