import type * as React from "react";
import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import type { ConversionMetadata } from "../../api/types.js";
import { emptyConversionConfig } from "../../config/defaults.js";
import type { PresetTag } from "../../config/enums.js";
import { migrateLegacyConfig } from "../../config/migrate.js";
import { RAYMARINE_EXTRAS_PATCH } from "../../config/raymarinePreset.js";
import type { Config, ConversionConfig } from "../../config/schema.js";

// The patch table never changes at runtime, so derive its entries once.
const RAYMARINE_PATCH_ENTRIES = Object.entries(RAYMARINE_EXTRAS_PATCH);

export type Action =
	| { type: "setEnabled"; key: string; enabled: boolean }
	| { type: "setResend"; key: string; ms: number }
	| { type: "setSource"; key: string; path: string; source: string }
	| { type: "setExtras"; key: string; extras: Record<string, unknown> }
	| { type: "setGlobalResend"; ms: number }
	| { type: "setAdvisor"; advisor: Config["advisor"] }
	| { type: "applyPreset"; preset: PresetTag; meta: ConversionMetadata[] }
	| { type: "discard"; config: Config };

// Returns the (possibly new) config plus the entry guaranteed to live at
// `conversions[key]`. Pairing the two reads avoids the `if (!existing)
// return s` guard each reducer case used to need under noUncheckedIndexedAccess:
// once we have the entry typed as ConversionConfig, the index dereference is
// already type-safe.
function withEntry(
	s: Config,
	key: string,
): { state: Config; entry: ConversionConfig } {
	const existing = s.conversions[key];
	if (existing) return { state: s, entry: existing };
	const entry: ConversionConfig = emptyConversionConfig();
	return {
		state: {
			...s,
			conversions: { ...s.conversions, [key]: entry },
		},
		entry,
	};
}

// Config values are JSON-safe. This comparison runs only for explicit user
// actions that replace a nested block, not on render, and keeps a semantic
// no-op from marking the panel dirty through a fresh object identity.
function sameConfigValue(a: unknown, b: unknown): boolean {
	return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function reducer(state: Config, action: Action): Config {
	switch (action.type) {
		case "discard":
			return action.config === state ? state : action.config;
		case "setGlobalResend":
			if (state.globalResendInterval === action.ms) return state;
			return { ...state, globalResendInterval: action.ms };
		case "setAdvisor":
			if (sameConfigValue(state.advisor, action.advisor)) return state;
			return { ...state, advisor: action.advisor };
		case "setEnabled": {
			if (
				(state.conversions[action.key]?.enabled ?? false) === action.enabled
			) {
				return state;
			}
			const { state: s, entry } = withEntry(state, action.key);
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...entry, enabled: action.enabled },
				},
			};
		}
		case "setResend": {
			if ((state.conversions[action.key]?.resend ?? 0) === action.ms) {
				return state;
			}
			const { state: s, entry } = withEntry(state, action.key);
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...entry, resend: action.ms },
				},
			};
		}
		case "setSource": {
			if (
				(state.conversions[action.key]?.sources[action.path] ?? "") ===
				action.source
			) {
				return state;
			}
			const { state: s, entry } = withEntry(state, action.key);
			// schema.ts now declares sources as required `{}` default, so the
			// spread does not need a defensive `?? {}` guard.
			const sources = { ...entry.sources };
			if (action.source) sources[action.path] = action.source;
			else delete sources[action.path];
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...entry, sources },
				},
			};
		}
		case "setExtras": {
			if (
				sameConfigValue(
					state.conversions[action.key]?.extras ?? {},
					action.extras,
				)
			) {
				return state;
			}
			const { state: s, entry } = withEntry(state, action.key);
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...entry, extras: action.extras },
				},
			};
		}
		case "applyPreset": {
			// Copy the map only when the preset changes at least one entry. This
			// keeps re-applying an already active preset from marking the panel
			// dirty while retaining one shallow copy for a multi-key update.
			let conversions = state.conversions;
			const ensure = (key: string): ConversionConfig =>
				conversions[key] ?? emptyConversionConfig();
			const write = (key: string, entry: ConversionConfig): void => {
				if (conversions === state.conversions) {
					conversions = { ...state.conversions };
				}
				conversions[key] = entry;
			};
			for (const m of action.meta) {
				if (m.presets.includes(action.preset)) {
					const entry = ensure(m.key);
					if (!entry.enabled) write(m.key, { ...entry, enabled: true });
				}
			}
			// The Raymarine preset also writes source/instance extras so the
			// inside-family temperatures and inside humidity collapse onto the
			// "Inside" source at distinct instances, which is the only way they
			// render on an Axiom or i70. Idempotent: re-applying yields the same
			// instances. The patch keys are also "raymarine"-tagged, so the loop
			// above already enabled them; this just layers the extras on top.
			if (action.preset === "raymarine") {
				for (const [key, patch] of RAYMARINE_PATCH_ENTRIES) {
					const entry = ensure(key);
					const extrasAlreadyApplied = Object.entries(patch).every(
						([patchKey, patchValue]) =>
							sameConfigValue(entry.extras[patchKey], patchValue),
					);
					if (entry.enabled && extrasAlreadyApplied) continue;
					write(key, {
						...entry,
						enabled: true,
						extras: { ...entry.extras, ...patch },
					});
				}
			}
			return conversions === state.conversions
				? state
				: { ...state, conversions };
		}
	}
}

/**
 * Three-way merge of an externally changed configuration into the user's
 * in-progress edits, so a dirty panel can absorb an advisor write (the "Review
 * now" button, a scheduled review) without either clobbering the user's
 * unsaved edits or having the next Save clobber the advisor's writes.
 *
 * The three inputs are the classic merge triple:
 *   - `base`   the last config the panel and server agreed on (the saved
 *              baseline / common ancestor)
 *   - `ours`   the user's current reducer state, with unsaved edits
 *   - `theirs` the new external configuration the host just handed us
 *
 * Merge rule, at per-conversion-entry granularity plus globalResendInterval and
 * the whole advisor block: for every key the user has NOT touched (`ours` is
 * identity-equal to `base` for that key) adopt `theirs`; for every key the user
 * HAS touched keep `ours`. The user wins on a conflicting key. Identity
 * equality is sound because every reducer case returns a fresh object only for
 * the field it changes, so an untouched entry keeps its `base` reference while
 * a touched one gets a new reference.
 *
 * The caller pairs this with `setSavedState(theirs)`: the merged result becomes
 * the new reducer state, `theirs` becomes the new baseline, so Save persists
 * the merged config and Discard reverts to the latest external state.
 */
export function mergeExternalConfig(
	base: Config,
	ours: Config,
	theirs: Config,
): Config {
	const conversions: Record<string, ConversionConfig> = {};
	const keys = new Set<string>([
		...Object.keys(theirs.conversions),
		...Object.keys(ours.conversions),
	]);
	for (const key of keys) {
		const ourEntry = ours.conversions[key];
		// Untouched (ours === base for this key): adopt the external entry, which
		// may add, change, or drop it. Touched: keep the user's edit verbatim.
		const entry =
			ourEntry === base.conversions[key] ? theirs.conversions[key] : ourEntry;
		if (entry !== undefined) conversions[key] = entry;
	}
	const merged: Config = {
		globalResendInterval:
			ours.globalResendInterval === base.globalResendInterval
				? theirs.globalResendInterval
				: ours.globalResendInterval,
		conversions,
	};
	const advisor = ours.advisor === base.advisor ? theirs.advisor : ours.advisor;
	if (advisor !== undefined) merged.advisor = advisor;
	return merged;
}

export function useConfig(initial: unknown): {
	state: Config;
	savedState: Config;
	dispatch: React.Dispatch<Action>;
	markSaved: () => void;
} {
	// Migrate once per `initial` value. `incoming` seeds both the reducer state
	// and savedState (each reads it only on first render), so the migration
	// runs once on mount rather than once here and again in a separate
	// initializer. This keeps `dirty` false on mount and prevents legacy shapes
	// from leaking into reducer state.
	const incoming = useMemo(() => migrateLegacyConfig(initial), [initial]);
	const [state, dispatch] = useReducer(reducer, incoming);
	// savedState is the last config the user persisted (or the migrated
	// initial value, before any save). The panel uses identity equality
	// (`state !== savedState`) as the dirty check: every reducer case
	// returns a new object on change, so identity is a sound stand-in for
	// the previous JSON.stringify deep compare without the O(N) cost.
	const [savedState, setSavedState] = useState<Config>(incoming);
	const markSaved = useCallback(() => {
		setSavedState(state);
	}, [state]);
	// Tracks the last `incoming` object identity we reconciled against. `incoming`
	// is memoized on `initial`, so its identity changes only when the host hands
	// the panel a new `configuration` prop (an advisor write, a scheduled review),
	// never on a local keystroke. Gating on this ref keeps the deep compare and
	// the merge off the per-edit render path, and stops a stale prop from
	// reverting a fresh local Save before the host echoes it back.
	const reconciledIncoming = useRef(incoming);
	// Reconcile an externally changed `configuration` prop with local state.
	//   - Clean panel: adopt the external config wholesale (old behavior).
	//   - Dirty panel: three-way merge so the user's edits survive AND the
	//     advisor's writes survive. See mergeExternalConfig for the rule.
	// Either way `savedState` becomes the external config (the new baseline), so
	// Save persists the reconciled result and Discard reverts to the external
	// state, never to a pre-advisor snapshot.
	useEffect(() => {
		if (incoming === reconciledIncoming.current) return;
		reconciledIncoming.current = incoming;
		// `incoming` is a fresh object each time `initial` changes, so identity
		// cannot stand in for "did anything actually change"; the deep compare
		// runs here only on a genuine prop change, not per keystroke.
		if (JSON.stringify(incoming) === JSON.stringify(savedState)) return;
		const next =
			state === savedState
				? incoming
				: mergeExternalConfig(savedState, state, incoming);
		setSavedState(incoming);
		dispatch({ type: "discard", config: next });
	}, [incoming, state, savedState]);
	return { state, savedState, dispatch, markSaved };
}

// Test-only: exercises the setAdvisor reducer case without a React render.
export function __advisorReducerForTest(
	state: Config,
	advisor: Config["advisor"],
): Config {
	return reducer(state, { type: "setAdvisor", advisor });
}

// Test-only: exercises the applyPreset reducer case without a React render.
export function __applyPresetForTest(
	state: Config,
	preset: PresetTag,
	meta: ConversionMetadata[],
): Config {
	return reducer(state, { type: "applyPreset", preset, meta });
}

// Test-only: verifies that semantic no-op actions preserve state identity.
export function __configReducerForTest(state: Config, action: Action): Config {
	return reducer(state, action);
}
