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
S.card = {
	background: "#fff",
	border: "1px solid #e0e0e0",
	borderRadius: 10,
	padding: "12px 16px",
	marginBottom: 10,
};
S.cardHeader = {
	display: "flex",
	alignItems: "center",
	gap: 12,
	marginBottom: 8,
};
S.checkbox = { width: 16, height: 16 };
S.cardMeta = { fontSize: 11, color: "#888" };
S.tabs = {
	display: "flex",
	gap: 4,
	borderBottom: "1px solid #e0e0e0",
	marginBottom: 12,
};
S.tab = {
	padding: "8px 14px",
	background: "transparent",
	border: "none",
	borderBottom: "2px solid transparent",
	cursor: "pointer",
	fontSize: 13,
	color: "#555",
};
S.tabActive = {
	borderBottom: "2px solid #3b82f6",
	color: "#3b82f6",
	fontWeight: 600,
};
S.footer = {
	display: "flex",
	gap: 8,
	padding: "12px 0",
	borderTop: "1px solid #e0e0e0",
	marginTop: 16,
};
S.btnPrimary = {
	padding: "8px 16px",
	background: "#3b82f6",
	color: "white",
	border: "none",
	borderRadius: 6,
	fontWeight: 600,
	cursor: "pointer",
};
S.btnSecondary = {
	padding: "8px 16px",
	background: "#f3f4f6",
	color: "#333",
	border: "1px solid #d1d5db",
	borderRadius: 6,
	cursor: "pointer",
};
S.btnDestructive = {
	padding: "8px 16px",
	background: "#fff",
	color: "#991b1b",
	border: "1px solid #fca5a5",
	borderRadius: 6,
	cursor: "pointer",
};
S.dirty = { color: "#92400e", fontSize: 12, marginLeft: 8 };
S.cardTitle = {
	fontSize: 14,
	fontWeight: 600,
	flex: 1,
	margin: 0,
};
S.cardPurpose = {
	fontSize: 12,
	color: "#555",
	lineHeight: 1.45,
	margin: "2px 0 6px",
};
// Shared shape for the small inline card badges (compatibility, legacy).
// Each badge spreads this and adds its own colors and modifiers.
const badgeBase: CSSProperties = {
	display: "inline-block",
	fontSize: 11,
	padding: "1px 6px",
	borderRadius: 4,
};
S.cardCompatibility = {
	...badgeBase,
	marginLeft: 8,
	fontWeight: 500,
};
S.cardLegacy = {
	...badgeBase,
	marginLeft: 8,
	fontWeight: 500,
	background: "#ede9fe",
	color: "#5b21b6",
	border: "1px solid #c4b5fd",
	cursor: "help",
};
// Applied to each PGN number inside the card title so the existing
// "(PGN NNNNN)" text is itself the per-PGN tooltip target.
S.pgnHover = {
	cursor: "help",
	textDecoration: "underline dotted",
	textUnderlineOffset: 2,
};
S.helpHint = {
	fontSize: 12,
	color: "#555",
	lineHeight: 1.45,
	margin: "2px 0 6px",
};
S.notePrefix = {
	fontWeight: 600,
	marginRight: 4,
};
S.savedPill = {
	fontSize: 12,
	color: "#065f46",
	background: "#d1fae5",
	border: "1px solid #6ee7b7",
	borderRadius: 999,
	padding: "2px 10px",
	marginLeft: 8,
};
S.errorBanner = {
	color: "#991b1b",
	background: "#fef2f2",
	border: "1px solid #fecaca",
	borderRadius: 6,
	padding: "8px 12px",
	fontSize: 13,
	margin: "8px 0",
	display: "flex",
	alignItems: "center",
	gap: 12,
};
S.btnRetry = {
	padding: "4px 10px",
	background: "#fff",
	color: "#991b1b",
	border: "1px solid #fca5a5",
	borderRadius: 6,
	fontSize: 12,
	cursor: "pointer",
};
S.visuallyHidden = {
	position: "absolute",
	width: 1,
	height: 1,
	padding: 0,
	margin: -1,
	overflow: "hidden",
	clip: "rect(0,0,0,0)",
	whiteSpace: "nowrap",
	border: 0,
};
S.chipRow = {
	display: "flex",
	gap: 8,
	flexWrap: "wrap",
	marginBottom: 16,
};
S.chip = {
	padding: "6px 12px",
	background: "#eef2ff",
	color: "#3730a3",
	border: "1px solid #c7d2fe",
	borderRadius: 999,
	fontSize: 12,
	fontWeight: 500,
	cursor: "pointer",
};
