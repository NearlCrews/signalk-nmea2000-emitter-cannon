import type * as React from "react";
import { S } from "../../styles";
import MappingTable from "./MappingTable";

// signalkId is the final segment of the SK propulsion key (e.g. "main",
// "port", "starboard") under propulsion.<id>, not the full SK path. Tank
// rows use signalkPath for the full path; do not unify these names.
interface Row {
	signalkId: string;
	instanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function EngineMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const rows: Row[] = Array.isArray(value.engines)
		? (value.engines as Row[])
		: [];
	const setRows = (next: Row[]): void => onChange({ ...value, engines: next });
	return (
		<MappingTable<Row>
			title="Engine Mapping"
			rows={rows}
			emptyRow={() => ({ signalkId: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				{
					header: "Signal K engine id",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.signalkId}
							placeholder="main, port, starboard"
							onChange={(e) => set({ ...r, signalkId: e.target.value })}
							aria-label="Signal K engine id"
						/>
					),
				},
				{
					header: "NMEA 2000 Engine Instance Id",
					render: (r, set) => (
						<input
							type="number"
							min={0}
							style={S.input}
							value={r.instanceId}
							onChange={(e) =>
								set({ ...r, instanceId: Number(e.target.value) | 0 })
							}
							aria-label="NMEA 2000 engine instance id"
						/>
					),
				},
			]}
		/>
	);
}
