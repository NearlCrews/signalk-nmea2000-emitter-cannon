import type { CSSProperties } from "react";
import { S } from "./styles";

const cell: CSSProperties = {
	padding: "var(--skn-space-2) 10px",
	borderBottom: "1px solid var(--skn-border)",
	verticalAlign: "top",
};

export const STATUS_VIEW_STYLES = {
	cell,
	childCell: {
		...cell,
		paddingLeft: "var(--skn-space-4)",
		color: "var(--skn-text-muted)",
	},
	inputPaths: {
		marginTop: "var(--skn-space-compact)",
		fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-faint)",
		overflowWrap: "anywhere",
	},
	headCell: {
		padding: "10px",
		fontWeight: 600,
		borderBottom: "2px solid var(--skn-border)",
	},
	pgnCell: {
		...cell,
		fontVariantNumeric: "tabular-nums",
		color: "var(--skn-text-muted)",
	},
	numberCell: {
		...cell,
		textAlign: "right",
		fontVariantNumeric: "tabular-nums",
	},
	headerRow: {
		display: "flex",
		flexWrap: "wrap",
		gap: "var(--skn-space-3)",
		alignItems: "center",
		marginBottom: "var(--skn-space-2)",
		fontSize: "var(--skn-font-body)",
	},
	emptyText: {
		...S.loadingText,
		padding: "var(--skn-space-2) 0",
	},
	readyDot: { marginRight: "var(--skn-space-compact)" },
} satisfies Record<string, CSSProperties>;
