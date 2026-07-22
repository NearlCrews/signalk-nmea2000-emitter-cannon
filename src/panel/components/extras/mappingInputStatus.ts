export interface RequiredInput {
	/** Human-readable measurement or input group shown in the row status. */
	label: string;
	/**
	 * At least one alternative must be complete. Each alternative is a list of
	 * leaves that must all exist below the configured asset path.
	 */
	alternatives: ReadonlyArray<ReadonlyArray<string>>;
}

export interface MappingInputStatus {
	assetFound: boolean;
	requiredInputFound?: boolean;
}

/** Inspect path inventory without treating a shared asset prefix as live data. */
export function mappingInputStatus(
	assetPath: string,
	available: readonly string[],
	requiredInput?: RequiredInput,
): MappingInputStatus {
	const assetFound = available.some(
		(path) => path === assetPath || path.startsWith(`${assetPath}.`),
	);
	if (!requiredInput) return { assetFound };
	return {
		assetFound,
		requiredInputFound: requiredInput.alternatives.some((alternative) =>
			alternative.every((leaf) => available.includes(`${assetPath}.${leaf}`)),
		),
	};
}
