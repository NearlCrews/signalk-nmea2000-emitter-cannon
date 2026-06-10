import type * as React from "react";
import { SEATALK_NETWORK_GROUPS } from "../../../config/enums.js";
import { S } from "../../styles";
import { extraRows } from "./extraRows";
import MappingTable from "./MappingTable";

// signalkId is the final segment of the SK Raymarine brightness group key
// (e.g. "helm", "nav", "cabin"), not the full SK path. Tank rows use
// signalkPath for the full path; do not unify these names. groupLabel is
// the human-readable NMEA 2000 group label string (not a numeric id like
// the other editors' instanceId fields).
interface Row {
	signalkId: string;
	groupLabel: string;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function BrightnessMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "groups", onChange);
	return (
		<MappingTable<Row>
			title="Brightness group mapping"
			rows={rows}
			emptyRow={() => ({ signalkId: "", groupLabel: "" })}
			onChange={setRows}
			columns={[
				{
					header: "Signal K group id",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.signalkId}
							placeholder="helm, nav, cabin"
							onChange={(e) => set({ ...r, signalkId: e.target.value })}
							aria-label="Signal K Raymarine brightness group id"
						/>
					),
				},
				{
					header: "NMEA 2000 group label",
					// A select over the canboat SEATALK_NETWORK_GROUP labels: the
					// runtime silently falls back on an unknown label, so free text
					// invited typos that quietly mapped to the default group. A
					// stored value outside the list (or empty) still displays as its
					// own option so an existing config is not silently rewritten.
					render: (r, set) => (
						<select
							style={S.select}
							value={r.groupLabel}
							onChange={(e) => set({ ...r, groupLabel: e.target.value })}
							aria-label="NMEA 2000 brightness group label"
						>
							{r.groupLabel === "" ? (
								<option value="">Select a group</option>
							) : null}
							{!SEATALK_NETWORK_GROUPS.includes(r.groupLabel) &&
							r.groupLabel !== "" ? (
								<option value={r.groupLabel}>
									{r.groupLabel} (not a known group)
								</option>
							) : null}
							{SEATALK_NETWORK_GROUPS.map((g) => (
								<option key={g} value={g}>
									{g}
								</option>
							))}
						</select>
					),
				},
			]}
		/>
	);
}
