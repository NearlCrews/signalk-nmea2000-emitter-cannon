import type * as React from "react";
import { useMemo } from "react";
import {
	Badge,
	Banner,
	Button,
	Card,
	Cluster,
	Code,
	CollapsibleSection,
	FieldGroup,
	formatRelativeAge,
	LiveRegion,
	NumberField,
	Section,
	Stack,
	StatusIndicator,
	type StatusTone,
	Text,
} from "signalk-nearlcrews-ui";
import { pgnSummaryFor } from "../../api/pgnSummaries.js";
import type { ConversionMetadata, PerConversionStatus } from "../../api/types.js";
import type { ConversionConfig } from "../../config/schema.js";
import type { ConfigIssue } from "../../config/validation.js";
import { pathToPropName } from "../../utils/pathUtils.js";
import { ConfigIssueContext, type RenderedConfigIssue } from "../configIssues";
import { CONVERSION_STYLES as C } from "../conversionStyles";
import { plural } from "../recency";
import { conversionHealth } from "../rowStatus.js";
import ExtrasEditor from "./ExtrasEditor";
import SourceField from "./SourceField";

// The Garmin compatibility hint as a toned badge: the label carries the
// meaning and the tone glyph and color reinforce it.
const COMPATIBILITY: Record<
	"consumes" | "ignores" | "partial",
	{ tone: StatusTone; label: string }
> = {
	consumes: { tone: "success", label: "Garmin: displays" },
	partial: { tone: "warning", label: "Garmin: partial" },
	ignores: { tone: "neutral", label: "Garmin: ignores" },
};

/**
 * What each emitted PGN carries, in plain language. The dense row offers the
 * same wording as a pointer tooltip, which never fires on a touchscreen and is
 * unreachable by keyboard, so the editor states it as text.
 */
function describePgns(pgns: string[]): string {
	return pgns
		.map((pgn) => {
			const summary = pgnSummaryFor(pgn);
			return summary === undefined ? null : `PGN ${pgn}: ${summary}.`;
		})
		.filter((sentence) => sentence !== null)
		.join(" ");
}

interface Props {
	meta: ConversionMetadata;
	cfg: ConversionConfig;
	status: PerConversionStatus | undefined;
	childStatuses: PerConversionStatus[];
	validationIssues: ConfigIssue[];
	/** id of the disclosure region that wraps this editor. */
	bodyId: string;
	onSetResend: (ms: number) => void;
	onSetSource: (path: string, source: string) => void;
	onSetExtras: (extras: Record<string, unknown>) => void;
	sourcesFor: (p: string) => string[];
	sourceErrorFor: (p: string) => string | null;
	ensureLoaded: (p: string, force?: boolean) => Promise<void>;
	globalResendSeconds: number;
	availablePaths: string[];
	/** True until the first path-inventory response arrives. */
	pathsLoading: boolean;
	/** True only while a refresh the user asked for is in flight. */
	pathsRefreshing: boolean;
	pathsError: string | null;
	reloadPaths: () => void;
}

export default function ConversionDetail(props: Props): React.ReactElement {
	const { meta, cfg, status } = props;
	const hasMappedInputs = meta.extras.type.endsWith("Mapping");
	const hasFixedInputs = meta.paths.length > 0 && !hasMappedInputs;

	// The resend description says what a 0 (inherit) resolves to: the global
	// interval in seconds, or that global resend is disabled.
	const resendDescription =
		props.globalResendSeconds === 0
			? "0 uses the global setting, and global resend is currently disabled."
			: `0 uses the global setting, currently every ${props.globalResendSeconds} s.`;

	const errorAgeSuffix =
		status?.lastErrorAgeMs !== undefined ? ` (${formatRelativeAge(status.lastErrorAgeMs)})` : "";

	const hasValidationError = props.validationIssues.some((issue) => issue.severity === "error");

	const compatibility = meta.compatibility;
	const compat = compatibility ? COMPATIBILITY[compatibility.garmin] : null;
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
	const pgnMeanings = describePgns(meta.pgns);
	const outputSummary =
		meta.pgns.length === 0
			? "Configure the NMEA 2000 message emitted by this conversion."
			: `Emits ${meta.pgns.map((pgn) => `PGN ${pgn}`).join(", ")}.${pgnMeanings === "" ? "" : ` ${pgnMeanings}`}`;
	const activeMappedPublisherFilters = meta.paths.filter(
		(path) => (cfg.sources[path] ?? cfg.sources[pathToPropName(path)] ?? "").length > 0,
	).length;

	// Each issue's message is rendered once, in the banner below, and the
	// controls it names point at that list item. Publishing the pairing lets a
	// mapping cell or a publisher select render its own aria-invalid and
	// aria-describedby in JSX, from the issue's own field, row, and collection.
	const renderedIssues: RenderedConfigIssue[] = useMemo(
		() =>
			props.validationIssues.map((issue, index) => ({
				issue,
				messageId: `${props.bodyId}-validation-${index}`,
			})),
		[props.validationIssues, props.bodyId],
	);

	// One region per urgency, mounted before any message so a screen reader
	// observes the text change rather than the insertion of the region. The
	// banners below stay as persistent, readable feedback.
	const alertMessage = status?.lastErrorMessage
		? `Emit error: ${status.lastErrorMessage}`
		: hasValidationError
			? `${plural(props.validationIssues.length, "configuration issue")} in ${meta.title}.`
			: "";
	const statusMessage =
		alertMessage === "" && props.validationIssues.length > 0
			? `${plural(props.validationIssues.length, "configuration issue")} in ${meta.title}.`
			: alertMessage === "" && cfg.enabled && healthMessage
				? healthMessage
				: "";

	const outputControls = (
		<Stack gap={3}>
			{meta.canResend ? (
				<NumberField
					label="Resend interval"
					unit="seconds"
					description={resendDescription}
					layout="inline"
					value={cfg.resend}
					onValueChange={props.onSetResend}
					min={0}
					integer
					fallback={0}
				/>
			) : null}
			<ExtrasEditor
				conversionKey={meta.key}
				meta={meta.extras}
				value={cfg.extras}
				onChange={props.onSetExtras}
				availablePaths={props.availablePaths}
			/>
		</Stack>
	);
	// The same publisher-filter list serves both layouts: fixed-path
	// conversions show it as their Signal K input group, and mapped ones behind
	// the advanced disclosure.
	const publisherFilters = (
		<Stack gap={3}>
			{meta.paths.map((path) => (
				<SourceField
					key={path}
					path={path}
					// Read both the panel's native dotted-SK-path key and the dotless
					// propName legacy form. Configuration storage remains unchanged by
					// the clearer presentation.
					value={cfg.sources[path] ?? cfg.sources[pathToPropName(path)] ?? ""}
					onChange={(source) => props.onSetSource(path, source)}
					sourcesFor={props.sourcesFor}
					sourceErrorFor={props.sourceErrorFor}
					ensureLoaded={props.ensureLoaded}
				/>
			))}
		</Stack>
	);
	// The background poll refreshes this inventory every 30 seconds. Only a
	// refresh the user asked for changes this text or marks the button busy, so
	// the poll neither announces nor pretends the user started something.
	const inventoryStatus = props.pathsLoading
		? "Loading the Signal K server path inventory..."
		: props.pathsRefreshing
			? "Refreshing Signal K server path inventory..."
			: props.pathsError
				? `Signal K server path inventory unavailable: ${props.pathsError}`
				: `${props.availablePaths.length} paths in the Signal K server inventory.`;
	const availablePathSet = new Set(props.availablePaths);
	const mappingActivity =
		hasMappedInputs && props.childStatuses.length > 0 ? (
			<Section
				title="Mapping activity"
				headingLevel={4}
				landmark={false}
				description="Runtime rows are tracked separately. Each required path shows whether the server lists it and when this plugin last received a value from it."
			>
				<Stack as="ul" gap={3}>
					{props.childStatuses.map((child, childIndex) => {
						const childHealth = conversionHealth(child);
						const rowNumber = (child.mappingIndex ?? childIndex) + 1;
						const childTone: StatusTone = child.lastErrorMessage
							? "danger"
							: childHealth.state === "emitting"
								? "success"
								: "warning";
						return (
							<li key={child.key}>
								<Card density="compact">
									<Stack gap={2}>
										<Cluster justify="between" gap={2}>
											<Text as="strong">Mapping row {rowNumber}</Text>
											<StatusIndicator tone={childTone}>
												{child.lastErrorMessage ?? childHealth.label}
											</StatusIndicator>
										</Cluster>
										{(child.inputPaths?.length ?? 0) > 0 ? (
											<Stack as="ul" gap={1}>
												{child.inputPaths?.map((path) => {
													const lastSeenMs = child.inputPathLastSeenMs?.[path];
													const listed = availablePathSet.has(path);
													const stale = child.staleInputPaths?.includes(path) ?? false;
													return (
														<li key={path}>
															<Cluster justify="between" gap={2}>
																<Code>{path}</Code>
																<Text tone={stale || !listed ? "warning" : "muted"} size="sm">
																	{listed ? "listed by server" : "not in server inventory"};{" "}
																	{lastSeenMs === undefined
																		? "no value seen this run"
																		: `${stale ? "stale, " : ""}last seen ${formatRelativeAge(lastSeenMs)}`}
																</Text>
															</Cluster>
														</li>
													);
												})}
											</Stack>
										) : (
											<Text as="p" tone="muted" size="sm">
												This row emits from saved configuration, not Signal K paths.
											</Text>
										)}
									</Stack>
								</Card>
							</li>
						);
					})}
				</Stack>
			</Section>
		) : null;

	return (
		<ConfigIssueContext value={renderedIssues}>
			<Stack gap={3}>
				<LiveRegion live="assertive" message={alertMessage} />
				<LiveRegion live="polite" message={statusMessage} />
				{props.validationIssues.length > 0 ? (
					<Banner title="Configuration issue" tone={hasValidationError ? "danger" : "warning"}>
						<ul style={C.bulletList}>
							{renderedIssues.map(({ issue, messageId }) => (
								<li
									id={messageId}
									key={`${issue.field}:${issue.rowIndex ?? "all"}:${issue.message}`}
								>
									{issue.rowIndex === undefined ? "" : `Row ${issue.rowIndex + 1}: `}
									{issue.message}
								</li>
							))}
						</ul>
					</Banner>
				) : null}
				{/* Inline error banner: the same message the header's error mark
				    carries, shown in full for touchscreens where a tooltip is
				    unreachable. */}
				{status?.lastErrorMessage ? (
					<Banner title="Emit error" tone="danger">
						{status.lastErrorMessage}
						{errorAgeSuffix}
					</Banner>
				) : null}
				{cfg.enabled && !status?.lastErrorMessage && healthMessage ? (
					<StatusIndicator tone={health.state === "waiting-input" ? "info" : "warning"}>
						{healthMessage}
					</StatusIndicator>
				) : null}
				{meta.purpose ? (
					<Text as="p" tone="muted" size="sm">
						{meta.purpose}
					</Text>
				) : null}
				{/* Usage note in the expanded body only, on the info palette:
				    a permanently visible amber box devalued real cautions. */}
				{meta.description ? (
					<Banner role="note" tone="info" title="Note">
						{meta.description}
					</Banner>
				) : null}
				{/* Compatibility and legacy notes as visible body text so the
				    information is reachable without a mouse hover. */}
				{compat ? (
					<Cluster gap={2}>
						<Badge tone={compat.tone}>{compat.label}</Badge>
						{compatibility?.note ? (
							<Text tone="muted" size="sm">
								{compatibility.note}
							</Text>
						) : null}
					</Cluster>
				) : null}
				{meta.legacy ? (
					<Text as="p" tone="muted" size="sm">
						Legacy: {meta.legacy.note} Superseded by {meta.legacy.supersededBy}.
					</Text>
				) : null}
				{/* Fixed paths and mapped assets both keep Signal K input identity
				    separate from NMEA 2000 output settings. Mapping tables add a second
				    grouped header so each input identity and output instance remain paired. */}
				{hasFixedInputs ? (
					<>
						<FieldGroup
							legend="Signal K input"
							description="These paths are defined by the conversion and cannot be changed here."
						>
							{publisherFilters}
						</FieldGroup>
						<FieldGroup legend="NMEA 2000 output" description={outputSummary}>
							{outputControls}
						</FieldGroup>
					</>
				) : hasMappedInputs ? (
					<>
						{mappingActivity}
						<FieldGroup
							legend="Signal K to NMEA 2000 mapping"
							description={`Choose the Signal K asset on the left and its NMEA 2000 identity on the right. Asset ids from the Signal K server path inventory are suggested when available. ${outputSummary}`}
						>
							<Stack gap={3}>
								<Cluster justify="between" align="center" gap={2}>
									<StatusIndicator live="polite" tone={props.pathsError ? "warning" : "neutral"}>
										{inventoryStatus}
									</StatusIndicator>
									<Button
										size="compact"
										onClick={props.reloadPaths}
										loading={props.pathsRefreshing}
										loadingLabel="Refreshing"
									>
										{props.pathsError ? "Retry path inventory" : "Refresh path inventory"}
									</Button>
								</Cluster>
								{outputControls}
							</Stack>
						</FieldGroup>
						{meta.paths.length > 0 ? (
							<CollapsibleSection
								title="Advanced publisher filters"
								headingLevel={4}
								mountStrategy="unmount"
								summary={
									activeMappedPublisherFilters > 0
										? `${activeMappedPublisherFilters} active`
										: "All publishers"
								}
								summaryPlacement="header"
								summaryVisibility="always"
							>
								<Stack gap={3}>
									<Text as="p" tone="muted" size="sm">
										These paths come from the mapping above. Add a publisher filter only when more
										than one source publishes the same path.
									</Text>
									{publisherFilters}
								</Stack>
							</CollapsibleSection>
						) : null}
					</>
				) : (
					<FieldGroup legend="NMEA 2000 output" description={outputSummary}>
						{outputControls}
					</FieldGroup>
				)}
			</Stack>
		</ConfigIssueContext>
	);
}
