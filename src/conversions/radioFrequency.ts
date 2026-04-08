import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";

export default function createRadioFrequencyConversion(): ConversionModule {
	return {
		title: "Radio Frequency/Mode/Power (129799)",
		optionKey: "RADIO_FREQUENCY",
		keys: [
			"communication.vhf.rxFrequency",
			"communication.vhf.txFrequency",
			"communication.vhf.mode",
			"communication.vhf.power",
			"communication.vhf.squelch",
		],
		callback: (
			rxFreq: unknown,
			txFreq: unknown,
			_mode: unknown,
			power: unknown,
			squelch: unknown,
		): N2KMessage[] => {
			// Send radio data if we have at least frequency info
			if (rxFreq == null && txFreq == null) {
				return [];
			}

			// Convert frequency to Hz if needed (assume input might be in MHz)
			const normalizeFreq = (freq: unknown): number | null => {
				if (freq == null || typeof freq !== "number") return null;
				// If frequency is less than 1000, assume it's in MHz and convert to Hz
				return freq < 1000 ? freq * 1000000 : freq;
			};

			const rxFreqHz = normalizeFreq(rxFreq);
			const txFreqHz = normalizeFreq(txFreq);

			return [
				{
					prio: N2K_DEFAULT_PRIORITY,
					pgn: 129799,
					dst: N2K_BROADCAST_DST,
					fields: {
						rxFrequency: rxFreqHz,
						txFrequency: txFreqHz,
						radioSystem: "VHF",
						txPower: typeof power === "number" ? power : 25, // Default 25W
						antennaHeight: 10, // Default 10m
						_2gSpectrum: "No",
						positioningSystem: "GPS",
						squelchLevel: typeof squelch === "number" ? squelch : 0,
					},
				},
			];
		},
		tests: [
			{
				input: [156.8, 156.8, "simplex", 25, 3], // Channel 16 VHF
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
				input: [156650000, 161250000, "duplex", 5, 0], // Already in Hz, duplex channel
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
