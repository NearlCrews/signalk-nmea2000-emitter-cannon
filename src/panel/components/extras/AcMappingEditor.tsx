import type * as React from "react";
import { extraRows } from "./extraRows";
import MappingTable, { instanceIdColumn, selectColumn, signalkIdColumn } from "./MappingTable";

interface Row {
	signalkId: string;
	instanceId: number;
	direction: "input" | "output";
	phaseMode: "single" | "three";
	acceptability?: "Bad level" | "Bad frequency" | "Being qualified" | "Good";
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

export default function AcMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "acSources", onChange);
	return (
		<MappingTable<Row>
			title="AC source mapping"
			collection="acSources"
			helpText="Input rows require an explicit acceptability value because PGN 127503 has no unknown state."
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({
				signalkId: "",
				instanceId: 0,
				direction: "input",
				phaseMode: "single",
			})}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K AC bus id",
					placeholder: "shore, inverter",
					pathPrefix: "electrical.ac",
					requiredInput: (row) => {
						const phases = row.phaseMode === "three" ? ["A", "B", "C"] : ["single"];
						const fields = [
							"lineNeutralVoltage",
							"current",
							"frequency",
							"realPower",
							"reactivePower",
							"powerFactor",
						];
						return {
							label: "at least one configured-phase AC measurement",
							alternatives: phases.flatMap((phase) =>
								fields.map((field) => [`phase.${phase}.${field}`]),
							),
						};
					},
				}),
				instanceIdColumn<Row>({ header: "NMEA 2000 instance" }),
				selectColumn<Row>({
					header: "Direction",
					group: "NMEA 2000 output",
					field: "direction",
					options: [
						{ value: "input", label: "Input" },
						{ value: "output", label: "Output" },
					],
				}),
				selectColumn<Row>({
					header: "Phases",
					group: "NMEA 2000 output",
					field: "phaseMode",
					options: [
						{ value: "single", label: "Single phase" },
						{ value: "three", label: "Three phase" },
					],
				}),
				selectColumn<Row>({
					header: "Input acceptability",
					group: "NMEA 2000 output",
					field: "acceptability",
					placeholder: "Select acceptability",
					disabled: (row) => row.direction === "output",
					options: [
						{ value: "Good", label: "Good" },
						{ value: "Being qualified", label: "Being qualified" },
						{ value: "Bad level", label: "Bad level" },
						{ value: "Bad frequency", label: "Bad frequency" },
					],
				}),
			]}
		/>
	);
}
