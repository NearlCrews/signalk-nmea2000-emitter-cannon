import type * as React from "react";
import { S } from "../../styles";
import MappingTable from "./MappingTable";

// signalkId is the final segment of the SK propulsion key under propulsion.<id>
// (e.g. "main", "port", "starboard"), not the full SK path. Tank rows use
// signalkPath for the full path; do not unify these names.
interface Row {
	signalkId: string;
	tempInstanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function ExhaustMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const rows: Row[] = Array.isArray(value.engines)
		? (value.engines as Row[])
		: [];
	const setRows = (next: Row[]): void => onChange({ ...value, engines: next });
	return (
		<MappingTable<Row>
			title="Exhaust Temperature Mapping"
			rows={rows}
			emptyRow={() => ({ signalkId: "", tempInstanceId: 0 })}
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
						/>
					),
				},
				{
					header: "NMEA 2000 Temperature Instance Id",
					render: (r, set) => (
						<input
							type="number"
							min={0}
							style={S.input}
							value={r.tempInstanceId}
							onChange={(e) =>
								set({ ...r, tempInstanceId: Number(e.target.value) | 0 })
							}
						/>
					),
				},
			]}
		/>
	);
}
