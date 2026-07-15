import type { CSSProperties } from "react";

/** Shared form controls and card surfaces. */
export const FORM_STYLES = {
	fieldRow: {
		display: "flex",
		alignItems: "center",
		gap: "var(--skn-space-2)",
		marginBottom: "var(--skn-space-1)",
		flexWrap: "wrap",
	},
	// The shrinking basis aligns labels on wide screens without leaving a dead
	// gutter beside short labels on tablets.
	label: {
		fontSize: "var(--skn-font-body)",
		color: "var(--skn-text-muted)",
		flex: "0 1 280px",
	},
	select: {
		padding: "var(--skn-field-padding)",
		borderRadius: "var(--skn-radius)",
		border: "1px solid var(--skn-border)",
		background: "var(--skn-surface)",
		color: "var(--skn-text)",
		fontSize: "var(--skn-font-body)",
		minWidth: "var(--skn-input-width)",
	},
	input: {
		padding: "var(--skn-field-padding)",
		borderRadius: "var(--skn-radius)",
		border: "1px solid var(--skn-border)",
		background: "var(--skn-surface)",
		color: "var(--skn-text)",
		fontSize: "var(--skn-font-body)",
		width: "var(--skn-input-width)",
	},
	card: {
		background: "var(--skn-surface)",
		border: "1px solid var(--skn-border)",
		borderRadius: "var(--skn-radius)",
		padding: "var(--skn-space-2) var(--skn-space-3)",
		marginBottom: "var(--skn-space-2)",
	},
	// The larger checkbox is easier to use on a moving boat. accentColor keeps
	// the checked state on the theme palette.
	checkbox: {
		width: "var(--skn-checkbox-size)",
		height: "var(--skn-checkbox-size)",
		flexShrink: 0,
		cursor: "pointer",
		accentColor: "var(--skn-accent)",
	},
	cardMeta: {
		fontSize: "var(--skn-font-small)",
		color: "var(--skn-text-faint)",
	},
} satisfies Record<string, CSSProperties>;
