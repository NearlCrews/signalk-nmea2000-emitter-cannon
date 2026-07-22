import type * as React from "react";
import { useEffect, useId, useState } from "react";
import { CONVERSION_STYLES as C } from "../conversionStyles";

const MANUAL_PUBLISHER = "__manual_publisher__";

interface Props {
	path: string;
	value: string;
	onChange: (next: string) => void;
	sourcesFor: (path: string) => string[];
	sourceErrorFor: (path: string) => string | null;
	ensureLoaded: (path: string, force?: boolean) => Promise<void>;
	// Disambiguates the datalist id when two rendered fields share a path
	// (e.g. two expanded conversion cards subscribing to the same Signal K
	// key). Pass the conversion option key.
	idScope: string;
}

export default function SourceField({
	path,
	value,
	onChange,
	sourcesFor,
	sourceErrorFor,
	ensureLoaded,
	idScope,
}: Props): React.ReactElement {
	const controlId = useId();
	const [loaded, setLoaded] = useState(false);
	const [manualEntry, setManualEntry] = useState(false);

	useEffect(() => {
		let active = true;
		setLoaded(false);
		void ensureLoaded(path).finally(() => {
			if (active) setLoaded(true);
		});
		return () => {
			active = false;
		};
	}, [path, ensureLoaded]);

	const sources = sourcesFor(path);
	const lookupError = sourceErrorFor(path);
	const pathId = `signalk-path-${idScope}-${controlId}`;
	const publisherId = `signalk-publisher-${idScope}-${controlId}`;
	const manualId = `signalk-publisher-manual-${idScope}-${controlId}`;
	const helpId = `signalk-publisher-help-${idScope}-${controlId}`;
	const warningId = `signalk-publisher-warning-${idScope}-${controlId}`;
	const matchesServerPublisher = sources.some(
		(source) => source === value || source.startsWith(`${value}.`),
	);
	const showMismatch =
		loaded && lookupError === null && value.length > 0 && !matchesServerPublisher;
	const describedBy = showMismatch || lookupError ? `${helpId} ${warningId}` : helpId;
	const hasSavedUnlistedValue = value.length > 0 && !sources.includes(value);
	const selectValue = manualEntry ? MANUAL_PUBLISHER : value;

	return (
		<div>
			<div style={C.fieldStack}>
				<label htmlFor={pathId} style={C.fieldStackLabel}>
					Signal K input path
				</label>
				<input
					id={pathId}
					style={C.inputPath}
					type="text"
					value={path}
					readOnly
					aria-readonly="true"
					aria-label={`Signal K input path: ${path}`}
				/>
			</div>
			<div style={C.fieldStack}>
				<label htmlFor={publisherId} style={C.fieldStackLabel}>
					Signal K publisher ($source), optional
				</label>
				<select
					id={publisherId}
					style={C.selectFull}
					value={selectValue}
					onChange={(event) => {
						const next = event.target.value;
						if (next === MANUAL_PUBLISHER) {
							setManualEntry(true);
							return;
						}
						setManualEntry(false);
						onChange(next);
					}}
					onFocus={() => void ensureLoaded(path)}
					aria-describedby={describedBy}
					aria-label={`Signal K publisher ($source), optional, for ${path}`}
					data-signalk-source-path={path}
				>
					<option value="">All publishers</option>
					{sources.map((source) => (
						<option key={source} value={source}>
							Publisher in server model: {source}
						</option>
					))}
					{hasSavedUnlistedValue ? <option value={value}>Saved filter: {value}</option> : null}
					<option value={MANUAL_PUBLISHER}>Enter publisher manually...</option>
				</select>
				<p id={helpId} style={C.fieldHelp}>
					This filters who may publish the fixed input path. It does not change the Signal K path.
					Choose All publishers unless you need to select one sensor or provider.
				</p>
				{manualEntry ? (
					<>
						<label htmlFor={manualId} style={C.fieldStackLabel}>
							Manual Signal K publisher for {path}
						</label>
						<input
							id={manualId}
							style={C.inputFull}
							type="text"
							value={value}
							placeholder="publisher.device"
							onChange={(event) => onChange(event.target.value)}
							aria-describedby={describedBy}
						/>
					</>
				) : null}
				{lookupError ? (
					<p id={warningId} role="status" style={C.fieldWarning}>
						Publisher lookup unavailable: {lookupError}. The saved filter could not be verified.{" "}
						<button type="button" onClick={() => void ensureLoaded(path, true)}>
							Retry
						</button>
					</p>
				) : showMismatch ? (
					<p id={warningId} role="status" style={C.fieldWarning}>
						No publisher in the server model matches “{value}”. This field accepts a $source
						publisher ID, not another Signal K path. The filter may reject updates until that
						publisher appears or the filter is cleared.
					</p>
				) : null}
			</div>
		</div>
	);
}
