import type * as React from "react";
import { extraRows } from "./extraRows";
import MappingTable, { instanceIdColumn, n2kInstanceColumn, signalkIdColumn } from "./MappingTable";

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
				n2kInstanceColumn<Row>({ header: "NMEA 2000 AC instance", field: "acInstanceId" }),
				n2kInstanceColumn<Row>({ header: "NMEA 2000 DC instance", field: "dcInstanceId" }),
			]}
		/>
	);
}
