import {
	MAX_N2K_INSTANCE,
	MAX_SWITCH_BANK_CHANNEL,
	MIN_SWITCH_BANK_CHANNEL,
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SWITCH_PATH_ROOT,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type {
	ConversionModule,
	N2KMessage,
	SignalKApp,
	SubConversionModule,
} from "../types/index.js";
import { isIntegerInRange, isPlainObject, parseSignalKAssetPath } from "../utils/validation.js";
import { instanceList } from "./instanceOptions.js";

// NMEA 2000 bank input (n2k-signalk's electrical.switches.bank.*) is blocked
// by the echo guard, so a mapped bus switch can never be re-sent.

interface SwitchConfig {
	signalkPath: string;
	instanceId: number;
	channel: number;
	/** The row's position in the mapping table. */
	row: number;
}

function normalizedSwitchConfig(config: unknown, row: number): SwitchConfig | null {
	if (!isPlainObject(config)) return null;
	const signalkPath = parseSignalKAssetPath(config.signalkPath, SWITCH_PATH_ROOT);
	// The bank and channel are dropped rather than clamped: clamping 300 onto
	// 252, or 29 onto 28, would report one switch's state as another's.
	const { instanceId, channel } = config;
	if (
		signalkPath === null ||
		!isIntegerInRange(instanceId, 0, MAX_N2K_INSTANCE) ||
		!isIntegerInRange(channel, MIN_SWITCH_BANK_CHANNEL, MAX_SWITCH_BANK_CHANNEL)
	) {
		return null;
	}
	return { signalkPath, instanceId, channel, row };
}

// Signal K publishers disagree on the state type: n2k-signalk writes 1 or 0,
// and some switch plugins write true or false. Anything else is unknown, and
// an unknown channel is left out so it decodes as not available.
function indicatorFor(state: unknown): "On" | "Off" | undefined {
	if (state === true || state === 1) return "On";
	if (state === false || state === 0) return "Off";
	return undefined;
}

/** Group switch rows by bank, keeping the first row for a repeated channel. */
function banksFrom(switches: readonly SwitchConfig[]): Map<number, SwitchConfig[]> {
	const banks = new Map<number, SwitchConfig[]>();
	for (const row of switches) {
		const bank = banks.get(row.instanceId) ?? [];
		if (bank.some((existing) => existing.channel === row.channel)) continue;
		bank.push(row);
		banks.set(row.instanceId, bank);
	}
	return banks;
}

export default function createSwitchBankConversion(_app: SignalKApp): ConversionModule {
	return {
		title: "Switch Bank Status (PGN 127501)",
		optionKey: "SWITCH_BANK",
		category: "electrical",
		context: VESSELS_SELF_CONTEXT,

		testOptions: {
			switches: [
				{ signalkPath: "electrical.switches.anchorLight", instanceId: 7, channel: 1 },
				{ signalkPath: "electrical.switches.deckLight", instanceId: 7, channel: 3 },
			],
		},

		conversions: (options: unknown): SubConversionModule[] | null => {
			const switches = instanceList<unknown>(options, "switches").flatMap((config, row) => {
				const normalized = normalizedSwitchConfig(config, row);
				return normalized === null ? [] : [normalized];
			});
			if (switches.length === 0) return null;

			// No timeouts: a switch holds its state until it changes, and many
			// providers publish only on a change, so an expiry would drop the bank
			// from the bus a minute after the last toggle while the switch is
			// still on. The bank reports the last state Signal K holds.
			return [...banksFrom(switches)].map(
				([instance, rows]): SubConversionModule => ({
					title: `Switch Bank Status (PGN 127501), bank ${instance}`,
					mappingRow: rows[0]?.row ?? 0,
					keys: rows.map((row) => `${row.signalkPath}.state`),
					callback: (...states: unknown[]): N2KMessage[] => {
						const indicators: Record<string, string> = {};
						for (const [index, row] of rows.entries()) {
							const indicator = indicatorFor(states[index]);
							if (indicator !== undefined) indicators[`indicator${row.channel}`] = indicator;
						}
						if (Object.keys(indicators).length === 0) return [];

						return [
							{
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 127501,
								dst: N2K_BROADCAST_DST,
								fields: { instance, ...indicators },
							},
						];
					},
					tests: [
						{
							input: [1, false],
							expected: [
								{
									prio: 3,
									pgn: 127501,
									dst: 255,
									fields: { instance: 7, indicator1: "On", indicator3: "Off" },
								},
							],
						},
						{
							// An unrecognized state is left out, not guessed.
							input: [true, "on"],
							expected: [
								{
									prio: 3,
									pgn: 127501,
									dst: 255,
									fields: { instance: 7, indicator1: "On" },
								},
							],
						},
						{
							input: [null, undefined],
							expected: [],
						},
					],
				}),
			);
		},
	};
}
