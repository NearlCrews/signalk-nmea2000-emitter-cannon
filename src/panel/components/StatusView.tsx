import type * as React from "react";
import { memo } from "react";
import {
	Cluster,
	Code,
	formatRelativeAge,
	Metric,
	MetricGrid,
	Section,
	Stack,
	StatusIndicator,
	Text,
	VisuallyHidden,
} from "signalk-nearlcrews-ui";
import {
	Table,
	TableCell,
	TableHeaderCell,
	TableScrollRegion,
} from "signalk-nearlcrews-ui/composites";
import type { ConversionMetadata, PerConversionStatus, StatusSnapshot } from "../../api/types.js";
import { stripSubIndex } from "../../utils/pathUtils.js";
import { extractPgnsFromTitle } from "../../utils/pgnUtils.js";
import { CONVERSION_STYLES as C } from "../conversionStyles";
import { OUTPUT_STATE_LABELS, OUTPUT_STATE_TONES, outputStateFor } from "../outputState";
import { conversionHealth } from "../rowStatus.js";
import ErrorBadgeButton from "./ErrorBadgeButton";

const STATUS_CAPTION_ID = "skn-status-table-caption";

interface Props {
	// Live status snapshot, or null before the first poll resolves.
	status: StatusSnapshot | null;
	// Conversion catalog keyed by option key (the parent's memoized map), used
	// to resolve each enabled row's PGN list. Factory sub-conversion rows
	// (`BATTERY[0]`) resolve via their parent key; the title parse is the
	// fallback only when no catalog entry exists at all.
	metaByKey: Map<string, ConversionMetadata>;
	// Jump to the first conversion reporting an error (the parent switches to
	// the Configure view and scrolls the card into view). The error badge is a
	// button wired to this.
	onErrorClick: () => void;
}

function pgnsFor(row: PerConversionStatus, byKey: Map<string, ConversionMetadata>): string {
	const m = byKey.get(row.key) ?? byKey.get(stripSubIndex(row.key));
	const pgns = m && m.pgns.length > 0 ? m.pgns : extractPgnsFromTitle(row.title);
	return pgns.join(", ");
}

function LoadedStatus({
	status,
	metaByKey,
	onErrorClick,
}: Props & { status: StatusSnapshot }): React.ReactElement {
	const enabledRows = status.perConversion.filter((c) => c.enabled && c.parentKey === undefined);
	const errorCount = enabledRows.filter((c) => c.lastErrorMessage).length;
	const totalEmits = enabledRows.reduce((n, c) => n + c.emitCount, 0);
	const childrenByParent = new Map<string, PerConversionStatus[]>();
	for (const row of status.perConversion) {
		if (!row.enabled || row.parentKey === undefined) continue;
		const children = childrenByParent.get(row.parentKey) ?? [];
		children.push(row);
		childrenByParent.set(row.parentKey, children);
	}
	for (const children of childrenByParent.values()) {
		children.sort((a, b) => (a.mappingIndex ?? 0) - (b.mappingIndex ?? 0));
	}
	// Each mapping row travels with the conversion that owns it: the visual cue
	// is an indent, which says nothing when the table is read row by row.
	const displayRows = enabledRows.flatMap((parent) => [
		{ row: parent, parentTitle: null },
		...(childrenByParent.get(parent.key) ?? []).map((child) => ({
			row: child,
			parentTitle: parent.title,
		})),
	]);
	const outputState = outputStateFor(status);
	const running = outputState === "waiting" || outputState === "ready";

	return (
		<Stack gap={4}>
			<MetricGrid>
				{/* Not a live region: the toolbar chip carries the same output state
				    from a region that is mounted before the first poll and stays
				    mounted whichever view is on screen, so announcing it here as
				    well would read the same change out twice. */}
				<Metric
					label="NMEA 2000"
					value={OUTPUT_STATE_LABELS[outputState]}
					tone={OUTPUT_STATE_TONES[outputState]}
				/>
				<Metric label="Enabled" value={`${status.enabledCount} / ${status.totalConversions}`} />
				<Metric label="Total emits" value={totalEmits} />
			</MetricGrid>
			{errorCount > 0 ? (
				<Cluster>
					<ErrorBadgeButton count={errorCount} onClick={onErrorClick} />
				</Cluster>
			) : null}

			{!running ? (
				<Text as="p" tone="muted">
					The plugin is not running. Enable it in the Signal K plugin list if it is disabled. If it
					is already enabled, check the plugin and server logs for its startup error.
				</Text>
			) : enabledRows.length === 0 ? (
				<Text as="p" tone="muted">
					No conversions enabled. Enable conversions in the Configure view to see live output here.
				</Text>
			) : (
				<TableScrollRegion aria-labelledby={STATUS_CAPTION_ID}>
					<Table caption={<span id={STATUS_CAPTION_ID}>Conversion runtime status</span>} zebra>
						<thead>
							<tr>
								<TableHeaderCell>Conversion</TableHeaderCell>
								<TableHeaderCell>PGNs</TableHeaderCell>
								<TableHeaderCell numeric>Inputs</TableHeaderCell>
								<TableHeaderCell numeric>Emits</TableHeaderCell>
								<TableHeaderCell>Last emit</TableHeaderCell>
								<TableHeaderCell>Status</TableHeaderCell>
							</tr>
						</thead>
						<tbody>
							{displayRows.map(({ row, parentTitle }) => {
								const recency =
									row.emitCount > 0 ? formatRelativeAge(row.lastEmitMs) : "no recent output";
								const health = conversionHealth(row);
								const waitingForBus = !status.nmea2000Ready && (row.inputCount ?? 0) > 0;
								return (
									<tr key={row.key}>
										<TableHeaderCell scope="row">
											{parentTitle !== null ? (
												<div style={C.childRow}>
													<VisuallyHidden>Under {parentTitle}: </VisuallyHidden>
													Mapping row {(row.mappingIndex ?? 0) + 1}
													{(row.inputPaths?.length ?? 0) > 0 ? (
														<div>
															<Code>{row.inputPaths?.join(", ")}</Code>
														</div>
													) : null}
												</div>
											) : (
												row.title
											)}
										</TableHeaderCell>
										<TableCell>
											<Text tone="muted">{pgnsFor(row, metaByKey) || "-"}</Text>
										</TableCell>
										<TableCell numeric>{row.inputCount ?? 0}</TableCell>
										<TableCell numeric>{row.emitCount}</TableCell>
										<TableCell>
											{row.emitCount > 0 ? recency : <Text tone="muted">{recency}</Text>}
										</TableCell>
										<TableCell>
											{row.lastErrorMessage ? (
												<StatusIndicator tone="danger">
													{row.lastErrorMessage}
													{row.lastErrorAgeMs !== undefined
														? ` (${formatRelativeAge(row.lastErrorAgeMs)})`
														: ""}
												</StatusIndicator>
											) : (
												<StatusIndicator
													tone={
														health.state === "emitting" && !waitingForBus ? "success" : "warning"
													}
												>
													{waitingForBus ? "Waiting for NMEA 2000 output" : health.label}
												</StatusIndicator>
											)}
										</TableCell>
									</tr>
								);
							})}
						</tbody>
					</Table>
				</TableScrollRegion>
			)}
		</Stack>
	);
}

/**
 * The read-only live-emit view behind the Status toggle. Memoized because it
 * stays mounted while the Configure view is on screen, so without it every
 * keystroke there re-ran the row grouping and re-rendered the whole table.
 */
function StatusView(props: Props): React.ReactElement {
	return (
		<Section title="Runtime status">
			{props.status ? (
				<LoadedStatus {...props} status={props.status} />
			) : (
				// Visible only. This renders in the panel's first commit, so there is
				// nothing for a live region to interrupt, and the toolbar chip is
				// what announces the poll landing.
				<StatusIndicator>Loading status...</StatusIndicator>
			)}
		</Section>
	);
}

export default memo(StatusView);
