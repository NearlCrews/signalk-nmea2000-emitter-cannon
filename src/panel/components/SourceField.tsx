import type * as React from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
	Banner,
	Button,
	Code,
	LabeledField,
	LiveRegion,
	Select,
	Stack,
	splitLabeledFieldControlProps,
	TextInput,
} from "signalk-nearlcrews-ui";
import { inputPathIssueIds, useConfigIssues } from "../configIssues";
import { isKnownOption } from "../selectOptions";

const MANUAL_PUBLISHER = "__manual_publisher__";

interface Props {
	path: string;
	value: string;
	onChange: (next: string) => void;
	sourcesFor: (path: string) => string[];
	sourceErrorFor: (path: string) => string | null;
	ensureLoaded: (path: string, force?: boolean) => Promise<void>;
}

export default function SourceField({
	path,
	value,
	onChange,
	sourcesFor,
	sourceErrorFor,
	ensureLoaded,
}: Props): React.ReactElement {
	const warningId = useId();
	// Where focus goes when the retry below succeeds and takes its banner, and
	// the button the user pressed, out of the tree: the select the retry just
	// filled with publishers, which is what they came for.
	const publisherRef = useRef<HTMLSelectElement>(null);
	const [loaded, setLoaded] = useState(false);
	const [manualEntry, setManualEntry] = useState(false);
	const issueIds = inputPathIssueIds(useConfigIssues(), path);

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
	const matchesServerPublisher = sources.some(
		(source) => source === value || source.startsWith(`${value}.`),
	);
	const showMismatch =
		loaded && lookupError === null && value.length > 0 && !matchesServerPublisher;
	const hasWarning = lookupError !== null || showMismatch;
	const hasSavedUnlistedValue = value.length > 0 && !isKnownOption(value, sources);
	const selectValue = manualEntry ? MANUAL_PUBLISHER : value;
	// Text outside the field that also describes the publisher control: the
	// validation message for this path, and the retry warning beside it. The
	// field merges these after its own description and error.
	const publisherDescribedBy = [issueIds, hasWarning ? warningId : undefined];

	return (
		<Stack gap={2}>
			{/* Mounted before any warning arrives, so a screen reader observes the
			    text change rather than the region appearing with it. The banners
			    below stay as persistent, readable feedback. */}
			<LiveRegion
				message={
					lookupError !== null
						? `The publisher lookup for ${path} could not be reached.`
						: showMismatch
							? `The saved publisher filter for ${path} names nothing the server model publishes.`
							: ""
				}
			/>
			<LabeledField label="Signal K input path">
				{/* An output, not a read-only input: the path is computed by the
				    conversion and never editable, so it carries no tab stop. */}
				<output>
					<Code>{path}</Code>
				</output>
			</LabeledField>
			<LabeledField
				label="Signal K publisher ($source), optional"
				description={`This filters who may publish the fixed input path ${path}. It does not change the Signal K path. Choose All publishers unless you need to select one sensor or provider.`}
				controlDescribedBy={publisherDescribedBy}
			>
				{(field) => {
					const { controlProps } = splitLabeledFieldControlProps(field);
					return (
						<Select
							{...controlProps}
							ref={publisherRef}
							aria-invalid={issueIds === undefined ? undefined : true}
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
						</Select>
					);
				}}
			</LabeledField>
			{manualEntry ? (
				<LabeledField label="Manual Signal K publisher" controlDescribedBy={publisherDescribedBy}>
					<TextInput
						type="text"
						monospace
						value={value}
						placeholder="publisher.device"
						onChange={(event) => onChange(event.target.value)}
						aria-invalid={issueIds === undefined ? undefined : true}
					/>
				</LabeledField>
			) : null}
			{lookupError !== null ? (
				<Banner
					id={warningId}
					tone="warning"
					dismissFocusRef={publisherRef}
					actions={
						<Button size="compact" onClick={() => void ensureLoaded(path, true)}>
							Retry
						</Button>
					}
				>
					Publisher lookup unavailable: {lookupError}. The saved filter could not be verified.
				</Banner>
			) : showMismatch ? (
				<Banner id={warningId} tone="warning">
					No publisher in the server model matches “{value}”. This field accepts a $source publisher
					ID, not another Signal K path. The filter may reject updates until that publisher appears
					or the filter is cleared.
				</Banner>
			) : null}
		</Stack>
	);
}
