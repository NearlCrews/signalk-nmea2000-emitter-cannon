import type * as React from "react";
import { useEffect } from "react";
import type { ConversionMetadata, PerConversionStatus } from "../../api/types.js";
import type { ConversionConfig } from "../../config/schema.js";
import type { ConfigIssue } from "../../config/validation.js";
import { pathToPropName } from "../../utils/pathUtils.js";
import { configIssueControls } from "../configIssueTarget";
import { CONVERSION_STYLES as C } from "../conversionStyles";
import { humanizeAgo } from "../recency.js";
import { conversionHealth } from "../rowStatus.js";
import { S } from "../styles";
import Disclosure from "./Disclosure";
import ExtrasEditor from "./ExtrasEditor";
import NumberInput from "./NumberInput";
import SourceField from "./SourceField";

// Compatibility badge colors reference theme tokens so the badge stays
// readable in both light and dark host themes.
const COMPATIBILITY_STYLES: Record<
	"consumes" | "ignores" | "partial",
	{ background: string; color: string; border: string; label: string }
> = {
	consumes: {
		background: "var(--skn-success-bg)",
		color: "var(--skn-success-fg)",
		border: "1px solid var(--skn-success-border)",
		label: "Garmin: displays",
	},
	partial: {
		background: "var(--skn-warn-bg)",
		color: "var(--skn-warn-fg)",
		border: "1px solid var(--skn-warn-border)",
		label: "Garmin: partial",
	},
	ignores: {
		background: "var(--skn-surface-raised)",
		color: "var(--skn-text-muted)",
		border: "1px solid var(--skn-border)",
		label: "Garmin: ignores",
	},
};

interface Props {
	meta: ConversionMetadata;
	cfg: ConversionConfig;
	status: PerConversionStatus | undefined;
	childStatuses: PerConversionStatus[];
	validationIssues: ConfigIssue[];
	bodyId: string;
	onSetResend: (ms: number) => void;
	onSetSource: (path: string, source: string) => void;
	onSetExtras: (extras: Record<string, unknown>) => void;
	sourcesFor: (p: string) => string[];
	sourceErrorFor: (p: string) => string | null;
	ensureLoaded: (p: string, force?: boolean) => Promise<void>;
	globalResendSeconds: number;
	availablePaths: string[];
	pathsLoading: boolean;
	pathsError: string | null;
	reloadPaths: () => void;
}

export default function ConversionDetail(props: Props): React.ReactElement {
	const { meta, cfg, status } = props;
	const hasMappedInputs = meta.extras.type.endsWith("Mapping");
	const hasFixedInputs = meta.paths.length > 0 && !hasMappedInputs;

	// Resend placeholder shows what a 0 (inherit) resolves to: the global
	// interval in seconds, or that global resend is disabled.
	const resendPlaceholder =
		props.globalResendSeconds === 0
			? "global resend disabled"
			: `global: ${props.globalResendSeconds} s`;

	const errorAgeSuffix =
		status?.lastErrorAgeMs !== undefined ? ` (${humanizeAgo(status.lastErrorAgeMs)})` : "";

	const compatibility = meta.compatibility;
	const compatStyle = compatibility ? COMPATIBILITY_STYLES[compatibility.garmin] : null;
	const health = conversionHealth(status);
	const healthMessage =
		health.state === "publisher-filter-mismatch"
			? "Recent values were rejected because the configured publisher filter did not match. Select the correct publisher id or clear the filter."
			: health.state === "nmea2000-echo-blocked"
				? "Recent input came from NMEA 2000 and was blocked to prevent an echo loop. Use an off-bus Signal K provider for this conversion."
				: health.state === "input-no-output"
					? "Signal K input is arriving, but the current values are incomplete, stale, invalid, or do not produce an encodable PGN."
					: health.state === "input-stale"
						? status?.staleChildCount
							? `Previously active inputs are stale in ${status.staleChildCount} mapping row${status.staleChildCount === 1 ? "" : "s"}. Expand Mapping activity below to identify the row and paths.`
							: `Previously active Signal K input is stale${status?.staleInputPaths?.length ? `: ${status.staleInputPaths.join(", ")}` : "."}`
						: health.state === "activity-stale"
							? status?.staleChildCount
								? `Expected activity is overdue for ${status.staleChildCount} mapping row${status.staleChildCount === 1 ? "" : "s"}. Expand Mapping activity below to identify the row.`
								: "Expected timer, refresh, or resend activity is overdue. Check the required inputs and server log."
							: health.state === "waiting-input"
								? "Waiting for data on the required Signal K input paths."
								: null;
	const outputSummary =
		meta.pgns.length === 0
			? "Configure the NMEA 2000 message emitted by this conversion."
			: `Emits ${meta.pgns.map((pgn) => `PGN ${pgn}`).join(", ")}.`;
	const activeMappedPublisherFilters = meta.paths.filter(
		(path) => (cfg.sources[path] ?? cfg.sources[pathToPropName(path)] ?? "").length > 0,
	).length;

	// Associate validation messages with the offending mapping-row controls.
	// The validator reports a row index but mapping editors do not share field
	// component types, so mark every control in that row and point it to the
	// precise issue text. The top-level banner still handles navigation.
	useEffect(() => {
		const root = document.getElementById(props.bodyId);
		if (!root) return;
		const touched = new Map<
			HTMLElement,
			{ ariaInvalid: string | null; ariaDescribedBy: string | null }
		>();
		for (const [index, issue] of props.validationIssues.entries()) {
			const controls = configIssueControls(root, issue);
			for (const control of controls) {
				if (!touched.has(control)) {
					touched.set(control, {
						ariaInvalid: control.getAttribute("aria-invalid"),
						ariaDescribedBy: control.getAttribute("aria-describedby"),
					});
				}
				control.setAttribute("aria-invalid", "true");
				const messageId = `${props.bodyId}-validation-${index}`;
				const describedBy = control.getAttribute("aria-describedby");
				control.setAttribute(
					"aria-describedby",
					describedBy ? `${describedBy} ${messageId}` : messageId,
				);
			}
		}
		return () => {
			for (const [control, original] of touched) {
				if (original.ariaInvalid === null) control.removeAttribute("aria-invalid");
				else control.setAttribute("aria-invalid", original.ariaInvalid);
				if (original.ariaDescribedBy === null) control.removeAttribute("aria-describedby");
				else control.setAttribute("aria-describedby", original.ariaDescribedBy);
			}
		};
	}, [props.bodyId, props.validationIssues]);

	const outputControls = (
		<>
			{meta.canResend ? (
				<div style={C.fieldStack}>
					<span style={C.fieldStackLabel}>Resend interval (seconds, 0 = use global setting)</span>
					<NumberInput
						value={cfg.resend}
						onChange={props.onSetResend}
						min={0}
						placeholder={resendPlaceholder}
						ariaLabel={`Resend interval seconds for ${meta.title}`}
					/>
				</div>
			) : null}
			<ExtrasEditor
				conversionKey={meta.key}
				meta={meta.extras}
				value={cfg.extras}
				onChange={props.onSetExtras}
				availablePaths={props.availablePaths}
			/>
		</>
	);
	const availablePathSet = new Set(props.availablePaths);
	const mappingActivity =
		hasMappedInputs && props.childStatuses.length > 0 ? (
			<fieldset style={C.semanticGroup}>
				<legend style={C.semanticGroupLegend}>Mapping activity</legend>
				<p style={C.semanticGroupIntro}>
					Runtime rows are tracked separately. Each required path shows whether the server lists it
					and when this plugin last received a value from it.
				</p>
				<ul style={C.mappingActivityList}>
					{props.childStatuses.map((child, childIndex) => {
						const childHealth = conversionHealth(child);
						const rowNumber = (child.mappingIndex ?? childIndex) + 1;
						return (
							<li key={child.key} style={C.mappingActivityItem}>
								<div style={C.mappingActivityHeader}>
									<strong>Mapping row {rowNumber}</strong>
									<span
										style={
											child.lastErrorMessage || childHealth.state !== "emitting"
												? S.textWarning
												: S.textFaint
										}
									>
										{child.lastErrorMessage ?? childHealth.label}
									</span>
								</div>
								{(child.inputPaths?.length ?? 0) > 0 ? (
									<ul style={C.mappingPathList}>
										{child.inputPaths?.map((path) => {
											const lastSeenMs = child.inputPathLastSeenMs?.[path];
											const listed = availablePathSet.has(path);
											const stale = child.staleInputPaths?.includes(path) ?? false;
											return (
												<li key={path} style={C.mappingPathItem}>
													<code style={C.mappingPathCode}>{path}</code>
													<span style={stale || !listed ? S.textWarning : S.textFaint}>
														{listed ? "listed by server" : "not in server inventory"};{" "}
														{lastSeenMs === undefined
															? "no value seen this run"
															: `${stale ? "stale, " : ""}last seen ${humanizeAgo(lastSeenMs)}`}
													</span>
												</li>
											);
										})}
									</ul>
								) : (
									<p style={C.fieldHelp}>
										This row emits from saved configuration, not Signal K paths.
									</p>
								)}
							</li>
						);
					})}
				</ul>
			</fieldset>
		) : null;

	return (
		<div id={props.bodyId} style={C.detail}>
			{props.validationIssues.length > 0 ? (
				<div
					role={
						props.validationIssues.some((issue) => issue.severity === "error") ? "alert" : "status"
					}
					style={S.errorBanner}
				>
					<div>
						<strong>Configuration issue:</strong>
						<ul>
							{props.validationIssues.map((issue, index) => (
								<li
									id={`${props.bodyId}-validation-${index}`}
									key={`${issue.field}:${issue.rowIndex ?? "all"}:${issue.message}`}
								>
									{issue.rowIndex === undefined ? "" : `Row ${issue.rowIndex + 1}: `}
									{issue.message}
								</li>
							))}
						</ul>
					</div>
				</div>
			) : null}
			{/* Inline error banner: the same message the header's warning marks,
			    shown in full for touchscreens where the title tooltip is
			    unreachable. */}
			{status?.lastErrorMessage ? (
				<div role="alert" style={S.errorBanner}>
					<span>
						Error: {status.lastErrorMessage}
						{errorAgeSuffix}
					</span>
				</div>
			) : null}
			{cfg.enabled && !status?.lastErrorMessage && healthMessage ? (
				<p role="status" style={health.state === "waiting-input" ? C.fieldHelp : C.fieldWarning}>
					{healthMessage}
				</p>
			) : null}
			{meta.purpose ? <p style={S.cardPurpose}>{meta.purpose}</p> : null}
			{/* Usage note in the expanded body only, on the info palette:
			    a permanently visible amber box devalued real cautions. */}
			{meta.description ? (
				<div role="note" style={S.noteInfo}>
					<span style={S.notePrefix}>Note:</span>
					{meta.description}
				</div>
			) : null}
			{/* Compatibility and legacy notes as visible body text so the
			    information in the header badges' tooltips is reachable
			    without a mouse hover. */}
			{compatStyle ? (
				<p style={S.cardPurpose}>
					{compatStyle.label}
					{compatibility?.note ? `. ${compatibility.note}` : ""}
				</p>
			) : null}
			{meta.legacy ? (
				<p style={S.cardPurpose}>
					Legacy: {meta.legacy.note} Superseded by {meta.legacy.supersededBy}.
				</p>
			) : null}
			{/* Fixed paths and mapped assets both keep Signal K input identity
			    separate from NMEA 2000 output settings. Mapping tables add a second
			    grouped header so each input identity and output instance remain paired. */}
			{hasFixedInputs ? (
				<>
					<fieldset style={C.semanticGroup}>
						<legend style={C.semanticGroupLegend}>Signal K input</legend>
						<p style={C.semanticGroupIntro}>
							These paths are defined by the conversion and cannot be changed here.
						</p>
						{meta.paths.map((p) => (
							<SourceField
								key={p}
								path={p}
								idScope={meta.key}
								// Read both the panel's native dotted-SK-path key and
								// the dotless propName legacy form. Configuration storage
								// remains unchanged by the clearer presentation.
								value={cfg.sources[p] ?? cfg.sources[pathToPropName(p)] ?? ""}
								onChange={(s) => props.onSetSource(p, s)}
								sourcesFor={props.sourcesFor}
								sourceErrorFor={props.sourceErrorFor}
								ensureLoaded={props.ensureLoaded}
							/>
						))}
					</fieldset>
					<fieldset style={C.semanticGroup}>
						<legend style={C.semanticGroupLegend}>NMEA 2000 output</legend>
						<p style={C.semanticGroupIntro}>{outputSummary}</p>
						{outputControls}
					</fieldset>
				</>
			) : hasMappedInputs ? (
				<>
					{mappingActivity}
					<fieldset style={C.semanticGroup}>
						<legend style={C.semanticGroupLegend}>Signal K to NMEA 2000 mapping</legend>
						<p style={C.semanticGroupIntro}>
							Choose the Signal K asset on the left and its NMEA 2000 identity on the right. Asset
							ids from the Signal K server path inventory are suggested when available.{" "}
							{outputSummary}
						</p>
						<div style={C.discoveryStatus}>
							<span role="status" style={C.discoveryMessage}>
								{props.pathsLoading
									? "Refreshing Signal K server path inventory..."
									: props.pathsError
										? `Signal K server path inventory unavailable: ${props.pathsError}`
										: `${props.availablePaths.length} paths in the Signal K server inventory.`}
							</span>
							<button
								type="button"
								style={S.btnSecondarySm}
								onClick={props.reloadPaths}
								disabled={props.pathsLoading}
							>
								{props.pathsError ? "Retry path inventory" : "Refresh path inventory"}
							</button>
						</div>
						{outputControls}
					</fieldset>
					{meta.paths.length > 0 ? (
						<div style={C.advancedFilters}>
							<Disclosure
								id={`skn-advanced-publishers-${meta.key}`}
								label="Advanced publisher filters"
								summary={
									activeMappedPublisherFilters > 0
										? `${activeMappedPublisherFilters} active`
										: "All publishers"
								}
								lazy
							>
								<p style={C.semanticGroupIntro}>
									These paths come from the mapping above. Add a publisher filter only when more
									than one source publishes the same path.
								</p>
								{meta.paths.map((path) => (
									<SourceField
										key={path}
										path={path}
										idScope={meta.key}
										value={cfg.sources[path] ?? cfg.sources[pathToPropName(path)] ?? ""}
										onChange={(source) => props.onSetSource(path, source)}
										sourcesFor={props.sourcesFor}
										sourceErrorFor={props.sourceErrorFor}
										ensureLoaded={props.ensureLoaded}
									/>
								))}
							</Disclosure>
						</div>
					) : null}
				</>
			) : (
				<fieldset style={C.semanticGroup}>
					<legend style={C.semanticGroupLegend}>NMEA 2000 output</legend>
					<p style={C.semanticGroupIntro}>{outputSummary}</p>
					{outputControls}
				</fieldset>
			)}
		</div>
	);
}
