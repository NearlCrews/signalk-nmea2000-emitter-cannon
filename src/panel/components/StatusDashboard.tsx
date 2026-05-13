import type * as React from "react";
import type { StatusSnapshot } from "../../api/types.js";
import { S } from "../styles";

export default function StatusDashboard({
	status,
}: {
	status: StatusSnapshot | null;
}): React.ReactElement {
	if (!status) {
		return (
			<div style={S.statusBar}>
				<span style={{ ...S.dot, ...S.dotOff }} />
				<span>Loading status...</span>
			</div>
		);
	}
	const ready = status.nmea2000Ready;
	const dot = ready ? S.dotOk : S.dotWait;
	const errors = status.perConversion.filter((c) => c.lastErrorMessage).length;
	return (
		<div style={S.statusBar}>
			<span
				style={{ ...S.dot, ...dot }}
				title={ready ? "NMEA 2000 ready" : "Waiting for NMEA 2000 output"}
			/>
			<span>
				<span style={S.statLabel}>Enabled </span>
				<span style={S.statValue}>
					{status.enabledCount} / {status.totalConversions}
				</span>
			</span>
			<span>
				<span style={S.statLabel}>NMEA 2000 </span>
				<span style={S.statValue}>{ready ? "ready" : "waiting"}</span>
			</span>
			{errors > 0 ? (
				<span style={S.errorBadge}>
					{errors} error{errors > 1 ? "s" : ""}
				</span>
			) : null}
		</div>
	);
}
