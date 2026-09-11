import type { CSSProperties } from "react";

/**
 * Single-line height of the sticky toolbar, declared by the toolbar itself and
 * read back as scroll clearance so the two can never drift. It is the shared
 * control floor plus the toolbar's own block padding and bottom border, all of
 * which grow together when a coarse pointer raises the control token. The
 * toolbar wraps on narrow screens, so this is the single-line height, which is
 * the common case on a desktop.
 */
const TOOLBAR_HEIGHT = "calc(var(--snui-control-min-height) + var(--snui-space-2) * 2 + 1px)";

/**
 * Clearance for anything scrolled or focused into view under the toolbar: its
 * height plus a gap, so a jump target lands below it rather than against it.
 * Every element a jump scrolls carries this, because the toolbar covers the
 * top of the panel whichever element is the target.
 */
const TOOLBAR_CLEARANCE = `calc(${TOOLBAR_HEIGHT} + var(--snui-space-2))`;

/**
 * Styles local to the dense conversion list, its expanded editor, and the
 * sticky toolbar above them. Colors, spacing, radii, and type read the shared
 * library tokens directly; the only panel-owned dimensions are the 3px status
 * rail and the toolbar geometry.
 */
export const CONVERSION_STYLES = {
	// The toolbar is a plain landmark section, so its layout is its own: it
	// sticks to the top of the panel above both view containers, and its
	// children wrap on a phone width rather than overflowing.
	toolbar: {
		position: "sticky",
		top: 0,
		zIndex: "var(--snui-z-sticky)",
		display: "flex",
		alignItems: "center",
		flexWrap: "wrap",
		gap: "var(--snui-space-3)",
		minHeight: TOOLBAR_HEIGHT,
		padding: "var(--snui-space-2) var(--snui-space-3)",
		background: "var(--snui-color-surface)",
		borderBottom: "1px solid var(--snui-color-border)",
	},
	// The search field takes the free width of the toolbar row and shrinks to
	// zero before it forces the row to overflow.
	searchSlot: { flex: "1 1 200px", minWidth: 0 },
	list: {
		border: "1px solid var(--snui-color-border)",
		borderRadius: "var(--snui-radius-sm)",
		background: "var(--snui-color-surface)",
		overflow: "hidden",
	},
	outer: {
		borderBottom: "1px solid var(--snui-color-border)",
		scrollMarginTop: TOOLBAR_CLEARANCE,
	},
	// A mapping row is its own jump target, so it clears the toolbar on the
	// same terms as the conversion row that contains it.
	mappingRow: { scrollMarginTop: TOOLBAR_CLEARANCE },
	// A mapping cell's control fills its column and keeps a usable floor when
	// the table compresses on a phone, where the scroll region carries the
	// overflow.
	mappingCell: { minWidth: "7.5rem" },
	// The row sits at the shared control floor: 40px with a fine pointer and
	// 44px under a coarse one, which the library resolves through the same
	// token its checkbox and buttons use. That keeps a helm touchscreen target
	// reachable without a panel-local media query.
	row: {
		display: "flex",
		alignItems: "center",
		gap: "var(--snui-space-2)",
		padding: "0 var(--snui-space-3)",
		minHeight: "var(--snui-control-min-height)",
		cursor: "pointer",
		borderLeft: "3px solid transparent",
	},
	railEmitting: {
		borderLeftColor: "var(--snui-color-success)",
		borderLeftStyle: "solid",
	},
	railSilent: {
		borderLeftColor: "var(--snui-color-warning)",
		borderLeftStyle: "dashed",
	},
	railError: {
		borderLeftColor: "var(--snui-color-danger)",
		borderLeftStyle: "solid",
	},
	railDisabled: { borderLeftColor: "transparent" },
	// The disclosure trigger. It is a text-styled native button rather than the
	// library Button because the row is a list line, not a control: the Button
	// centers its content and pads it as an action, while this must read left
	// to right with the title and yield space to the recency column. The
	// library's useDisclosure hook supplies the ARIA wiring and focus handoff
	// for exactly this case; the browser's own focus ring marks focus.
	toggle: {
		display: "flex",
		alignItems: "center",
		gap: "var(--snui-space-2)",
		flex: 1,
		// A floor, not 0. The title still ellipsizes inside it, but the toggle can
		// never be squeezed to zero width by a long recency string at 320px, which
		// leaves the row with no clickable target at all. The proportional middle
		// term keeps the conversion NAME legible on phone widths: with a bare 96px
		// floor the non-shrinking PGN run consumed the floor and the name collapsed
		// to one or two characters while the recency column kept most of the row.
		minWidth: "clamp(96px, 55%, 240px)",
		minHeight: "var(--snui-control-min-height)",
		padding: 0,
		background: "transparent",
		border: "none",
		color: "inherit",
		cursor: "pointer",
		font: "inherit",
		textAlign: "start",
	},
	caret: {
		color: "var(--snui-color-text-muted)",
		fontSize: "var(--snui-font-size-xs)",
		flexShrink: 0,
	},
	titleWrap: {
		display: "flex",
		alignItems: "baseline",
		flex: 1,
		minWidth: 0,
		// The PGN run inside never shrinks, so without this it escapes the wrap on
		// phone widths and collides with the recency column beside it.
		overflow: "hidden",
	},
	title: {
		fontWeight: "var(--snui-font-weight-semibold)",
		color: "var(--snui-color-text)",
		flex: "0 1 auto",
		// The name is what identifies a row, so it keeps a readable floor and the
		// PGN run beside it ellipsizes first on phone widths. With a 0 floor the
		// two-PGN rows rendered as bare PGN numbers with no name at 320px.
		minWidth: "6ch",
		whiteSpace: "nowrap",
		overflow: "hidden",
		textOverflow: "ellipsis",
	},
	pgn: {
		color: "var(--snui-color-text-muted)",
		whiteSpace: "nowrap",
		flex: "0 1 auto",
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
		marginInlineStart: "var(--snui-space-1)",
	},
	// The PGN summary tooltip is a pointer convenience. The same wording is in
	// the NMEA 2000 output description of the expanded editor, which is where a
	// keyboard or touch user reads it.
	pgnHover: {
		cursor: "help",
		textDecoration: "underline dotted",
		textUnderlineOffset: 2,
	},
	trailing: {
		display: "inline-flex",
		alignItems: "center",
		gap: "var(--snui-space-2)",
		flexShrink: 0,
	},
	recency: {
		marginInlineStart: "auto",
		whiteSpace: "nowrap",
		// Yields before the toggle does: on a narrow row the conversion name
		// matters more than the exact age, so this ellipsizes rather than holding
		// its full width and starving the control beside it.
		flexShrink: 1,
		minWidth: 0,
		overflow: "hidden",
		textOverflow: "ellipsis",
	},
	detail: {
		background: "var(--snui-color-background)",
		borderTop: "1px solid var(--snui-color-border)",
		padding: "var(--snui-space-3) var(--snui-space-4)",
		paddingInlineStart: "var(--snui-space-8)",
	},
	// A mapping row sits under its parent conversion, so it indents one step.
	childRow: { paddingInlineStart: "var(--snui-space-6)" },
	// The library's foundation reset zeroes list margins but not the user
	// agent's inset, so every bulleted list the panel renders takes this one
	// value rather than a mix of token and user-agent indents.
	bulletList: { margin: 0, paddingInlineStart: "var(--snui-space-5)" },
} satisfies Record<string, CSSProperties>;
