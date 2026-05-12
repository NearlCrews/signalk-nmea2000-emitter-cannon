import type * as React from "react";
import { S } from "../../styles";
import MappingTable from "./MappingTable";

// signalkId is the final segment of the SK battery key (e.g. "house",
// "starter", "0") under electrical.batteries.<id>, not the full SK path.
// Tank rows by contrast use the full SK path because tanks.<type>.<id> is
// not a single identifier. Do not rename this to signalkPath.
interface Row {
	signalkId: string;
	instanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function BatteryMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const rows: Row[] = Array.isArray(value.batteries)
		? (value.batteries as Row[])
		: [];
	const setRows = (next: Row[]): void =>
		onChange({ ...value, batteries: next });
	return (
		<MappingTable<Row>
			title="Battery Mapping"
			rows={rows}
			emptyRow={() => ({ signalkId: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				{
					header: "Signal K battery id",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.signalkId}
							placeholder="house, starter, 0"
							onChange={(e) => set({ ...r, signalkId: e.target.value })}
							aria-label="Signal K battery id"
						/>
					),
				},
				{
					header: "NMEA 2000 Instance Id",
					render: (r, set) => (
						<input
							type="number"
							min={0}
							style={S.input}
							value={r.instanceId}
							onChange={(e) =>
								set({ ...r, instanceId: Number(e.target.value) | 0 })
							}
							aria-label="NMEA 2000 battery instance id"
						/>
					),
				},
			]}
		/>
	);
}
