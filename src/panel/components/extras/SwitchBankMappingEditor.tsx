import type * as React from "react";
import { MAX_SWITCH_BANK_CHANNEL } from "../../../constants.js";
import { SIGNALK_ID_SEGMENT_PATTERN } from "../../../utils/validation.js";
import { extraRows } from "./extraRows";
import MappingTable, { instanceIdColumn, numberColumn, signalkPathColumn } from "./MappingTable";

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
			emptyRow={() => ({ signalkPath: "", instanceId: 0, channel: 1 })}
			onChange={setRows}
			columns={[
				signalkPathColumn<Row>({
					header: "Signal K switch path",
					field: "signalkPath",
					placeholder: "electrical.switches.anchorLight",
					pathPattern: /^(electrical\.switches\..+)\.state$/,
					pattern: `electrical\\.switches(\\.${SIGNALK_ID_SEGMENT_PATTERN})+`,
					requiredInput: () => ({ label: "state", alternatives: [["state"]] }),
				}),
				instanceIdColumn<Row>({
					header: "NMEA 2000 bank instance",
				}),
				numberColumn<Row>({
					header: "NMEA 2000 channel",
					field: "channel",
					group: "NMEA 2000 output",
					min: 1,
					max: MAX_SWITCH_BANK_CHANNEL,
				}),
			]}
		/>
	);
}
