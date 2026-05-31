import type * as React from "react";
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
			title="Brightness Group Mapping"
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
					header: "NMEA 2000 Group Label",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.groupLabel}
							placeholder="Helm 1"
							onChange={(e) => set({ ...r, groupLabel: e.target.value })}
							aria-label="NMEA 2000 brightness group label"
						/>
					),
				},
			]}
		/>
	);
}
