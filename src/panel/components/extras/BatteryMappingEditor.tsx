import type * as React from "react";
import { extraRows } from "./extraRows";
import MappingTable, {
	instanceIdColumn,
	signalkIdColumn,
} from "./MappingTable";

// signalkId is the final segment of the SK battery key (e.g. "house",
// "starter", "0") under electrical.batteries.<id>, not the full SK path.
// Tank rows by contrast use the full SK path because tanks.<type>.<id> is
// not a single identifier. Do not rename this to signalkPath.
interface Row {
	signalkId: string;
	instanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function BatteryMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "batteries", onChange);
	return (
		<MappingTable<Row>
			title="Battery mapping"
			rows={rows}
			emptyRow={() => ({ signalkId: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: "Signal K battery id",
					placeholder: "house, starter, 0",
				}),
				instanceIdColumn<Row>({
					header: "NMEA 2000 instance",
					ariaLabel: "NMEA 2000 battery instance",
				}),
			]}
		/>
	);
}
