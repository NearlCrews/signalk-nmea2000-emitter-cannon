import type * as React from "react";
import { extraRows } from "./extraRows";
import MappingTable, { instanceIdColumn, signalkIdColumn } from "./MappingTable";

// signalkId is the final segment of the SK propulsion key (e.g. "main",
// "port", "starboard") under propulsion.<id>, not the full SK path. Tank
// rows use signalkPath for the full path; do not unify these names.
interface Row {
	signalkId: string;
	instanceId: number;
}

interface Props {
	conversionKey: string;
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

const TRIP_MEASUREMENTS = {
	label: "at least one engine trip measurement",
	alternatives: [
		["trip.fuelUsed"],
		["trip.fuelRate.average"],
		["trip.fuelRate.economy"],
		["trip.fuelRate.instantaneousEconomy"],
	],
};

const ENGINE_MEASUREMENTS = {
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

export default function EngineMappingEditor({
	conversionKey,
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "engines", onChange);
	const requiredInput = conversionKey === "ENGINE_TRIP" ? TRIP_MEASUREMENTS : ENGINE_MEASUREMENTS;
	return (
		<MappingTable<Row>
			title="Engine mapping"
			collection="engines"
			helpText="Use the same Signal K engine id you set in Engine Static and Engine Trip (e.g. main, port, 0). Instance 0 is Single Engine or Dual Engine Port, 1 is Dual Engine Starboard."
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({ signalkId: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K engine id",
					placeholder: "main, port, starboard",
					pathPrefix: "propulsion",
					requiredInput: () => requiredInput,
				}),
				instanceIdColumn<Row>({ header: "NMEA 2000 engine instance" }),
			]}
		/>
	);
}
