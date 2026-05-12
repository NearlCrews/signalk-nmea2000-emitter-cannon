import type * as React from "react";
import { S } from "../../styles";
import MappingTable from "./MappingTable";

interface Row {
	signalkId: string;
	instanceId: string;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
}

export default function BrightnessMappingEditor({
	value,
	onChange,
}: Props): React.ReactElement {
	const rows: Row[] = Array.isArray(value.groups)
		? (value.groups as Row[])
		: [];
	const setRows = (next: Row[]): void => onChange({ ...value, groups: next });
	return (
		<MappingTable<Row>
			title="Brightness Group Mapping"
			rows={rows}
			emptyRow={() => ({ signalkId: "", instanceId: "" })}
			onChange={setRows}
			columns={[
				{
					header: "Signal K group id",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.signalkId}
							placeholder="helm, nav, cabin"
							onChange={(e) => set({ ...r, signalkId: e.target.value })}
						/>
					),
				},
				{
					header: "NMEA 2000 Group Label",
					render: (r, set) => (
						<input
							type="text"
							style={S.input}
							value={r.instanceId}
							placeholder="Helm 1"
							onChange={(e) => set({ ...r, instanceId: e.target.value })}
						/>
					),
				},
			]}
		/>
	);
}
