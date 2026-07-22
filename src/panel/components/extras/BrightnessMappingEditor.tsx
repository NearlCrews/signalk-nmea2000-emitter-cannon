import type * as React from "react";
import { SEATALK_NETWORK_GROUPS } from "../../../config/enums.js";
import { S } from "../../styles";
import { extraRows } from "./extraRows";
import MappingTable, { signalkIdColumn } from "./MappingTable";

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
	availablePaths: string[];
}

export default function BrightnessMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "groups", onChange);
	return (
		<MappingTable<Row>
			title="Brightness group mapping"
			collection="groups"
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({ signalkId: "", groupLabel: "" })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K group id",
					placeholder: "helm, nav, cabin",
					ariaLabel: "Signal K Raymarine brightness group id",
					pathPrefix: "electrical.displays.raymarine",
					requiredInput: () => ({
						label: "brightness",
						alternatives: [["brightness"]],
					}),
				}),
				{
					header: "NMEA 2000 group label",
					group: "NMEA 2000 output",
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
							{r.groupLabel === "" ? <option value="">Select a group</option> : null}
							{!SEATALK_NETWORK_GROUPS.includes(r.groupLabel) && r.groupLabel !== "" ? (
								<option value={r.groupLabel}>{r.groupLabel} (not a known group)</option>
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
