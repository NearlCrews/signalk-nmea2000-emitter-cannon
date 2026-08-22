import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { isValidNumber, toFiniteInRange } from "../utils/validation.js";

// PGN 129799 wire ceilings: both frequencies are unsigned 32-bit at 10 Hz
// resolution, and txPower is unsigned 16-bit in watts.
const MAX_RADIO_FREQUENCY_HZ = 42_949_672_920;
const MAX_TX_POWER_W = 65_532;

// Values below 1000 are interpreted as MHz and scaled to Hz; everything
// above is taken as-is. Marine VHF (156-162 MHz) and most SK radio paths
// fit this boundary, and any value already supplied in Hz starts in the
// hundreds of millions, well clear of 1000.
//
// Caveat: a future SDR-style integration that publishes UHF satcom (e.g.
// Iridium L-band downlink at 1616 MHz) as a raw MHz value would fall on
// the "as-is Hz" side of the threshold and mis-encode. If such a provider
// appears, replace this heuristic with an explicit units field rather
// than widening the boundary: the marine VHF range and an arbitrary UHF
// MHz value cannot be disambiguated by magnitude alone.
const MHZ_TO_HZ = 1_000_000;

export default function createRadioFrequencyConversion(): ConversionModule {
	return {
		title: "Radio Frequency (PGN 129799)",
		optionKey: "RADIO_FREQUENCY",
		category: "comms",
		// communication.vhf.* is not part of the canonical Signal K v1
		// schema; it is a convention used by VHF-aware upstream providers.
		// Requires such a provider.
		keys: [
			"communication.vhf.rxFrequency",
			"communication.vhf.txFrequency",
			"communication.vhf.power",
		],
		callback: (rxFreq: unknown, txFreq: unknown, power: unknown): N2KMessage[] => {
			const rxFreqHz = normalizeFreq(rxFreq);
			const txFreqHz = normalizeFreq(txFreq);
			if (rxFreqHz === null && txFreqHz === null) return [];

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129799,
					dst: N2K_BROADCAST_DST,
					fields: {
						rxFrequency: rxFreqHz,
						txFrequency: txFreqHz,
						txPower: toFiniteInRange(power, 0, MAX_TX_POWER_W),
					},
				},
			];
		},
		tests: [
			{
				input: [156.8, 156.8, 25],
				expected: [
					{
						prio: 2,
						pgn: 129799,
						dst: 255,
						fields: {
							rxFrequency: 156800000,
							txFrequency: 156800000,
							txPower: 25,
						},
					},
				],
			},
			{
				input: [156650000, 161250000, 5],
				expected: [
					{
						prio: 2,
						pgn: 129799,
						dst: 255,
						fields: {
							rxFrequency: 156650000,
							txFrequency: 161250000,
							txPower: 5,
						},
					},
				],
			},
		],
	};
}

function normalizeFreq(freq: unknown): number | null {
	if (!isValidNumber(freq)) return null;
	// Signal K publishes VHF frequencies in either MHz or Hz depending on the
	// provider, so a small value is scaled up. Both wire fields are unsigned
	// 32-bit at 10 Hz resolution and would wrap rather than reject, so the
	// scaled result is range checked before it is emitted.
	const hz = freq < 1000 ? freq * MHZ_TO_HZ : freq;
	return toFiniteInRange(hz, 0, MAX_RADIO_FREQUENCY_HZ) ?? null;
}
