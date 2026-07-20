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
}

export default function AcMappingEditor({ value, onChange }: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "acSources", onChange);
	return (
		<MappingTable<Row>
			title="AC source mapping"
			helpText="Input rows require an explicit acceptability value because PGN 127503 has no unknown state."
			rows={rows}
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
				}),
				instanceIdColumn<Row>({ header: "NMEA 2000 instance" }),
				selectColumn<Row>({
					header: "Direction",
					field: "direction",
					options: [
						{ value: "input", label: "Input" },
						{ value: "output", label: "Output" },
					],
				}),
				selectColumn<Row>({
					header: "Phases",
					field: "phaseMode",
					options: [
						{ value: "single", label: "Single phase" },
						{ value: "three", label: "Three phase" },
					],
				}),
				selectColumn<Row>({
					header: "Input acceptability",
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
