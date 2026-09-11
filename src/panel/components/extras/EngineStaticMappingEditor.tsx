import type * as React from "react";
import { MAX_N2K_ENGINE_SPEED_RPM } from "../../../constants.js";
import { extraRows } from "./extraRows";
import MappingTable, {
	instanceIdColumn,
	numberColumn,
	signalkIdColumn,
	textColumn,
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
				numberColumn<Row>({
					header: "Rated engine speed (RPM)",
					field: "ratedEngineSpeed",
					group: "NMEA 2000 output",
					min: 0,
					// Mirrors the validator bound, the way instanceIdColumn mirrors
					// MAX_N2K_INSTANCE. Above this the PGN 127498 field wraps.
					max: MAX_N2K_ENGINE_SPEED_RPM,
					placeholder: "3600",
					optional: true,
					ariaLabel: "Rated engine speed in RPM",
				}),
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
