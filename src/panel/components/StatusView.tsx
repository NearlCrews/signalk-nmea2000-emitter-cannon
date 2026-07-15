import type * as React from "react";
import type { ConversionMetadata, PerConversionStatus, StatusSnapshot } from "../../api/types.js";
import { stripSubIndex } from "../../utils/pathUtils.js";
import { extractPgnsFromTitle } from "../../utils/pgnUtils.js";
import { outputStateFor } from "../outputState";
import { humanizeAgo } from "../recency";
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

	const enabledRows = status.perConversion.filter((c) => c.enabled);
	const errorCount = enabledRows.filter((c) => c.lastErrorMessage).length;
	const totalEmits = enabledRows.reduce((n, c) => n + c.emitCount, 0);
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
				<div style={T.wrap}>
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
							{enabledRows.map((row) => {
								const recency =
									row.emitCount > 0 ? humanizeAgo(row.lastEmitMs) : "no recent output";
								return (
									<tr key={row.key}>
										<td style={V.cell}>{row.title}</td>
										<td style={V.pgnCell}>{pgnsFor(row, metaByKey) || "-"}</td>
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
												<span style={S.textFaint}>ok</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
