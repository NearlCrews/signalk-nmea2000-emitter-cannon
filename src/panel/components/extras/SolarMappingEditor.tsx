import type * as React from "react";
import { S } from "../../styles";
import MappingTable, {
	instanceIdColumn,
	signalkIdColumn,
} from "./MappingTable";

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
}

export default function SolarMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const rows: Row[] = Array.isArray(value.chargers)
		? (value.chargers as Row[])
		: [];
	const setRows = (next: Row[]): void => onChange({ ...value, chargers: next });
	return (
		<MappingTable<Row>
			title="Solar Charger Mapping"
			rows={rows}
			emptyRow={() => ({ signalkId: "", instanceId: 0, panelInstanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K charger id",
					placeholder: "0, 1, mppt-1",
					ariaLabel: "Signal K solar charger id",
				}),
				instanceIdColumn<Row>({
					header: "NMEA 2000 Charger Instance Id",
					ariaLabel: "NMEA 2000 solar charger instance id",
				}),
				{
					header: "NMEA 2000 Panel Instance Id",
					render: (r, set) => (
						<input
							type="number"
							min={0}
							style={S.input}
							value={r.panelInstanceId}
							onChange={(e) =>
								set({
									...r,
									panelInstanceId: Math.max(0, Number(e.target.value) | 0),
								})
							}
							aria-label="NMEA 2000 solar panel instance id"
						/>
					),
				},
			]}
		/>
	);
}
