import type * as React from "react";
import { S } from "../../styles";
import NumberInput from "../NumberInput";
import { extraRows } from "./extraRows";
import MappingTable, {
	instanceIdColumn,
	signalkIdColumn,
} from "./MappingTable";

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
}

export default function EngineStaticMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "engines", onChange);
	return (
		<MappingTable<Row>
			title="Engine Static Mapping (PGN 127498)"
			helpText="Set Signal K engine id to the same value used in Engine Parameters and Engine Trip rows (e.g. main, port, 0). MFDs pair PGNs by instance: all engine tables must agree. Instance Id 0 is Single Engine or Dual Engine Port, 1 is Dual Engine Starboard."
			rows={rows}
			emptyRow={() => ({
				signalkId: "",
				instanceId: 0,
			})}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K engine id",
					placeholder: "main, port, starboard",
					ariaLabel: "Signal K engine id",
				}),
				instanceIdColumn<Row>({
					header: "NMEA 2000 Engine Instance Id",
					ariaLabel: "NMEA 2000 engine instance id",
				}),
				{
					header: "Rated Engine Speed (RPM)",
					render: (r, set) => (
						<NumberInput
							value={r.ratedEngineSpeed}
							onChange={(n) => set({ ...r, ratedEngineSpeed: n })}
							min={0}
							placeholder="3600"
							allowEmpty
							ariaLabel="Rated engine speed in RPM"
						/>
					),
				},
				{
					header: "Vehicle Identification Number",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.VIN ?? ""}
							onChange={(e) => set({ ...r, VIN: e.target.value })}
							aria-label="Vehicle identification number"
						/>
					),
				},
				{
					header: "Software Version",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.softwareVersion ?? ""}
							onChange={(e) => set({ ...r, softwareVersion: e.target.value })}
							aria-label="Engine software version"
						/>
					),
				},
			]}
		/>
	);
}
