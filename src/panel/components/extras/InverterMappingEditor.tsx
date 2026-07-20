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
}

function linkedInstanceColumn(field: "acInstanceId" | "dcInstanceId", header: string) {
	return {
		header,
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

export default function InverterMappingEditor({ value, onChange }: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "inverters", onChange);
	return (
		<MappingTable<Row>
			title="Inverter mapping"
			helpText="AC and DC instances must match the connected NMEA 2000 systems."
			rows={rows}
			emptyRow={() => ({ signalkId: "", instanceId: 0, acInstanceId: 0, dcInstanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({ header: "Signal K inverter id", placeholder: "main" }),
				instanceIdColumn<Row>({ header: "NMEA 2000 inverter instance" }),
				linkedInstanceColumn("acInstanceId", "NMEA 2000 AC instance"),
				linkedInstanceColumn("dcInstanceId", "NMEA 2000 DC instance"),
			]}
		/>
	);
}
