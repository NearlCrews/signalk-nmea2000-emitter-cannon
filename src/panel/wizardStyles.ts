import type { CSSProperties } from "react";

/**
 * Styles local to the first-run setup wizard's own content. The shared Dialog
 * owns the scrim, surface, header, and footer, so only the wizard's grouped
 * proposal list and its status hint are styled here.
 */
export const WIZARD_STYLES = {
	group: { marginBottom: 16 },
	groupTitle: {
		fontSize: "var(--skn-font-body)",
		fontWeight: 600,
		margin: "0 0 6px",
		color: "var(--skn-text)",
	},
	subhead: {
		fontSize: "var(--skn-font-body)",
		fontWeight: 600,
		color: "var(--skn-text)",
		margin: "16px 0 4px",
	},
	footerHint: {
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-muted)",
		lineHeight: 1.4,
		margin: "12px 0 0",
	},
} satisfies Record<string, CSSProperties>;
