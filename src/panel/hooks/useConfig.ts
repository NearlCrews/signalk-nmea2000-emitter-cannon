import type * as React from "react";
import { useCallback, useReducer, useState } from "react";
import type { ConversionMetadata } from "../../api/types.js";
import type { PresetTag } from "../../config/enums.js";
import { migrateLegacyConfig } from "../../config/migrate";
import type { Config, ConversionConfig } from "../../config/schema.js";

type Action =
	| { type: "setEnabled"; key: string; enabled: boolean }
	| { type: "setResend"; key: string; ms: number }
	| { type: "setSource"; key: string; path: string; source: string }
	| { type: "setExtras"; key: string; extras: Record<string, unknown> }
	| { type: "setGlobalResend"; ms: number }
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
	const entry: ConversionConfig = {
		enabled: false,
		resend: 0,
		sources: {},
		extras: {},
	};
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

export function useConfig(initial: unknown): {
	state: Config;
	savedState: Config;
	dispatch: React.Dispatch<Action>;
	markSaved: () => void;
} {
	// Run migration exactly once at first render so state and savedState are
	// both the migrated shape from the start. This keeps `dirty` false on
	// mount and prevents legacy shapes from leaking into reducer state.
	const [migratedInitial] = useState<Config>(() =>
		migrateLegacyConfig(initial),
	);
	const [state, dispatch] = useReducer(reducer, migratedInitial);
	// savedState is the last config the user persisted (or the migrated
	// initial value, before any save). The panel uses identity equality
	// (`state !== savedState`) as the dirty check: every reducer case
	// returns a new object on change, so identity is a sound stand-in for
	// the previous JSON.stringify deep compare without the O(N) cost.
	const [savedState, setSavedState] = useState<Config>(migratedInitial);
	const markSaved = useCallback(() => {
		setSavedState(state);
	}, [state]);
	return { state, savedState, dispatch, markSaved };
}
