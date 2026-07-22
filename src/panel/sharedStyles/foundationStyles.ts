import type { CSSProperties } from "react";

const textSmallDanger: CSSProperties = {
	fontSize: "var(--skn-font-small)",
	fontWeight: 600,
	color: "var(--skn-danger-fg)",
};

/** Panel shell, status, and semantic text styles. */
export const FOUNDATION_STYLES = {
	// The root paints --skn-bg itself: a pinned Dark or Night theme must read
	// as one continuous surface, including the sticky footer.
	root: {
		fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
		color: "var(--skn-text)",
		background: "var(--skn-bg)",
		padding: "var(--skn-space-3)",
		borderRadius: "var(--skn-radius)",
	},
	statusBar: {
		display: "flex",
		flexWrap: "wrap",
		gap: "var(--skn-space-3)",
		padding: "var(--skn-space-2) var(--skn-space-3)",
		background: "var(--skn-surface-muted)",
		border: "1px solid var(--skn-border)",
		borderRadius: "var(--skn-radius)",
		marginBottom: "var(--skn-space-3)",
		alignItems: "center",
		fontSize: "var(--skn-font-body)",
	},
	dot: {
		width: "var(--skn-status-dot-size)",
		height: "var(--skn-status-dot-size)",
		borderRadius: "50%",
		display: "inline-block",
	},
	dotOk: { background: "var(--skn-ok)" },
	dotWait: { background: "var(--skn-wait)" },
	dotOff: { background: "var(--skn-off)" },
	statLabel: { color: "var(--skn-text-muted)" },
	statValue: { fontWeight: 600, marginLeft: "var(--skn-space-half)" },
	textSmallMuted: {
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-muted)",
	},
	textSmallSuccess: {
		fontSize: "var(--skn-font-small)",
		fontWeight: 600,
		color: "var(--skn-success-fg)",
	},
	textSmallDanger,
	// Color-only utilities are for cells that already set their font size.
	textFaint: { color: "var(--skn-text-faint)" },
	textDanger: { color: "var(--skn-danger-fg)" },
	textWarning: { color: "var(--skn-warn-fg)" },
	sectionErrorCount: {
		...textSmallDanger,
		marginLeft: "var(--skn-space-compact)",
	},
	tabErrorDot: {
		display: "inline-block",
		minWidth: 16,
		marginLeft: "var(--skn-space-compact)",
		padding: "0 5px",
		borderRadius: "var(--skn-radius-pill)",
		background: "var(--skn-danger-fg)",
		color: "var(--skn-surface)",
		fontSize: "var(--skn-font-small)",
		fontWeight: 700,
		lineHeight: "16px",
		textAlign: "center",
	},
} satisfies Record<string, CSSProperties>;
