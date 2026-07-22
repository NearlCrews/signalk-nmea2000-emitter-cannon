import type * as React from "react";
import type { ConversionMetadata, PerConversionStatus, StatusSnapshot } from "../../api/types.js";
import { stripSubIndex } from "../../utils/pathUtils.js";
import { extractPgnsFromTitle } from "../../utils/pgnUtils.js";
import { outputStateFor } from "../outputState";
import { humanizeAgo } from "../recency";
import { conversionHealth } from "../rowStatus.js";
import { STATUS_VIEW_STYLES as V } from "../statusStyles";
import { S } from "../styles";
import { TABLE_STYLES as T } from "../tableStyles";
import ErrorBadgeButton from "./ErrorBadgeButton";

// Placeholder shown before the first status poll resolves.
function StatusLoading(): React.ReactElement {
	return (
		<div style={S.statusBar} role="status">
			<span style={{ ...S.dot, ...S.dotOff }} aria-hidden="true" />
			<span>Loading status...</span>
		</div>
	);
}

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

export default function StatusView({ status, metaByKey, onErrorClick }: Props): React.ReactElement {
	if (!status) {
		return <StatusLoading />;
	}

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
	const displayRows = enabledRows.flatMap((parent) => [
		parent,
		...(childrenByParent.get(parent.key) ?? []),
	]);
	const outputState = outputStateFor(status);
	const running = outputState === "waiting" || outputState === "ready";
	const readyDot =
		outputState === "ready" ? S.dotOk : outputState === "waiting" ? S.dotWait : S.dotOff;

	// Plain container, not S.root: this view is already nested inside the
	// panel root, and doubling the root padding made the view toggle jump.
	return (
		<div>
			<div style={V.headerRow}>
				<span role="status">
					<span style={{ ...S.dot, ...readyDot, ...V.readyDot }} aria-hidden="true" />
					<span style={S.statLabel}>NMEA 2000 </span>
					<span style={S.statValue}>{outputState}</span>
				</span>
				<span>
					<span style={S.statLabel}>Enabled </span>
					<span style={S.statValue}>
						{status.enabledCount} / {status.totalConversions}
					</span>
				</span>
				<span>
					<span style={S.statLabel}>Total emits </span>
					<span style={S.statValue}>{totalEmits}</span>
				</span>
				{errorCount > 0 ? <ErrorBadgeButton count={errorCount} onClick={onErrorClick} /> : null}
			</div>

			{!running ? (
				<p style={V.emptyText}>
					The plugin is not running. Enable it in the Signal K plugin list if it is disabled. If it
					is already enabled, check the plugin and server logs for its startup error.
				</p>
			) : enabledRows.length === 0 ? (
				<p style={V.emptyText}>
					No conversions enabled. Enable conversions in the Configure view to see live output here.
				</p>
			) : (
				<section
					style={T.wrap}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: the horizontally scrollable table region must be keyboard focusable.
					tabIndex={0}
					aria-label="Conversion runtime status table"
				>
					<table style={T.table}>
						<thead>
							<tr style={T.headRow}>
								<th scope="col" style={V.headCell}>
									Conversion
								</th>
								<th scope="col" style={V.headCell}>
									PGNs
								</th>
								<th scope="col" style={{ ...V.headCell, textAlign: "right" }}>
									Inputs
								</th>
								<th scope="col" style={{ ...V.headCell, textAlign: "right" }}>
									Emits
								</th>
								<th scope="col" style={V.headCell}>
									Last emit
								</th>
								<th scope="col" style={V.headCell}>
									Status
								</th>
							</tr>
						</thead>
						<tbody>
							{displayRows.map((row) => {
								const recency =
									row.emitCount > 0 ? humanizeAgo(row.lastEmitMs) : "no recent output";
								const health = conversionHealth(row);
								const isChild = row.parentKey !== undefined;
								return (
									<tr key={row.key}>
										<td style={isChild ? V.childCell : V.cell}>
											{isChild ? `Mapping row ${(row.mappingIndex ?? 0) + 1}` : row.title}
											{isChild && (row.inputPaths?.length ?? 0) > 0 ? (
												<div style={V.inputPaths}>{row.inputPaths?.join(", ")}</div>
											) : null}
										</td>
										<td style={V.pgnCell}>{pgnsFor(row, metaByKey) || "-"}</td>
										<td style={V.numberCell}>{row.inputCount ?? 0}</td>
										<td style={V.numberCell}>{row.emitCount}</td>
										<td style={V.cell}>
											{row.emitCount > 0 ? recency : <span style={S.textFaint}>{recency}</span>}
										</td>
										<td style={V.cell}>
											{row.lastErrorMessage ? (
												<span style={S.textDanger}>
													<span aria-hidden="true">⚠ </span>
													{row.lastErrorMessage}
													{row.lastErrorAgeMs !== undefined
														? ` (${humanizeAgo(row.lastErrorAgeMs)})`
														: ""}
												</span>
											) : (
												<span style={health.state === "emitting" ? S.textFaint : S.textWarning}>
													{!status.nmea2000Ready && (row.inputCount ?? 0) > 0
														? "Waiting for NMEA 2000 output"
														: health.label}
												</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</section>
			)}
		</div>
	);
}
