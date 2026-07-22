import type * as React from "react";
import InstanceMappingEditor from "./InstanceMappingEditor";

// signalkId is the final segment of the SK propulsion key (e.g. "main",
// "port", "starboard") under propulsion.<id>, not the full SK path. Tank
// rows use signalkPath for the full path; do not unify these names.
interface Props {
	conversionKey: string;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

export default function EngineMappingEditor({
	conversionKey,
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const requiredInput =
		conversionKey === "ENGINE_TRIP"
			? {
					label: "at least one engine trip measurement",
					alternatives: [
						["trip.fuelUsed"],
						["trip.fuelRate.average"],
						["trip.fuelRate.economy"],
						["trip.fuelRate.instantaneousEconomy"],
					],
				}
			: {
					label: "at least one engine measurement",
					alternatives: [
						["revolutions"],
						["oilPressure"],
						["oilTemperature"],
						["temperature"],
						["alternatorVoltage"],
						["fuel.rate"],
						["runTime"],
						["coolantPressure"],
						["fuel.pressure"],
						["engineLoad"],
						["engineTorque"],
						["boostPressure"],
						["drive.trimState"],
					],
				};
	return (
		<InstanceMappingEditor
			value={value}
			onChange={onChange}
			availablePaths={availablePaths}
			pathPrefix="propulsion"
			storageKey="engines"
			collection="engines"
			title="Engine mapping"
			helpText="Use the same Signal K engine id you set in Engine Static and Engine Trip (e.g. main, port, 0). Instance 0 is Single Engine or Dual Engine Port, 1 is Dual Engine Starboard."
			idHeader="Signal K engine id"
			idPlaceholder="main, port, starboard"
			instanceHeader="NMEA 2000 engine instance"
			requiredInput={requiredInput}
		/>
	);
}
