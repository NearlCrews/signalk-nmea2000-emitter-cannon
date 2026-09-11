import type * as React from "react";
import { Fragment, useId, useRef, useState } from "react";
import {
	Button,
	Cluster,
	InlineConfirm,
	NumberInput,
	Select,
	Stack,
	StatusIndicator,
	Text,
	TextInput,
	useNumberDraft,
	VisuallyHidden,
} from "signalk-nearlcrews-ui";
import {
	Table,
	TableCell,
	TableHeaderCell,
	TableScrollRegion,
} from "signalk-nearlcrews-ui/composites";
import { MAX_N2K_INSTANCE } from "../../../constants.js";
import { SIGNALK_ID_SEGMENT_PATTERN } from "../../../utils/validation.js";
import { cellIssueIds, useConfigIssues } from "../../configIssues";
import { CONVERSION_STYLES as C } from "../../conversionStyles";
import { isKnownOption, unknownOptionLabel } from "../../selectOptions";
import { mappingInputStatus, type RequiredInput } from "./mappingInputStatus";

export type { RequiredInput } from "./mappingInputStatus";

/** Everything a column needs to draw one cell. */
interface CellContext<T> {
	row: T;
	onChange: (next: T) => void;
	available: string[];
	/** Id for the cell's control, stable while the row lives. */
	controlId: string;
	/** Datalist entries for the column, derived once by the table. */
	suggestions: string[];
	/** 1-based row number, so each control's accessible name says which row it edits. */
	rowNumber: number;
	/**
	 * `aria-describedby` for the validation messages that address this cell, or
	 * undefined when the cell is valid. Set means the control is invalid.
	 */
	errorIds: string | undefined;
}

export interface Column<T> {
	header: string;
	/**
	 * Config field this column edits. Validation issues name the same keys, so
	 * the table matches an issue to a cell by this rather than by prose, and the
	 * cell stamps it as `data-config-field` for the jump-to-issue lookup.
	 */
	field: keyof T & string;
	group?: "Signal K input" | "NMEA 2000 output" | "Configuration";
	/**
	 * Datalist entries for this column, derived from the server path inventory.
	 * The table derives them once per render and hands the result to every cell,
	 * because they depend on the column and the inventory but never on the row.
	 */
	suggestions?: (available: string[]) => string[];
	render: (cell: CellContext<T>) => React.ReactElement;
}

function uniqueSorted(values: string[]): string[] {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

// Every cell in a column shares one visible header, so the row number is what
// tells two cells of the same column apart when they are tabbed through or
// read out of table context.
function cellLabel(name: string, rowNumber: number): string {
	return `${name}, row ${rowNumber}`;
}

// Single-line text column keyed by an arbitrary string field of the row.
// The `?? ""` keeps the input controlled: a malformed persisted row can carry
// an undefined value, which would otherwise flip the field controlled ->
// uncontrolled and warn. ariaLabel defaults to the header, because the column
// header is the visible label of every cell in the column.
export function textColumn<R>(opts: {
	header: string;
	field: keyof R & string;
	placeholder?: string;
	ariaLabel?: string;
	pattern?: string;
	group?: Column<R>["group"];
	/** Identifiers and paths render in the monospace stack. */
	monospace?: boolean;
	suggestions?: (available: string[]) => string[];
	assetPrefix?: (value: string) => string;
	requiredInput?: (row: R) => RequiredInput | undefined;
}): Column<R> {
	return {
		header: opts.header,
		field: opts.field,
		...(opts.group === undefined ? {} : { group: opts.group }),
		...(opts.suggestions === undefined ? {} : { suggestions: opts.suggestions }),
		render: ({ row, onChange, available, controlId, suggestions, rowNumber, errorIds }) => {
			const value = (row[opts.field] as string | undefined) ?? "";
			const listId = suggestions.length > 0 ? `${controlId}-choices` : undefined;
			const assetPath = value && opts.assetPrefix ? opts.assetPrefix(value) : undefined;
			const requiredInput = opts.requiredInput?.(row);
			const status = assetPath
				? mappingInputStatus(assetPath, available, requiredInput)
				: undefined;
			return (
				<Stack gap={1}>
					<TextInput
						id={controlId}
						type="text"
						monospace={opts.monospace ?? false}
						value={value}
						placeholder={opts.placeholder}
						pattern={opts.pattern}
						list={listId}
						onChange={(e) => onChange({ ...row, [opts.field]: e.target.value } as R)}
						aria-label={cellLabel(opts.ariaLabel ?? opts.header, rowNumber)}
						aria-invalid={errorIds === undefined ? undefined : true}
						aria-describedby={errorIds}
						data-config-field={opts.field}
					/>
					{listId ? (
						<datalist id={listId}>
							{suggestions.map((suggestion) => (
								<option key={suggestion} value={suggestion} />
							))}
						</datalist>
					) : null}
					{status && available.length > 0 ? (
						<>
							<StatusIndicator tone={status.assetFound ? "success" : "warning"}>
								{status.assetFound ? "Asset found" : "Asset not found"}
							</StatusIndicator>
							{requiredInput && status.assetFound ? (
								<StatusIndicator tone={status.requiredInputFound ? "success" : "warning"}>
									{status.requiredInputFound ? "Required input found" : "Required input missing"}:{" "}
									{requiredInput.label}
								</StatusIndicator>
							) : null}
						</>
					) : null}
				</Stack>
			);
		},
	};
}

/**
 * Standard string-backed select column for mapping tables. A stored value the
 * option list no longer offers keeps its own option rather than being silently
 * rewritten to whatever the list starts with.
 */
export function selectColumn<R>(opts: {
	header: string;
	field: keyof R & string;
	options: { value: string; label: string }[];
	ariaLabel?: string;
	placeholder?: string;
	disabled?: (row: R) => boolean;
	group?: Column<R>["group"];
}): Column<R> {
	const optionValues = opts.options.map((option) => option.value);
	return {
		header: opts.header,
		field: opts.field,
		...(opts.group === undefined ? {} : { group: opts.group }),
		render: ({ row, onChange, controlId, rowNumber, errorIds }) => {
			const value =
				(row[opts.field] as string | undefined) ??
				(opts.placeholder ? "" : (optionValues[0] ?? ""));
			return (
				<Select
					id={controlId}
					value={value}
					onChange={(e) => onChange({ ...row, [opts.field]: e.target.value } as R)}
					aria-label={cellLabel(opts.ariaLabel ?? opts.header, rowNumber)}
					aria-invalid={errorIds === undefined ? undefined : true}
					aria-describedby={errorIds}
					data-config-field={opts.field}
					disabled={opts.disabled?.(row) ?? false}
				>
					{opts.placeholder ? (
						<option value="" disabled>
							{opts.placeholder}
						</option>
					) : null}
					{value !== "" && !isKnownOption(value, optionValues) ? (
						<option value={value}>{unknownOptionLabel(value)}</option>
					) : null}
					{opts.options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</Select>
			);
		},
	};
}

interface NumberCellProps {
	value: number | undefined;
	onChange: (next: number | undefined) => void;
	min: number;
	max: number | undefined;
	controlId: string;
	ariaLabel: string;
	placeholder: string | undefined;
	field: string;
	errorIds: string | undefined;
	/** A cleared field commits `undefined` instead of the minimum. */
	optional: boolean;
}

// A whole-number cell named by its column header and row. The shared draft hook
// keeps the typed text while editing, clamps and truncates on commit, falls
// back to the minimum for unparsable input, and blurs on wheel so a scroll
// gesture cannot spin the value. A labeled NumberField would repeat the header
// inside every cell, so the bare input takes the header as its accessible name.
function NumberCell({
	value,
	onChange,
	min,
	max,
	controlId,
	ariaLabel,
	placeholder,
	field,
	errorIds,
	optional,
}: NumberCellProps): React.ReactElement {
	const draft = useNumberDraft(value, onChange, {
		allowEmpty: optional,
		fallback: min,
		integer: true,
		max,
		min,
	});
	// The draft reports its own parse failures; a validation issue about this
	// field is a second reason the same control is invalid.
	const invalid = errorIds !== undefined || draft.inputProps["aria-invalid"] === true;
	return (
		<NumberInput
			{...draft.inputProps}
			id={controlId}
			aria-label={ariaLabel}
			aria-invalid={invalid ? true : undefined}
			aria-describedby={errorIds}
			data-config-field={field}
			placeholder={placeholder}
		/>
	);
}

/** Whole-number column keyed by a numeric field of the row. */
export function numberColumn<R>(opts: {
	header: string;
	field: keyof R & string;
	ariaLabel?: string;
	group?: Column<R>["group"];
	min?: number;
	max?: number;
	placeholder?: string;
	/** A cleared field removes the key from the row instead of writing the minimum. */
	optional?: boolean;
}): Column<R> {
	return {
		header: opts.header,
		field: opts.field,
		...(opts.group === undefined ? {} : { group: opts.group }),
		render: ({ row, onChange, controlId, rowNumber, errorIds }) => (
			<NumberCell
				value={row[opts.field] as number | undefined}
				min={opts.min ?? 0}
				max={opts.max}
				controlId={controlId}
				ariaLabel={cellLabel(opts.ariaLabel ?? opts.header, rowNumber)}
				placeholder={opts.placeholder}
				field={opts.field}
				errorIds={errorIds}
				optional={opts.optional ?? false}
				onChange={(next) => {
					const out = { ...row } as Record<string, unknown>;
					if (next === undefined) delete out[opts.field];
					else out[opts.field] = next;
					onChange(out as R);
				}}
			/>
		),
	};
}

// Standard "Signal K id" text column used by every per-instance mapping
// editor (engines, batteries, solar chargers, exhaust). The id is the final
// segment of the SK key (e.g. "main", "house", "258-second"), not the full
// path. Hyphens and underscores accommodate established provider output while
// dots, slashes, and whitespace remain invalid.
// ariaLabel defaults to the header; pass it only when the accessible name
// needs more context than the visible header.
export function signalkIdColumn<R extends { signalkId: string }>(opts: {
	header: string;
	placeholder: string;
	ariaLabel?: string;
	pathPrefix?: string;
	requiredInput?: (row: R) => RequiredInput | undefined;
}): Column<R> {
	const { pathPrefix, ...textOptions } = opts;
	return textColumn<R>({
		field: "signalkId",
		pattern: SIGNALK_ID_SEGMENT_PATTERN,
		group: "Signal K input",
		monospace: true,
		...textOptions,
		...(pathPrefix
			? {
					suggestions: (available: string[]) => {
						const prefix = `${pathPrefix}.`;
						return available.flatMap((path) => {
							if (!path.startsWith(prefix)) return [];
							const id = path.slice(prefix.length).split(".")[0];
							return id ? [id] : [];
						});
					},
					assetPrefix: (value: string) => `${pathPrefix}.${value}`,
				}
			: {}),
	});
}

/** A full Signal K asset path with live-path suggestions and status. */
export function signalkPathColumn<R>(opts: {
	header: string;
	field: keyof R & string;
	placeholder: string;
	pathPattern: RegExp;
	ariaLabel?: string;
	pattern?: string;
	requiredInput?: (row: R) => RequiredInput | undefined;
}): Column<R> {
	return textColumn<R>({
		...opts,
		group: "Signal K input",
		monospace: true,
		suggestions: (available) =>
			available.flatMap((path) => {
				const match = path.match(opts.pathPattern);
				return match?.[1] ? [match[1]] : [];
			}),
		assetPrefix: (value) => value,
	});
}

// Standard NMEA 2000 instance-number column, shared by every mapping editor
// that carries one: the conversion's own instance and the linked battery, AC,
// and DC instances beside it. Clamps negatives to 0; the `min` attribute is
// advisory only and the wire format is unsigned. ariaLabel defaults to the
// header.
export function n2kInstanceColumn<R>(opts: {
	header: string;
	field: keyof R & string;
	ariaLabel?: string;
}): Column<R> {
	return numberColumn<R>({
		...opts,
		group: "NMEA 2000 output",
		min: 0,
		max: MAX_N2K_INSTANCE,
	});
}

/** The conversion's own NMEA 2000 instance, the field every mapping row has. */
export function instanceIdColumn<R extends { instanceId: number }>(opts: {
	header: string;
	ariaLabel?: string;
}): Column<R> {
	return n2kInstanceColumn<R>({ ...opts, field: "instanceId" });
}

interface Props<T> {
	title: string;
	/** Config collection used to associate validation issues with this table. */
	collection: string;
	rows: T[];
	emptyRow: () => T;
	columns: Column<T>[];
	available?: string[];
	onChange: (next: T[]) => void;
	// Optional one-line help text rendered below the table. Used to nudge
	// users about shared identifier conventions across related editors
	// (e.g. signalkId must match across ENGINE_PARAMETERS / STATIC / TRIP).
	helpText?: string;
}

export default function MappingTable<T>(props: Props<T>): React.ReactElement {
	const titleId = useId();
	const helpId = useId();
	const tableId = useId();
	const addRowRef = useRef<HTMLButtonElement>(null);
	const issues = useConfigIssues();
	const available = props.available ?? [];
	// One datalist per column, derived once. Deriving it inside the cell ran the
	// same filter over the whole server path inventory, and the same locale
	// sort, once for every row on screen and again on every keystroke.
	const columnSuggestions = props.columns.map((column) =>
		uniqueSorted(column.suggestions?.(available) ?? []),
	);
	// Stable per-row ids so React keys survive a mid-list Remove. Rows are
	// plain config objects with no natural id, so the ids live in state aligned
	// by index and only the two handlers that change the row list rewrite them:
	// an edit replaces a row in place and keeps its id, Remove drops the
	// matching slot, and Add row appends a fresh one. A list arriving from
	// anywhere else (a config load, a Discard) falls back to the row index,
	// which is the best available guess without a natural key.
	const [rowIds, setRowIds] = useState<{ ids: readonly string[]; nextId: number }>({
		ids: [],
		nextId: 0,
	});
	const ids = props.rows.map((_, index) => rowIds.ids[index] ?? `${tableId}-index-${index}`);

	// Remove is two-step: the Remove button opens an inline confirmation below
	// its row, and the confirmation's own action deletes it. The Remove button
	// keeps its name throughout, so a screen reader never hears the control it
	// pressed turn into a different one.
	const [confirmId, setConfirmId] = useState<string | null>(null);

	const removeRow = (i: number): void => {
		setRowIds((current) => ({ ids: ids.filter((_, j) => j !== i), nextId: current.nextId }));
		setConfirmId(null);
		props.onChange(props.rows.filter((_, j) => j !== i));
		// The Remove button that opened the confirmation leaves with its row, so
		// focus would otherwise fall to the body. Add row is the nearest stable
		// control in the same table.
		requestAnimationFrame(() => addRowRef.current?.focus());
	};
	const addRow = (): void => {
		setRowIds((current) => ({
			ids: [...ids, `${tableId}-added-${current.nextId}`],
			nextId: current.nextId + 1,
		}));
		props.onChange([...props.rows, props.emptyRow()]);
	};
	const columnGroups = props.columns.reduce<Array<{ label: string; count: number; key: string }>>(
		(groups, column) => {
			const label = column.group ?? "Configuration";
			const last = groups[groups.length - 1];
			if (last?.label === label) {
				last.count++;
				last.key += `:${column.header}`;
			} else groups.push({ label, count: 1, key: `${label}:${column.header}` });
			return groups;
		},
		[],
	);

	return (
		<Stack gap={2}>
			<TableScrollRegion aria-labelledby={titleId} data-mapping-collection={props.collection}>
				<Table
					caption={<span id={titleId}>{props.title}</span>}
					aria-describedby={props.helpText ? helpId : undefined}
				>
					<thead>
						<tr>
							{columnGroups.map((group) => (
								<TableHeaderCell key={group.key} colSpan={group.count} scope="colgroup">
									{group.label}
								</TableHeaderCell>
							))}
							<TableHeaderCell rowSpan={2}>
								<VisuallyHidden>Actions</VisuallyHidden>
							</TableHeaderCell>
						</tr>
						<tr>
							{props.columns.map((c) => (
								<TableHeaderCell key={c.header}>{c.header}</TableHeaderCell>
							))}
						</tr>
					</thead>
					<tbody>
						{props.rows.map((row, i) => {
							const rowId = ids[i] ?? `${tableId}-index-${i}`;
							const rowNumber = i + 1;
							const onRowChange = (next: T): void => {
								const out = props.rows.slice();
								out[i] = next;
								props.onChange(out);
							};
							return (
								<Fragment key={rowId}>
									<tr data-mapping-row="" style={C.mappingRow}>
										{props.columns.map((c, columnIndex) => {
											const content = c.render({
												row,
												onChange: onRowChange,
												available,
												controlId: `${rowId}-${columnIndex}`,
												suggestions: columnSuggestions[columnIndex] ?? [],
												rowNumber,
												errorIds: cellIssueIds(issues, props.collection, i, c.field),
											});
											// The first column identifies the row, so it is the row's
											// header cell: table navigation then announces which row a
											// cell belongs to instead of leaving the reader to count.
											return columnIndex === 0 ? (
												<TableHeaderCell key={c.header} scope="row" style={C.mappingCell}>
													{content}
												</TableHeaderCell>
											) : (
												<TableCell key={c.header} style={C.mappingCell}>
													{content}
												</TableCell>
											);
										})}
										<TableCell>
											<Button
												size="compact"
												variant="danger"
												onClick={() => setConfirmId(rowId)}
												aria-label={`Remove row ${rowNumber} from ${props.title}`}
											>
												Remove
											</Button>
										</TableCell>
									</tr>
									{confirmId === rowId ? (
										<tr>
											<TableCell colSpan={props.columns.length + 1}>
												<InlineConfirm
													open
													headingLevel={4}
													title={`Remove row ${rowNumber} from ${props.title}?`}
													message="The row leaves this table now and the saved configuration when you Save."
													confirmLabel="Remove row"
													onConfirm={() => removeRow(i)}
													onCancel={() => setConfirmId(null)}
												/>
											</TableCell>
										</tr>
									) : null}
								</Fragment>
							);
						})}
					</tbody>
				</Table>
			</TableScrollRegion>
			{props.helpText ? (
				<Text as="p" id={helpId} tone="muted" size="sm">
					{props.helpText}
				</Text>
			) : null}
			<Cluster>
				<Button ref={addRowRef} onClick={addRow} aria-label={`Add row to ${props.title}`}>
					+ Add row
				</Button>
			</Cluster>
		</Stack>
	);
}
