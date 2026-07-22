import type * as React from "react";
import { MAX_N2K_INSTANCE } from "../../../constants.js";
import NumberInput from "../NumberInput";
import { extraRows } from "./extraRows";
import MappingTable, { instanceIdColumn, signalkIdColumn } from "./MappingTable";

interface Row {
	signalkId: string;
	instanceId: number;
	acInstanceId: number;
	dcInstanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

function linkedInstanceColumn(field: "acInstanceId" | "dcInstanceId", header: string) {
	return {
		header,
		group: "NMEA 2000 output" as const,
		render: (row: Row, setRow: (next: Row) => void) => (
			<NumberInput
				value={row[field]}
				onChange={(next) => setRow({ ...row, [field]: next })}
				min={0}
				max={MAX_N2K_INSTANCE}
				ariaLabel={header}
			/>
		),
	};
}

export default function InverterMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "inverters", onChange);
	return (
		<MappingTable<Row>
			title="Inverter mapping"
			collection="inverters"
			helpText="AC and DC instances must match the connected NMEA 2000 systems."
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({ signalkId: "", instanceId: 0, acInstanceId: 0, dcInstanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K inverter id",
					placeholder: "main",
					pathPrefix: "electrical.inverters",
					requiredInput: () => ({
						label: "inverterMode",
						alternatives: [["inverterMode"]],
					}),
				}),
				instanceIdColumn<Row>({ header: "NMEA 2000 inverter instance" }),
				linkedInstanceColumn("acInstanceId", "NMEA 2000 AC instance"),
				linkedInstanceColumn("dcInstanceId", "NMEA 2000 DC instance"),
			]}
		/>
	);
}
