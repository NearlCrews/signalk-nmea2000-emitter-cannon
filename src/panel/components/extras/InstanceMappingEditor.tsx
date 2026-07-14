import type * as React from "react";
import { extraRows } from "./extraRows";
import MappingTable, {
	instanceIdColumn,
	signalkIdColumn,
} from "./MappingTable";

interface Row {
	signalkId: string;
	instanceId: number;
}

interface Props {
	value: Record<string, unknown>;
	onChange: (next: Record<string, unknown>) => void;
	storageKey: string;
	title: string;
	helpText?: string;
	idHeader: string;
	idPlaceholder: string;
	idAriaLabel?: string;
	instanceHeader: string;
	instanceAriaLabel?: string;
}

/** Shared two-column Signal K id to NMEA 2000 instance editor. */
export default function InstanceMappingEditor({
	value,
	onChange,
	storageKey,
	title,
	helpText,
	idHeader,
	idPlaceholder,
	idAriaLabel,
	instanceHeader,
	instanceAriaLabel,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, storageKey, onChange);
	return (
		<MappingTable<Row>
			title={title}
			helpText={helpText}
			rows={rows}
			emptyRow={() => ({ signalkId: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: idHeader,
					placeholder: idPlaceholder,
					ariaLabel: idAriaLabel,
				}),
				instanceIdColumn<Row>({
					header: instanceHeader,
					ariaLabel: instanceAriaLabel,
				}),
			]}
		/>
	);
}
