// Shared accessor for the per-instance row array a mapping editor edits. Every
// editor stores its rows under one key of the extras object and writes back a
// shallow-merged copy on change; this removes that repeated boilerplate (and
// the unchecked Array.isArray guard) from each editor. Not a hook: it derives
// from props each render and holds no state.
export function extraRows<R>(
	value: Record<string, unknown>,
	key: string,
	onChange: (next: Record<string, unknown>) => void,
): { rows: R[]; setRows: (next: R[]) => void } {
	const rows = Array.isArray(value[key]) ? (value[key] as R[]) : [];
	const setRows = (next: R[]): void => onChange({ ...value, [key]: next });
	return { rows, setRows };
}
