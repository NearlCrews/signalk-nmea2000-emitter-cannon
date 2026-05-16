import type * as React from "react";
import MappingTable, {
	instanceIdColumn,
	signalkIdColumn,
} from "./MappingTable";

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
			helpText="Use the same Signal K engine id you set in Engine Static and Engine Trip (e.g. main, port, 0). Instance Id 0 is Single Engine or Dual Engine Port, 1 is Dual Engine Starboard."
			rows={rows}
			emptyRow={() => ({ signalkId: "", instanceId: 0 })}
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
			]}
		/>
	);
}
