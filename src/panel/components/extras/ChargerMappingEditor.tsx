import type * as React from "react";
import { MAX_N2K_INSTANCE } from "../../../constants.js";
import NumberInput from "../NumberInput";
import { extraRows } from "./extraRows";
import MappingTable, { instanceIdColumn, signalkIdColumn } from "./MappingTable";

interface Row {
	signalkId: string;
	instanceId: number;
	batteryInstanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

export default function ChargerMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "chargers", onChange);
	return (
		<MappingTable<Row>
			title="Battery charger mapping"
			collection="chargers"
			helpText="Battery instance must match the target battery's NMEA 2000 instance."
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({ signalkId: "", instanceId: 0, batteryInstanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K charger id",
					placeholder: "shore",
					pathPrefix: "electrical.chargers",
					requiredInput: () => ({
						label: "chargingMode or chargerRole",
						alternatives: [["chargingMode"], ["chargerRole"]],
					}),
				}),
				instanceIdColumn<Row>({ header: "NMEA 2000 charger instance" }),
				{
					header: "NMEA 2000 battery instance",
					group: "NMEA 2000 output",
					render: (row, setRow) => (
						<NumberInput
							value={row.batteryInstanceId}
							onChange={(batteryInstanceId) => setRow({ ...row, batteryInstanceId })}
							min={0}
							max={MAX_N2K_INSTANCE}
							ariaLabel="NMEA 2000 battery instance"
						/>
					),
				},
			]}
		/>
	);
}
