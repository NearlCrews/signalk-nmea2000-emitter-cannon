import type * as React from "react";
import { S } from "../../styles";
import MappingTable from "./MappingTable";

interface Row {
	signalkId: string;
	instanceId: number;
	panelInstanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function SolarMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const rows: Row[] = Array.isArray(value.chargers)
		? (value.chargers as Row[])
		: [];
	const setRows = (next: Row[]): void => onChange({ ...value, chargers: next });
	return (
		<MappingTable<Row>
			title="Solar Charger Mapping"
			rows={rows}
			emptyRow={() => ({ signalkId: "", instanceId: 0, panelInstanceId: 0 })}
			onChange={setRows}
			columns={[
				{
					header: "Signal K charger id",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.signalkId}
							placeholder="0, 1, mppt-1"
							onChange={(e) => set({ ...r, signalkId: e.target.value })}
						/>
					),
				},
				{
					header: "NMEA 2000 Charger Instance Id",
					render: (r, set) => (
						<input
							type="number"
							min={0}
							style={S.input}
							value={r.instanceId}
							onChange={(e) =>
								set({ ...r, instanceId: Number(e.target.value) | 0 })
							}
						/>
					),
				},
				{
					header: "NMEA 2000 Panel Instance Id",
					render: (r, set) => (
						<input
							type="number"
							min={0}
							style={S.input}
							value={r.panelInstanceId}
							onChange={(e) =>
								set({ ...r, panelInstanceId: Number(e.target.value) | 0 })
							}
						/>
					),
				},
			]}
		/>
	);
}
