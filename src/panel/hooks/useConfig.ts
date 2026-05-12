import type * as React from "react";
import { useReducer, useState } from "react";
import type { ConversionMetadata } from "../../api/types.js";
import type { PresetTag } from "../../config/enums.js";
import { migrateLegacyConfig } from "../../config/migrate";
import type { Config } from "../../config/schema.js";

type Action =
	// `init` is reserved for external swaps of the entire config (future use).
	// Legacy migration runs synchronously at hook init via useState initializer.
	| { type: "init"; config: Config }
	| { type: "setEnabled"; key: string; enabled: boolean }
	| { type: "setResend"; key: string; ms: number }
	| { type: "setSource"; key: string; path: string; source: string }
	| { type: "setExtras"; key: string; extras: Record<string, unknown> }
	| { type: "setGlobalResend"; ms: number }
	| { type: "applyPreset"; preset: PresetTag; meta: ConversionMetadata[] }
	| { type: "discard"; config: Config };

function ensureKey(s: Config, key: string): Config {
	if (s.conversions[key]) return s;
	return {
		...s,
		conversions: {
			...s.conversions,
			[key]: { enabled: false, resend: 0, sources: {}, extras: {} },
		},
	};
}

function reducer(state: Config, action: Action): Config {
	switch (action.type) {
		case "init":
		case "discard":
			return action.config;
		case "setGlobalResend":
			return { ...state, globalResendInterval: action.ms };
		case "setEnabled": {
			const s = ensureKey(state, action.key);
			const existing = s.conversions[action.key];
			if (!existing) return s;
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...existing, enabled: action.enabled },
				},
			};
		}
		case "setResend": {
			const s = ensureKey(state, action.key);
			const existing = s.conversions[action.key];
			if (!existing) return s;
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...existing, resend: action.ms },
				},
			};
		}
		case "setSource": {
			const s = ensureKey(state, action.key);
			const existing = s.conversions[action.key];
			if (!existing) return s;
			const sources = { ...(existing.sources ?? {}) };
			if (action.source) sources[action.path] = action.source;
			else delete sources[action.path];
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...existing, sources },
				},
			};
		}
		case "setExtras": {
			const s = ensureKey(state, action.key);
			const existing = s.conversions[action.key];
			if (!existing) return s;
			return {
				...s,
				conversions: {
					...s.conversions,
					[action.key]: { ...existing, extras: action.extras },
				},
			};
		}
		case "applyPreset": {
			let next = state;
			for (const m of action.meta) {
				if (m.presets.includes(action.preset)) {
					next = ensureKey(next, m.key);
					const existing = next.conversions[m.key];
					if (!existing) continue;
					next = {
						...next,
						conversions: {
							...next.conversions,
							[m.key]: { ...existing, enabled: true },
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
	initial: Config;
	dispatch: React.Dispatch<Action>;
} {
	// Run migration exactly once at first render so state and initial are
	// both the migrated shape from the start. This keeps `dirty` false on
	// mount and prevents legacy shapes from leaking into reducer state.
	const [migratedInitial] = useState<Config>(() =>
		migrateLegacyConfig(initial),
	);
	const [state, dispatch] = useReducer(reducer, migratedInitial);
	return { state, initial: migratedInitial, dispatch };
}
