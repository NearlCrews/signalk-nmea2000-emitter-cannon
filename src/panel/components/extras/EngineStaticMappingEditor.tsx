import type * as React from "react";
import NumberInput from "../NumberInput";
import { extraRows } from "./extraRows";
import MappingTable, { instanceIdColumn, signalkIdColumn, textColumn } from "./MappingTable";

// PGN 127498 (Engine Configuration / Static) carries identity metadata per
// engine instance: rated speed, VIN, software version. Signal K has no
// canonical source for these fields, so they're entered per-engine in the
// plugin config. signalkId is the final segment of the SK propulsion key
// (e.g. "main", "port", "starboard"); the runtime emits the PGN with the
// matching instanceId regardless of whether SK has a live subscription.
interface Row {
	signalkId: string;
	instanceId: number;
	ratedEngineSpeed?: number;
	VIN?: string;
	softwareVersion?: string;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

export default function EngineStaticMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "engines", onChange);
	return (
		<MappingTable<Row>
			title="Engine static mapping (PGN 127498)"
			collection="engines"
			helpText="Set Signal K engine id to the same value used in Engine Parameters and Engine Trip rows (e.g. main, port, 0). MFDs pair PGNs by instance: all engine tables must agree. Instance 0 is Single Engine or Dual Engine Port, 1 is Dual Engine Starboard."
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({
				signalkId: "",
				instanceId: 0,
			})}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K engine id",
					placeholder: "main, port, starboard",
					pathPrefix: "propulsion",
				}),
				instanceIdColumn<Row>({
					header: "NMEA 2000 engine instance",
				}),
				{
					header: "Rated engine speed (RPM)",
					group: "NMEA 2000 output",
					render: (r, set) => (
						<NumberInput
							value={r.ratedEngineSpeed}
							onChange={(n) => {
								const next = { ...r };
								if (n === undefined) delete next.ratedEngineSpeed;
								else next.ratedEngineSpeed = n;
								set(next);
							}}
							min={0}
							placeholder="3600"
							allowEmpty
							ariaLabel="Rated engine speed in RPM"
						/>
					),
				},
				textColumn<Row>({
					header: "Vehicle identification number",
					field: "VIN",
					group: "NMEA 2000 output",
				}),
				textColumn<Row>({
					header: "Software version",
					field: "softwareVersion",
					ariaLabel: "Engine software version",
					group: "NMEA 2000 output",
				}),
			]}
		/>
	);
}
