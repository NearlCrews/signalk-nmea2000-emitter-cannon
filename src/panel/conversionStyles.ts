import type { CSSProperties } from "react";
import { S } from "./styles";

/** Styles local to the dense conversion list and its expanded editor. */
export const CONVERSION_STYLES = {
	list: {
		border: "1px solid var(--skn-border)",
		borderRadius: "var(--skn-radius)",
		background: "var(--skn-surface)",
		overflow: "hidden",
	},
	outer: { borderBottom: "1px solid var(--skn-border)" },
	row: {
		display: "flex",
		alignItems: "center",
		gap: "var(--skn-space-1)",
		padding: "4px var(--skn-space-2)",
		minHeight: 34,
		cursor: "pointer",
		borderLeft: "3px solid transparent",
	},
	railEmitting: {
		borderLeftColor: "var(--skn-ok)",
		borderLeftStyle: "solid",
	},
	railSilent: {
		borderLeftColor: "var(--skn-wait)",
		borderLeftStyle: "dashed",
	},
	railError: {
		borderLeftColor: "var(--skn-danger-fg)",
		borderLeftStyle: "solid",
	},
	railDisabled: { borderLeftColor: "transparent" },
	main: {
		display: "flex",
		alignItems: "center",
		gap: "var(--skn-space-1)",
		flex: 1,
		minWidth: 0,
		padding: 0,
		background: "transparent",
		border: "none",
		cursor: "pointer",
		font: "inherit",
		textAlign: "left",
	},
	titleWrap: {
		display: "flex",
		alignItems: "baseline",
		flex: 1,
		minWidth: 0,
	},
	title: {
		fontSize: "var(--skn-font-title)",
		fontWeight: 600,
		color: "var(--skn-text)",
		flex: "0 1 auto",
		minWidth: 0,
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
	},
	pgn: {
		color: "var(--skn-text-muted)",
		whiteSpace: "nowrap",
		flex: "0 0 auto",
		marginLeft: 4,
	},
	badgeSlot: {
		width: 16,
		flexShrink: 0,
		textAlign: "center",
		display: "inline-flex",
		justifyContent: "center",
	},
	recency: {
		marginLeft: "auto",
		color: "var(--skn-text-faint)",
		fontSize: "var(--skn-font-small)",
		whiteSpace: "nowrap",
		flexShrink: 0,
	},
	detail: {
		background: "var(--skn-surface-muted)",
		borderTop: "1px solid var(--skn-border)",
		padding: "var(--skn-space-2) var(--skn-space-3)",
		paddingLeft: 32,
	},
	fieldStack: {
		display: "flex",
		flexDirection: "column",
		alignItems: "stretch",
		gap: "var(--skn-space-1)",
		marginBottom: "var(--skn-space-2)",
	},
	fieldStackLabel: {
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-muted)",
		fontWeight: 500,
		overflowWrap: "anywhere",
	},
	inputFull: { ...S.input, width: "100%", boxSizing: "border-box" },
} satisfies Record<string, CSSProperties>;
