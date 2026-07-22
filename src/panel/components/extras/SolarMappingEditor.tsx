import type * as React from "react";
import NumberInput from "../NumberInput";
import { extraRows } from "./extraRows";
import MappingTable, { instanceIdColumn, signalkIdColumn } from "./MappingTable";

// signalkId is the final segment of the SK solar charger key (e.g. "0", "1",
// "mppt-1") under electrical.solar.<id>, not the full SK path. Tank rows use
// signalkPath for the full path; do not unify these names.
interface Row {
	signalkId: string;
	instanceId: number;
	panelInstanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

export default function SolarMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "chargers", onChange);
	return (
		<MappingTable<Row>
			title="Solar charger mapping"
			collection="chargers"
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({ signalkId: "", instanceId: 0, panelInstanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K charger id",
					placeholder: "0, 1, mppt-1",
					ariaLabel: "Signal K solar charger id",
					pathPrefix: "electrical.solar",
					requiredInput: () => ({
						label: "at least one charger or panel measurement",
						alternatives: [["voltage"], ["current"], ["panelVoltage"], ["panelCurrent"]],
					}),
				}),
				instanceIdColumn<Row>({
					header: "NMEA 2000 charger instance",
					ariaLabel: "NMEA 2000 solar charger instance",
				}),
				{
					header: "NMEA 2000 panel instance",
					group: "NMEA 2000 output",
					render: (r, set) => (
						<NumberInput
							value={r.panelInstanceId}
							onChange={(n) => set({ ...r, panelInstanceId: n })}
							min={0}
							ariaLabel="NMEA 2000 solar panel instance"
						/>
					),
				},
			]}
		/>
	);
}
