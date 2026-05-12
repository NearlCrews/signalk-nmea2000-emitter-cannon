import type { CSSProperties } from "react";

export const S: Record<string, CSSProperties> = {
	root: {
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		color: "#333",
		padding: "16px 0",
	},
	statusBar: {
		display: "flex",
		gap: 18,
		padding: "12px 16px",
		background: "#f8f9fa",
		border: "1px solid #e0e0e0",
		borderRadius: 10,
		marginBottom: 16,
		alignItems: "center",
		fontSize: 13,
	},
	dot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },
	dotOk: { background: "#22c55e" },
	dotWait: { background: "#f59e0b" },
	dotOff: { background: "#9ca3af" },
	statLabel: { color: "#777" },
	statValue: { fontWeight: 600, marginLeft: 4 },
	errorBadge: {
		background: "#fee2e2",
		color: "#991b1b",
		padding: "2px 8px",
		borderRadius: 4,
		fontSize: 12,
	},
};

S.fieldRow = {
	display: "flex",
	alignItems: "center",
	gap: 12,
	marginBottom: 8,
};
S.label = { fontSize: 13, color: "#555", width: 280, flexShrink: 0 };
S.select = {
	padding: "6px 10px",
	borderRadius: 6,
	border: "1px solid #ccc",
	fontSize: 13,
	minWidth: 220,
};
S.input = {
	padding: "6px 10px",
	borderRadius: 6,
	border: "1px solid #ccc",
	fontSize: 13,
	width: 220,
};
