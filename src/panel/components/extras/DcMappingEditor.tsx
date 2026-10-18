import type * as React from "react";
import { DC_PATH_MIN_SEGMENTS, DC_PATH_ROOT } from "../../../constants.js";
import { extraRows } from "./extraRows";
import MappingTable, { instanceIdColumn, signalkAssetPathColumn } from "./MappingTable";

// signalkPath is the DC source's full SK path (e.g. "electrical.alternators.main")
// because the source can sit under any electrical group, not one registry root.
interface Row {
	signalkPath: string;
	instanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	availablePaths: string[];
}

export default function DcMappingEditor({
	value,
	onChange,
	availablePaths,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, "dcSources", onChange);
	return (
		<MappingTable<Row>
			title="DC source mapping"
			collection="dcSources"
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({ signalkPath: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkAssetPathColumn<Row>({
					header: "Signal K DC source path",
					field: "signalkPath",
					placeholder: `${DC_PATH_ROOT}.alternators.main`,
					root: DC_PATH_ROOT,
					minSegments: DC_PATH_MIN_SEGMENTS,
					leaves: ["voltage", "current"],
				}),
				instanceIdColumn<Row>({
					header: "NMEA 2000 connection number",
				}),
			]}
		/>
	);
}
