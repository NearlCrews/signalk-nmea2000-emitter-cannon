import type * as React from "react";
import {
	MAX_SWITCH_BANK_CHANNEL,
	MIN_SWITCH_BANK_CHANNEL,
	SWITCH_PATH_ROOT,
} from "../../../constants.js";
import { extraRows } from "./extraRows";
import MappingTable, {
	instanceIdColumn,
	numberColumn,
	signalkAssetPathColumn,
} from "./MappingTable";

// signalkPath is the switch's full SK path (e.g. "electrical.switches.anchorLight")
// because providers nest switch ids differently; the conversion reads its
// `.state` leaf. Several rows share one bank instance, one per channel.
interface Row {
	signalkPath: string;
	instanceId: number;
	channel: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

export default function SwitchBankMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "switches", onChange);
	return (
		<MappingTable<Row>
			title="Switch mapping"
			collection="switches"
			helpText="Rows with the same bank instance are sent together as one bank. Give each switch its own channel in that bank."
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({ signalkPath: "", instanceId: 0, channel: MIN_SWITCH_BANK_CHANNEL })}
			onChange={setRows}
			columns={[
				signalkAssetPathColumn<Row>({
					header: "Signal K switch path",
					field: "signalkPath",
					placeholder: `${SWITCH_PATH_ROOT}.anchorLight`,
					root: SWITCH_PATH_ROOT,
					leaves: ["state"],
				}),
				instanceIdColumn<Row>({
					header: "NMEA 2000 bank instance",
				}),
				numberColumn<Row>({
					header: "NMEA 2000 channel",
					field: "channel",
					group: "NMEA 2000 output",
					min: MIN_SWITCH_BANK_CHANNEL,
					max: MAX_SWITCH_BANK_CHANNEL,
				}),
			]}
		/>
	);
}
