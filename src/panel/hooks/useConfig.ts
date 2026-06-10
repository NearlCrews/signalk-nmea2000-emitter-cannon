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
import type { PresetTag } from "../../config/enums.js";
import { migrateLegacyConfig } from "../../config/migrate.js";
import {
	type Config,
	type ConversionConfig,
	emptyConversionConfig,
} from "../../config/schema.js";

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

function reducer(state: Config, action: Action): Config {
	switch (action.type) {
		case "discard":
			return action.config;
		case "setGlobalResend":
			return { ...state, globalResendInterval: action.ms };
		case "setAdvisor":
			return { ...state, advisor: action.advisor };
		case "setEnabled": {
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
			let next = state;
			for (const m of action.meta) {
				if (m.presets.includes(action.preset)) {
					const { state: s, entry } = withEntry(next, m.key);
					next = {
						...s,
						conversions: {
							...s.conversions,
							[m.key]: { ...entry, enabled: true },
						},
					};
				}
			}
			return next;
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
