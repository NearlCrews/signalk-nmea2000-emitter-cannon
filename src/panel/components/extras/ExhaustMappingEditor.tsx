import type * as React from "react";
import NumberInput from "../NumberInput";
import { extraRows } from "./extraRows";
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
	availablePaths: string[];
}

export default function ExhaustMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "engines", onChange);
	return (
		<MappingTable<Row>
			title="Exhaust temperature mapping"
			collection="engines"
			helpText="Signal K engine id pairs with Engine Parameters and Engine Trip. The temperature instance is independent of the engine instance: PGN 130316 uses its own numbering."
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({ signalkId: "", tempInstanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K engine id",
					placeholder: "main, port, starboard",
					ariaLabel: "Signal K engine id for exhaust temperature",
					pathPrefix: "propulsion",
					requiredInput: () => ({
						label: "exhaustTemperature",
						alternatives: [["exhaustTemperature"]],
					}),
				}),
				{
					header: "NMEA 2000 temperature instance",
					group: "NMEA 2000 output",
					render: (r, set) => (
						<NumberInput
							value={r.tempInstanceId}
							onChange={(n) => set({ ...r, tempInstanceId: n })}
							min={0}
							ariaLabel="NMEA 2000 exhaust temperature instance"
						/>
					),
				},
			]}
		/>
	);
}
