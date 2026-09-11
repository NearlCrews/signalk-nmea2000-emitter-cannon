import type * as React from "react";
import { extraRows } from "./extraRows";
import MappingTable, { instanceIdColumn, n2kInstanceColumn, signalkIdColumn } from "./MappingTable";

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
				n2kInstanceColumn<Row>({
					header: "NMEA 2000 battery instance",
					field: "batteryInstanceId",
				}),
			]}
		/>
	);
}
