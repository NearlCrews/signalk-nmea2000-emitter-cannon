import type * as React from "react";
import InstanceMappingEditor from "./InstanceMappingEditor";

// signalkId is the final segment of the SK battery key (e.g. "house",
// "starter", "0") under electrical.batteries.<id>, not the full SK path.
// Tank rows by contrast use the full SK path because tanks.<type>.<id> is
// not a single identifier. Do not rename this to signalkPath.
interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

export default function BatteryMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	return (
		<InstanceMappingEditor
			value={value}
			onChange={onChange}
			availablePaths={availablePaths}
			pathPrefix="electrical.batteries"
			storageKey="batteries"
			collection="batteries"
			title="Battery mapping"
			helpText="Enter only the instance id between electrical.batteries and the measurement name. For electrical.batteries.258-second.voltage, enter 258-second."
			idHeader="Signal K battery id"
			idPlaceholder="house, starter, 258-second"
			instanceHeader="NMEA 2000 instance"
			instanceAriaLabel="NMEA 2000 battery instance"
			requiredInput={{
				label: "at least one battery measurement",
				alternatives: [
					["voltage"],
					["current"],
					["temperature"],
					["capacity.stateOfCharge"],
					["capacity.timeRemaining"],
					["capacity.remaining"],
					["capacity.actual"],
					["capacity.stateOfHealth"],
				],
			}}
		/>
	);
}
