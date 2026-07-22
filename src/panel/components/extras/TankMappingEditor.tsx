import type * as React from "react";
import { MAX_TANK_INSTANCE } from "../../../constants.js";
import NumberInput from "../NumberInput";
import { extraRows } from "./extraRows";
import MappingTable, { signalkPathColumn } from "./MappingTable";

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
	availablePaths: string[];
}

export default function TankMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "tanks", onChange);
	return (
		<MappingTable<Row>
			title="Tank mapping"
			collection="tanks"
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({ signalkPath: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkPathColumn<Row>({
					header: "Signal K tank path",
					field: "signalkPath",
					placeholder: "tanks.fuel.0",
					pathPattern: /^(tanks\.[^.]+\.[^.]+)(?:\.|$)/,
					pattern: "tanks\\.[^.]+\\.[^.]+",
					requiredInput: () => ({
						label: "currentLevel or capacity",
						alternatives: [["currentLevel"], ["capacity"]],
					}),
				}),
				{
					header: "NMEA 2000 tank instance",
					group: "NMEA 2000 output",
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
