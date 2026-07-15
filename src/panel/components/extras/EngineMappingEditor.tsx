import type * as React from "react";
import InstanceMappingEditor from "./InstanceMappingEditor";

// signalkId is the final segment of the SK propulsion key (e.g. "main",
// "port", "starboard") under propulsion.<id>, not the full SK path. Tank
// rows use signalkPath for the full path; do not unify these names.
interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function EngineMappingEditor({ value, onChange }: Props): React.ReactElement {
	return (
		<InstanceMappingEditor
			value={value}
			onChange={onChange}
			storageKey="engines"
			title="Engine mapping"
			helpText="Use the same Signal K engine id you set in Engine Static and Engine Trip (e.g. main, port, 0). Instance 0 is Single Engine or Dual Engine Port, 1 is Dual Engine Starboard."
			idHeader="Signal K engine id"
			idPlaceholder="main, port, starboard"
			instanceHeader="NMEA 2000 engine instance"
		/>
	);
}
