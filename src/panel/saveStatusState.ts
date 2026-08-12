type SaveStatusKind = "clean" | "dirty" | "requested" | "unconfigured";

export interface SaveStatusState {
	kind: SaveStatusKind;
	message: string;
}

/** Resolve the panel's truthful state after a void host save callback. */
export function resolveSaveStatus(
	dirty: boolean,
	unconfigured: boolean,
	saveRequestedAt: number | null,
): SaveStatusState {
	if (dirty) return { kind: "dirty", message: "Unsaved changes" };
	if (saveRequestedAt !== null) return { kind: "requested", message: "Save requested" };
	if (unconfigured) {
		return { kind: "unconfigured", message: "Save to enable the plugin." };
	}
	return { kind: "clean", message: "No unsaved changes." };
}
