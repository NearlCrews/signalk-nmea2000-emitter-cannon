import type * as React from "react";
import { S } from "../../styles";
import MappingTable from "./MappingTable";

// signalkPath is the full SK path (e.g. "tanks.fuel.0") because the SK tank
// identity is the {type, instance} pair, not a single trailing segment.
// Battery/engine/solar/exhaust/brightness editors use signalkId for the last
// segment under a single registry root. Do not unify these names.
interface Row {
	signalkPath: string;
	instanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function TankMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const rows: Row[] = Array.isArray(value.tanks) ? (value.tanks as Row[]) : [];
	const setRows = (next: Row[]): void => onChange({ ...value, tanks: next });
	return (
		<MappingTable<Row>
			title="Tank Mapping"
			rows={rows}
			emptyRow={() => ({ signalkPath: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				{
					header: "Signal K tank path",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.signalkPath}
							placeholder="tanks.fuel.0"
							onChange={(e) => set({ ...r, signalkPath: e.target.value })}
							aria-label="Signal K tank path"
						/>
					),
				},
				{
					header: "NMEA 2000 Tank Instance Id",
					render: (r, set) => (
						<input
							type="number"
							min={0}
							style={S.input}
							value={r.instanceId}
							onChange={(e) =>
								set({ ...r, instanceId: Number(e.target.value) | 0 })
							}
							aria-label="NMEA 2000 tank instance id"
						/>
					),
				},
			]}
		/>
	);
}
