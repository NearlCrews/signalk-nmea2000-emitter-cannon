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

// A new row joins the last row's bank on its next free channel, so adding a
// row does not start out duplicating one.
function nextRow(rows: readonly Row[]): Row {
	const instanceId = rows.at(-1)?.instanceId ?? 0;
	const used = new Set(
		rows.filter((row) => row.instanceId === instanceId).map((row) => row.channel),
	);
	let channel = MIN_SWITCH_BANK_CHANNEL;
	while (used.has(channel) && channel < MAX_SWITCH_BANK_CHANNEL) channel++;
	return { signalkPath: "", instanceId, channel };
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
			emptyRow={() => nextRow(rows)}
			onChange={setRows}
			columns={[
				signalkAssetPathColumn<Row>({
					header: "Signal K switch path",
					field: "signalkPath",
					placeholder: `${SWITCH_PATH_ROOT}.anchorLight`,
					root: SWITCH_PATH_ROOT,
					leaves: ["state"],
					// Signal K's NMEA 2000 decoder writes received banks here, and the
					// echo guard drops them, so they could never be sent.
					accept: (path) => !path.startsWith(`${SWITCH_PATH_ROOT}.bank.`),
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
