import type * as React from "react";
import { MAX_TANK_INSTANCE } from "../../../constants.js";
import { S } from "../../styles";
import NumberInput from "../NumberInput";
import { extraRows } from "./extraRows";
import MappingTable from "./MappingTable";

// signalkPath is the full SK path (e.g. "tanks.fuel.0") because the SK tank
// identity is the {type, instance} pair, not a single trailing segment.
// Battery/engine/solar/exhaust/brightness editors use signalkId for the last
// segment under a single registry root. Do not unify these names.
interface Row {
	signalkPath: string;
	instanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function TankMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "tanks", onChange);
	return (
		<MappingTable<Row>
			title="Tank mapping"
			rows={rows}
			emptyRow={() => ({ signalkPath: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				{
					header: "Signal K tank path",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.signalkPath}
							placeholder="tanks.fuel.0"
							onChange={(e) => set({ ...r, signalkPath: e.target.value })}
							aria-label="Signal K tank path"
						/>
					),
				},
				{
					header: "NMEA 2000 tank instance",
					render: (r, set) => (
						<NumberInput
							value={r.instanceId}
							onChange={(n) => set({ ...r, instanceId: n })}
							min={0}
							max={MAX_TANK_INSTANCE}
							ariaLabel="NMEA 2000 tank instance"
						/>
					),
				},
			]}
		/>
	);
}
