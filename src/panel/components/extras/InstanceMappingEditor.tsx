import type * as React from "react";
import { extraRows } from "./extraRows";
import MappingTable, {
	instanceIdColumn,
	type RequiredInput,
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
	collection: string;
	title: string;
	helpText?: string;
	idHeader: string;
	idPlaceholder: string;
	idAriaLabel?: string;
	instanceHeader: string;
	instanceAriaLabel?: string;
	pathPrefix: string;
	availablePaths: string[];
	requiredInput?: RequiredInput;
}

/** Shared two-column Signal K id to NMEA 2000 instance editor. */
export default function InstanceMappingEditor({
	value,
	onChange,
	storageKey,
	collection,
	title,
	helpText,
	idHeader,
	idPlaceholder,
	idAriaLabel,
	instanceHeader,
	instanceAriaLabel,
	pathPrefix,
	availablePaths,
	requiredInput,
}: Props): React.ReactElement {
	const { rows, setRows } = extraRows<Row>(value, storageKey, onChange);
	return (
		<MappingTable<Row>
			title={title}
			collection={collection}
			{...(helpText === undefined ? {} : { helpText })}
			rows={rows}
			available={availablePaths}
			emptyRow={() => ({ signalkId: "", instanceId: 0 })}
			onChange={setRows}
			columns={[
				signalkIdColumn<Row>({
					header: idHeader,
					placeholder: idPlaceholder,
					...(idAriaLabel === undefined ? {} : { ariaLabel: idAriaLabel }),
					pathPrefix,
					...(requiredInput === undefined ? {} : { requiredInput: () => requiredInput }),
				}),
				instanceIdColumn<Row>({
					header: instanceHeader,
					...(instanceAriaLabel === undefined ? {} : { ariaLabel: instanceAriaLabel }),
				}),
			]}
		/>
	);
}
