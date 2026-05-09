import { N2K_BROADCAST_DST, N2K_DEFAULT_PRIORITY } from "../constants.js";
import type { ConversionModule, N2KMessage } from "../types/index.js";
import { isValidNumber, toValidNumber } from "../utils/validation.js";

const DEFAULT_TX_POWER_W = 25;
const DEFAULT_ANTENNA_HEIGHT_M = 10;
const DEFAULT_SQUELCH_LEVEL = 0;
// Marine VHF and most radio inputs land between 100 kHz and 10 GHz when given
// in Hz; values below 1000 are treated as MHz and scaled.
const MHZ_TO_HZ = 1_000_000;

export default function createRadioFrequencyConversion(): ConversionModule {
	return {
		title: "Radio Frequency/Mode/Power (129799)",
		optionKey: "RADIO_FREQUENCY",
		keys: [
			"communication.vhf.rxFrequency",
			"communication.vhf.txFrequency",
			"communication.vhf.power",
			"communication.vhf.squelch",
		],
		callback: (
			rxFreq: unknown,
			txFreq: unknown,
			power: unknown,
			squelch: unknown,
		): N2KMessage[] => {
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
						radioSystem: "VHF",
						txPower: toValidNumber(power) ?? DEFAULT_TX_POWER_W,
						antennaHeight: DEFAULT_ANTENNA_HEIGHT_M,
						_2gSpectrum: "No",
						positioningSystem: "GPS",
						squelchLevel: toValidNumber(squelch) ?? DEFAULT_SQUELCH_LEVEL,
					},
				},
			];
		},
		tests: [
			{
				input: [156.8, 156.8, 25, 3],
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
				input: [156650000, 161250000, 5, 0],
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
	return freq < 1000 ? freq * MHZ_TO_HZ : freq;
}
