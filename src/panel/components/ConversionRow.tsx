import type * as React from "react";
import { Fragment, memo, useCallback, useEffect, useRef } from "react";
import { pgnSummaryFor } from "../../api/pgnSummaries.js";
import type {
	ConversionMetadata,
	PerConversionStatus,
} from "../../api/types.js";
import {
	type ConversionConfig,
	emptyConversionConfig,
} from "../../config/schema.js";
import { splitPgnTitle } from "../../utils/pgnUtils.js";
import type { Action } from "../hooks/useConfig";
import type { RailState } from "../rowStatus.js";
import { rowStatus } from "../rowStatus.js";
import { S } from "../styles";
import ConversionDetail from "./ConversionDetail";
import DisclosureCaret from "./DisclosureCaret";

const EMPTY_CFG: ConversionConfig = emptyConversionConfig();

const RAIL_STYLE: Record<RailState, React.CSSProperties> = {
	emitting: S.rowRailEmitting,
	silent: S.rowRailSilent,
	error: S.rowRailError,
	disabled: S.rowRailDisabled,
};

// Garmin badge: an 8px dot in a foreground token, with a visually-hidden label
// so the accessible name is on the collapsed row, not only in the title tooltip.
const COMPAT_DOT: Record<
	"partial" | "ignores",
	{ color: string; label: string }
> = {
	partial: {
		color: "var(--skn-warn-fg)",
		label: "Garmin compatibility: partial",
	},
	ignores: {
		color: "var(--skn-text-muted)",
		label: "Garmin compatibility: ignores",
	},
};

// splitPgnTitle returns { prefix, pgns, suffix } where prefix is the
// descriptive name (the truncating part) and pgns plus suffix are the PGN run
// (never clipped). Reconstruct without adding extra parens.
function renderTitle(title: string): React.ReactNode {
	const parts = splitPgnTitle(title);
	if (!parts) return <span style={S.rowTitle}>{title}</span>;
	return (
		<span style={S.rowTitleWrap}>
			<span style={S.rowTitle}>{parts.prefix}</span>
			<span style={S.rowPgn}>
				{parts.pgns.map((p, i) => (
					<Fragment key={p}>
						{i > 0 ? ", " : null}
						<span style={S.pgnHover} title={pgnSummaryFor(p)}>
							{p}
						</span>
					</Fragment>
				))}
				{parts.suffix}
			</span>
		</span>
	);
}

interface Props {
	meta: ConversionMetadata;
	config: ConversionConfig | undefined;
	status: PerConversionStatus | undefined;
	expanded: boolean;
	dispatch: React.Dispatch<Action>;
	setExpanded: (key: string) => void;
	sourcesFor: (p: string) => string[];
	ensureLoaded: (p: string) => Promise<void>;
	globalResendSeconds: number;
}

function ConversionRow(props: Props): React.ReactElement {
	const { dispatch, setExpanded } = props;
	const key = props.meta.key;
	const cfg = props.config ?? EMPTY_CFG;
	const bodyId = `skn-card-${key}`;
	const toggleRef = useRef<HTMLButtonElement>(null);
	const wasExpanded = useRef(props.expanded);

	const onSetEnabled = useCallback(
		(enabled: boolean) => dispatch({ type: "setEnabled", key, enabled }),
		[dispatch, key],
	);
	const onSetResend = useCallback(
		(ms: number) => dispatch({ type: "setResend", key, ms }),
		[dispatch, key],
	);
	const onSetSource = useCallback(
		(path: string, source: string) =>
			dispatch({ type: "setSource", key, path, source }),
		[dispatch, key],
	);
	const onSetExtras = useCallback(
		(extras: Record<string, unknown>) =>
			dispatch({ type: "setExtras", key, extras }),
		[dispatch, key],
	);
	const onToggle = useCallback(() => setExpanded(key), [setExpanded, key]);
	const onCheckboxChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => onSetEnabled(e.target.checked),
		[onSetEnabled],
	);
	const onRowClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if ((e.target as HTMLElement).closest("input, button, select, a, label"))
				return;
			setExpanded(key);
		},
		[setExpanded, key],
	);

	// Single-open focus return: when this row just collapsed and focus fell to
	// the body (its detail unmounted with focus inside it), return focus to
	// the toggle.
	useEffect(() => {
		if (wasExpanded.current && !props.expanded) {
			const active = document.activeElement;
			if (!active || active === document.body) toggleRef.current?.focus();
		}
		wasExpanded.current = props.expanded;
	}, [props.expanded]);

	const { rail, recency } = rowStatus(props.status, cfg.enabled);
	const compat = props.meta.compatibility?.garmin;
	const compatDot =
		compat === "partial" || compat === "ignores" ? COMPAT_DOT[compat] : null;

	return (
		// Outer: carries the bottom divider and the left rail.
		// RAIL_STYLE spreads over S.rowOuter to override the border-left.
		<div
			id={`skn-row-${key}`}
			className="skn-row"
			style={{ ...S.rowOuter, ...RAIL_STYLE[rail] }}
		>
			{/* Inner header: pointer convenience; the toggle button carries all
			    keyboard semantics so the div must NOT take a role of its own. */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: the row click only delegates to the toggle button, which carries the keyboard semantics itself. */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: pointer convenience only; the nested toggle button remains the accessible control, so the row must NOT take a role of its own. */}
			<div style={S.row} onClick={onRowClick}>
				<input
					type="checkbox"
					style={S.checkbox}
					checked={cfg.enabled}
					onChange={onCheckboxChange}
					aria-label={`Enable ${props.meta.title}`}
				/>
				<button
					id={`skn-row-toggle-${key}`}
					ref={toggleRef}
					type="button"
					style={S.rowMain}
					aria-expanded={props.expanded}
					aria-controls={bodyId}
					onClick={onToggle}
				>
					<DisclosureCaret expanded={props.expanded} />
					{renderTitle(props.meta.title)}
				</button>
				<span style={S.rowBadgeSlot}>
					{compatDot ? (
						<span
							aria-hidden="true"
							style={{ ...S.dot, background: compatDot.color }}
							title={compatDot.label}
						/>
					) : props.meta.legacy ? (
						<span
							aria-hidden="true"
							style={S.cardLegacy}
							title={`${props.meta.legacy.note} Superseded by ${props.meta.legacy.supersededBy}.`}
						>
							L
						</span>
					) : null}
					{compatDot ? (
						<span style={S.visuallyHidden}>{compatDot.label}</span>
					) : null}
					{props.meta.legacy && !compatDot ? (
						<span style={S.visuallyHidden}>Legacy</span>
					) : null}
				</span>
				{props.status?.lastErrorMessage ? (
					<span
						role="img"
						aria-label={`Error: ${props.status.lastErrorMessage}`}
						title={props.status.lastErrorMessage}
						style={S.errorMark}
					>
						⚠
					</span>
				) : null}
				{recency ? <span style={S.rowRecency}>{recency}</span> : null}
			</div>
			{/* Detail or hidden placeholder: full-width sibling below the header. */}
			{props.expanded ? (
				<ConversionDetail
					meta={props.meta}
					cfg={cfg}
					status={props.status}
					bodyId={bodyId}
					onSetResend={onSetResend}
					onSetSource={onSetSource}
					onSetExtras={onSetExtras}
					sourcesFor={props.sourcesFor}
					ensureLoaded={props.ensureLoaded}
					globalResendSeconds={props.globalResendSeconds}
				/>
			) : (
				<div id={bodyId} hidden />
			)}
		</div>
	);
}

export default memo(ConversionRow);
