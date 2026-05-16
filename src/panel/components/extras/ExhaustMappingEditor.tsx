import type * as React from "react";
import { S } from "../../styles";
import MappingTable, { signalkIdColumn } from "./MappingTable";

// signalkId is the final segment of the SK propulsion key under propulsion.<id>
// (e.g. "main", "port", "starboard"), not the full SK path. Tank rows use
// signalkPath for the full path; do not unify these names. The instance field
// is tempInstanceId (not the shared instanceId) because exhaust temperature
// PGN 130316 takes a Temperature Instance, distinct from Engine Instance.
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
			helpText="Signal K engine id pairs with Engine Parameters / Engine Trip. Temperature Instance Id is independent of Engine Instance Id: PGN 130316 uses its own numbering."
			rows={rows}
			emptyRow={() => ({ signalkId: "", tempInstanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K engine id",
					placeholder: "main, port, starboard",
					ariaLabel: "Signal K engine id for exhaust temperature",
				}),
				{
					header: "NMEA 2000 Temperature Instance Id",
					render: (r, set) => (
						<input
							type="number"
							min={0}
							style={S.input}
							value={r.tempInstanceId}
							onChange={(e) =>
								set({
									...r,
									tempInstanceId: Math.max(0, Number(e.target.value) | 0),
								})
							}
							aria-label="NMEA 2000 exhaust temperature instance id"
						/>
					),
				},
			]}
		/>
	);
}
