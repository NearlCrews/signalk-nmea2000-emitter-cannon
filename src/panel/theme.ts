// Emitter-specific layout tokens and compatibility aliases. PanelRoot from
// signalk-nearlcrews-ui owns the theme palette; local domain styles bridge to
// its public token contract while they are progressively replaced by shared
// primitives. A new component color literal is a defect.

// Scale tokens: theme-independent, defined once on the root. Radii and font
// sizes sit on Bootstrap 5.3 defaults (radius .375rem = 6px, small text
// .875rem = 14px) so the panel reads native inside the CoreUI admin shell.
// The display size gives the wizard title and view-level headings one step of
// real contrast over the 15px card titles. Spacing runs an 8/12/16 scale so
// gutters stay on a consistent rhythm. Repeated component dimensions live
// here too, which keeps shared controls aligned across style modules.
const SCALE_TOKENS = `
	--skn-radius: 6px;
	--skn-radius-sm: 4px;
	--skn-radius-pill: 999px;
	--skn-font-body: 14px;
	--skn-font-small: 12px;
	--skn-font-title: 15px;
	--skn-font-display: 17px;
	--skn-space-half: 4px;
	--skn-space-compact: 6px;
	--skn-space-1: 8px;
	--skn-space-2: 12px;
	--skn-space-3: 16px;
	--skn-control-height: 36px;
	--skn-row-height: 40px;
	--skn-toolbar-height: 52px;
	--skn-status-dot-size: 10px;
	--skn-input-width: 220px;
	--skn-checkbox-size: 22px;
	--skn-table-cell-padding: 6px;
	--skn-disclosure-gap: 10px;
	--skn-field-padding: 6px 10px;
	--skn-control-padding: 6px 12px;
	--skn-transition-fast: 120ms;
	--skn-modal-backdrop: rgba(0, 0, 0, 0.5);
	--skn-modal-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
`;

const SHARED_THEME_BRIDGE = `
	--skn-bg: var(--snui-color-background);
	--skn-surface: var(--snui-color-surface);
	--skn-surface-muted: var(--snui-color-interactive-hover);
	--skn-surface-raised: var(--snui-color-surface-raised);
	--skn-border: var(--snui-color-border);
	--skn-text: var(--snui-color-text);
	--skn-text-muted: var(--snui-color-text-muted);
	--skn-text-faint: var(--snui-color-text-muted);
	--skn-accent: var(--snui-color-accent-fill);
	--skn-accent-text: var(--snui-color-on-accent);
	--skn-ok: var(--snui-color-success);
	--skn-wait: var(--snui-color-warning);
	--skn-off: var(--snui-color-text-muted);
	--skn-danger-bg: color-mix(in srgb, var(--snui-color-danger) 12%, var(--snui-color-surface));
	--skn-danger-fg: var(--snui-color-danger);
	--skn-danger-border: var(--snui-color-danger);
	--skn-warn-bg: color-mix(in srgb, var(--snui-color-warning) 12%, var(--snui-color-surface));
	--skn-warn-fg: var(--snui-color-warning);
	--skn-warn-border: var(--snui-color-warning);
	--skn-success-bg: color-mix(in srgb, var(--snui-color-success) 12%, var(--snui-color-surface));
	--skn-success-fg: var(--snui-color-success);
	--skn-success-border: var(--snui-color-success);
	--skn-info-bg: color-mix(in srgb, var(--snui-color-info) 12%, var(--snui-color-surface));
	--skn-info-fg: var(--snui-color-info);
	--skn-info-border: var(--snui-color-info);
`;

// Injected once by PluginConfigurationPanel for emitter-specific interaction
// and table behavior that is outside the shared component library.
export const THEME_STYLE = `
.skn-panel {
${SCALE_TOKENS}${SHARED_THEME_BRIDGE}}
.skn-panel input:focus-visible,
.skn-panel select:focus-visible,
.skn-panel button:focus-visible {
	outline: 2px solid var(--skn-accent);
	outline-offset: 1px;
}
/* Native form controls do not inherit the panel font-family, so they fall
   back to the browser default and read inconsistently with the rest of the
   panel. font-family only (not the font shorthand, which would clobber each
   control's own font-size). */
.skn-panel button,
.skn-panel input,
.skn-panel select,
.skn-panel textarea {
	font-family: inherit;
}
/* Buttons set their background as an inline style, which outranks the
   browser's default disabled appearance, so a disabled button would still
   look enabled. !important is required to override the inline style for the
   disabled state. */
.skn-panel button:disabled {
	background: var(--skn-surface-raised) !important;
	color: var(--skn-text-faint) !important;
	border-color: var(--skn-border) !important;
	cursor: not-allowed !important;
}
/* Pointer feedback. Inline styles cannot express :hover or :active, so the
   interactive elements get a shared brightness response here: a touch darker
   on hover, darker still while pressed, with a short transition so the shift
   reads as a response rather than a flicker. Disabled buttons opt out. Only
   buttons transition filter: inputs and selects never receive one. */
.skn-panel input,
.skn-panel select {
	transition:
		background-color var(--skn-transition-fast) ease,
		border-color var(--skn-transition-fast) ease;
}
.skn-panel button {
	transition:
		background-color var(--skn-transition-fast) ease,
		border-color var(--skn-transition-fast) ease,
		filter var(--skn-transition-fast) ease;
}
.skn-panel button:hover:not(:disabled) {
	filter: brightness(0.96);
}
.skn-panel button:active:not(:disabled) {
	filter: brightness(0.9);
}
/* Inputs and selects inside mapping-table cells flex with the column instead
   of holding the fixed 220px of S.input / S.select, so the table fits a phone
   without forcing horizontal scroll. min-width keeps each field usable when
   columns compress. !important is required because the base S.input and
   S.select widths arrive as inline styles, which outrank this rule. */
.skn-panel td input:not([type="checkbox"]),
.skn-panel td select {
	width: 100% !important;
	min-width: 120px !important;
	box-sizing: border-box !important;
}
.skn-toolbar { position: sticky; top: 0; z-index: 2; }
.skn-row { scroll-margin-top: var(--skn-toolbar-height); }
.skn-row:hover { filter: brightness(0.97); }
`;
