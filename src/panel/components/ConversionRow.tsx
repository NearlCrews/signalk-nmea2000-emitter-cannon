import type * as React from "react";
import { Fragment, memo, useCallback } from "react";
import { Badge, Checkbox, StatusIndicator, Text } from "signalk-nearlcrews-ui";
import { useDisclosure } from "signalk-nearlcrews-ui/composites";
import { pgnSummaryFor } from "../../api/pgnSummaries.js";
import type { ConversionMetadata, PerConversionStatus } from "../../api/types.js";
import { emptyConversionConfig } from "../../config/defaults.js";
import type { ConversionConfig } from "../../config/schema.js";
import type { ConfigIssue } from "../../config/validation.js";
import { splitPgnTitle } from "../../utils/pgnUtils.js";
import { CONVERSION_STYLES as C } from "../conversionStyles";
import type { Action } from "../hooks/useConfig";
import { conversionRowId } from "../rowIds";
import type { RailState } from "../rowStatus.js";
import { rowStatus } from "../rowStatus.js";
import ConversionDetail from "./ConversionDetail";

const EMPTY_CFG: ConversionConfig = emptyConversionConfig();

const RAIL_STYLE: Record<RailState, React.CSSProperties> = {
	emitting: C.railEmitting,
	silent: C.railSilent,
	error: C.railError,
	disabled: C.railDisabled,
};

// splitPgnTitle returns { prefix, pgns, suffix } where prefix is the
// descriptive name (the truncating part) and pgns plus suffix are the PGN run
// (never clipped). Reconstruct without adding extra parens.
function renderTitle(title: string): React.ReactNode {
	const parts = splitPgnTitle(title);
	if (!parts) return <span style={C.title}>{title}</span>;
	return (
		<span style={C.titleWrap}>
			<span style={C.title}>{parts.prefix.trimEnd()}</span>
			<span style={C.pgn}>
				{parts.pgns.map((p, i) => (
					<Fragment key={p}>
						{i > 0 ? ", " : null}
						<span style={C.pgnHover} title={pgnSummaryFor(p)}>
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
	childStatuses: PerConversionStatus[];
	validationIssues: ConfigIssue[];
	expanded: boolean;
	dispatch: React.Dispatch<Action>;
	setExpanded: (key: string) => void;
	sourcesFor: (p: string) => string[];
	sourceErrorFor: (p: string) => string | null;
	ensureLoaded: (p: string, force?: boolean) => Promise<void>;
	globalResendSeconds: number;
	availablePaths: string[];
	pathsLoading: boolean;
	pathsRefreshing: boolean;
	pathsError: string | null;
	reloadPaths: () => void;
}

function ConversionRow(props: Props): React.ReactElement {
	const { dispatch, setExpanded } = props;
	const key = props.meta.key;
	const cfg = props.config ?? EMPTY_CFG;

	// The parent owns the single-open state, so this disclosure is controlled:
	// the hook supplies the ids, aria-expanded, aria-controls, the hidden body,
	// and the focus handoff (into the editor when opened through the trigger,
	// back to the trigger when closed through it). A collapse caused by another
	// row opening arrives as a prop change and moves no focus, which is right,
	// because focus is already on the row that was pressed. The id prefix names
	// both ends of the pair, so a jump can focus this row's toggle by id.
	const onOpenChange = useCallback(() => setExpanded(key), [setExpanded, key]);
	const { panelProps, toggle, triggerProps } = useDisclosure({
		idPrefix: conversionRowId(key),
		open: props.expanded,
		onOpenChange,
	});

	const onSetEnabled = useCallback(
		(enabled: boolean) => dispatch({ type: "setEnabled", key, enabled }),
		[dispatch, key],
	);
	const onSetResend = useCallback(
		(ms: number) => dispatch({ type: "setResend", key, ms }),
		[dispatch, key],
	);
	const onSetSource = useCallback(
		(path: string, source: string) => dispatch({ type: "setSource", key, path, source }),
		[dispatch, key],
	);
	const onSetExtras = useCallback(
		(extras: Record<string, unknown>) => dispatch({ type: "setExtras", key, extras }),
		[dispatch, key],
	);
	const onCheckboxChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => onSetEnabled(e.target.checked),
		[onSetEnabled],
	);
	const onRowClick = useCallback(
		(e: React.MouseEvent<HTMLDivElement>) => {
			if ((e.target as HTMLElement).closest("input, button, select, a, label")) return;
			toggle();
		},
		[toggle],
	);

	const { rail, recency } = rowStatus(props.status, cfg.enabled);

	return (
		// Outer: carries the bottom divider only. The rail lives on the header
		// below, so it stays a short tick and does not run down the detail body.
		<div id={conversionRowId(key)} style={C.outer}>
			{/* Inner header: pointer convenience; the toggle button carries all
			    keyboard semantics so the div must NOT take a role of its own. */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: the row click only delegates to the toggle button, which carries the keyboard semantics itself. */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: pointer convenience only; the nested toggle button remains the accessible control, so the row must NOT take a role of its own. */}
			<div style={{ ...C.row, ...RAIL_STYLE[rail] }} onClick={onRowClick}>
				<Checkbox
					label={`Enable ${props.meta.title}`}
					labelVisibility="hidden"
					checked={cfg.enabled}
					onChange={onCheckboxChange}
				/>
				<button {...triggerProps} type="button" style={C.toggle}>
					<span style={C.caret} aria-hidden="true">
						{props.expanded ? "▾" : "▸"}
					</span>
					{renderTitle(props.meta.title)}
				</button>
				<span style={C.trailing}>
					{props.meta.legacy ? <Badge>Legacy</Badge> : null}
					{props.status?.lastErrorMessage ? (
						<StatusIndicator size="compact" tone="danger">
							{props.status.lastErrorMessage}
						</StatusIndicator>
					) : null}
				</span>
				{recency ? (
					<span style={C.recency}>
						<Text tone="muted" size="xs">
							{recency}
						</Text>
					</span>
				) : null}
			</div>
			{/* The editor region: a full-width sibling below the header. It stays in
			    the tree while collapsed (hidden) so aria-controls always resolves;
			    the editor itself mounts only while open. */}
			<section {...panelProps} style={props.expanded ? C.detail : undefined}>
				{props.expanded ? (
					<ConversionDetail
						meta={props.meta}
						cfg={cfg}
						status={props.status}
						childStatuses={props.childStatuses}
						validationIssues={props.validationIssues}
						bodyId={panelProps.id}
						onSetResend={onSetResend}
						onSetSource={onSetSource}
						onSetExtras={onSetExtras}
						sourcesFor={props.sourcesFor}
						sourceErrorFor={props.sourceErrorFor}
						ensureLoaded={props.ensureLoaded}
						globalResendSeconds={props.globalResendSeconds}
						availablePaths={props.availablePaths}
						pathsLoading={props.pathsLoading}
						pathsRefreshing={props.pathsRefreshing}
						pathsError={props.pathsError}
						reloadPaths={props.reloadPaths}
					/>
				) : null}
			</section>
		</div>
	);
}

export default memo(ConversionRow);
