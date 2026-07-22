import type * as React from "react";
import { extraRows } from "./extraRows";
import MappingTable, { signalkIdColumn, signalkPathColumn } from "./MappingTable";

interface FuelTankRow {
	signalkPath: string;
}

interface EngineRow {
	signalkId: string;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

export default function VesselTripMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows: fuelTanks, setRows: setFuelTanks } = extraRows<FuelTankRow>(
		value,
		"fuelTanks",
		onChange,
	);
	const { rows: engines, setRows: setEngines } = extraRows<EngineRow>(value, "engines", onChange);

	return (
		<>
			<MappingTable<FuelTankRow>
				title="Fuel tanks used for vessel range"
				collection="fuelTanks"
				helpText="Every configured tank must publish currentVolume or currentLevel plus capacity. Include every accessible tank that feeds a selected engine. Signal K cubic meters are converted to liters at the NMEA 2000 boundary."
				rows={fuelTanks}
				available={availablePaths}
				emptyRow={() => ({ signalkPath: "" })}
				onChange={setFuelTanks}
				columns={[
					signalkPathColumn<FuelTankRow>({
						header: "Signal K fuel tank path",
						field: "signalkPath",
						placeholder: "tanks.fuel.0",
						pattern: "tanks\\.fuel\\.[^.]+",
						pathPattern: /^(tanks\.fuel\.[^.]+)(?:\.|$)/,
						requiredInput: () => ({
							label: "currentVolume, or currentLevel plus capacity",
							alternatives: [["currentVolume"], ["currentLevel", "capacity"]],
						}),
					}),
				]}
			/>
			<MappingTable<EngineRow>
				title="Engines used for vessel range"
				collection="engines"
				helpText="Every configured engine must publish fuel.rate before time and distance to empty are emitted. Loads outside propulsion, such as generators and heaters, are not included. Leave this table empty to emit fuel remaining only."
				rows={engines}
				available={availablePaths}
				emptyRow={() => ({ signalkId: "" })}
				onChange={setEngines}
				columns={[
					signalkIdColumn<EngineRow>({
						header: "Signal K engine id",
						placeholder: "main, port, starboard",
						pathPrefix: "propulsion",
						requiredInput: () => ({
							label: "fuel.rate",
							alternatives: [["fuel.rate"]],
						}),
					}),
				]}
			/>
		</>
	);
}
