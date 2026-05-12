import {
	N2K_BROADCAST_DST,
	N2K_DEFAULT_PRIORITY,
	SLOW_DATA_TIMEOUT_MS,
	VESSELS_SELF_CONTEXT,
} from "../constants.js";
import type {
	ConversionCallback,
	ConversionModule,
	N2KMessage,
	SignalKApp,
	SignalKPlugin,
	SubConversionModule,
} from "../types/index.js";
import { ExponentialSmoother } from "../utils/smoothing.js";
import { toValidNumber } from "../utils/validation.js";

const BATTERY_TIME_REMAINING_ALPHA = 0.3;
const DISCHARGE_THRESHOLD_A = 0.5;
// PGN 127506 timeRemaining clamp: 30 days. Anything beyond saturates the
// field so we cap rather than wrap.
const MAX_TIME_REMAINING_S = 30 * 24 * 3600;
const PERCENT_SCALE = 100;

interface BatteryConfig {
	signalkId: string | number;
	instanceId: number;
}

interface BatteryOptions {
	batteries: BatteryConfig[];
	enabled?: boolean;
	resend?: number;
}

export default function createBatteryConversion(
	_app: SignalKApp,
	_plugin: SignalKPlugin,
): ConversionModule {
	const timeRemainingSmoother = new ExponentialSmoother(
		BATTERY_TIME_REMAINING_ALPHA,
	);

	const batteryKeys = [
		"voltage",
		"current",
		"temperature",
		"capacity.stateOfCharge",
		"capacity.timeRemaining",
		"capacity.remaining",
		"capacity.actual",
		"capacity.stateOfHealth",
		"voltage.ripple",
	];

	return {
		title: "Battery (PGNs 127506, 127508)",
		optionKey: "BATTERY",
		category: "electrical",
		presets: ["engine-set"],
		context: VESSELS_SELF_CONTEXT,

		testOptions: {
			batteries: [
				{
					signalkId: 0,
					instanceId: 1,
				},
			],
		},

		conversions: (options: unknown): SubConversionModule[] | null => {
			const batteryOptions = options as BatteryOptions;
			if (!batteryOptions?.batteries) {
				return null;
			}

			const sharedTimeouts = batteryKeys.map(() => SLOW_DATA_TIMEOUT_MS);

			return batteryOptions.batteries.map((battery): SubConversionModule => {
				const smoothingKey = `${battery.signalkId}_${battery.instanceId}`;
				return {
					keys: batteryKeys.map(
						(key) => `electrical.batteries.${battery.signalkId}.${key}`,
					),
					timeouts: sharedTimeouts,
					callback: ((
						voltage: number | null,
						current: number | null,
						temperature: number | null,
						stateOfCharge: number | null,
						timeRemaining: number | null,
						capacityRemaining: number | null,
						capacityActual: number | null,
						stateOfHealth: number | null,
						ripple: number | null,
					) => {
						const validVoltage = toValidNumber(voltage);
						const validCurrent = toValidNumber(current);
						const validTemperature = toValidNumber(temperature);
						const validRipple = toValidNumber(ripple);
						const validStateOfCharge = toValidNumber(stateOfCharge);
						const validTimeRemaining = toValidNumber(timeRemaining);
						const validStateOfHealth = toValidNumber(stateOfHealth);
						const validCapacityRemaining = toValidNumber(capacityRemaining);
						const validCapacityActual = toValidNumber(capacityActual);

						const res: N2KMessage[] = [];

						if (
							validVoltage !== null ||
							validCurrent !== null ||
							validTemperature !== null
						) {
							res.push({
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 127508,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: battery.instanceId,
									voltage: validVoltage ?? undefined,
									current: validCurrent ?? undefined,
									temperature: validTemperature ?? undefined,
								},
							});
						}

						// timeRemaining = remaining[C] / |discharge current[A]|.
						// SK spec calls capacity.remaining Joule, but real-world
						// producers (Victron, BMS bridges) publish Coulombs; honoring
						// observed convention. See CHANGELOG v1.3.1.
						let computedTR: number | null = null;
						if (validTimeRemaining === null) {
							const remainingC =
								validCapacityRemaining !== null
									? validCapacityRemaining
									: validCapacityActual !== null && validStateOfCharge !== null
										? validCapacityActual * validStateOfCharge
										: null;

							let dischargeCurrentA: number | null = null;
							if (validCurrent !== null) {
								if (validCurrent > DISCHARGE_THRESHOLD_A) {
									dischargeCurrentA = validCurrent;
								} else if (validCurrent < -DISCHARGE_THRESHOLD_A) {
									dischargeCurrentA = -validCurrent;
								}
							}

							if (
								remainingC !== null &&
								dischargeCurrentA !== null &&
								dischargeCurrentA > 0
							) {
								let seconds = Math.round(remainingC / dischargeCurrentA);
								if (seconds < 0) seconds = 0;
								if (seconds > MAX_TIME_REMAINING_S) {
									seconds = MAX_TIME_REMAINING_S;
								}
								computedTR = Math.round(
									timeRemainingSmoother.smooth(smoothingKey, seconds),
								);
							}
						}

						const resolvedTimeRemaining = validTimeRemaining ?? computedTR;

						if (
							validStateOfCharge !== null ||
							resolvedTimeRemaining !== null ||
							validStateOfHealth !== null ||
							validRipple !== null
						) {
							res.push({
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 127506,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: battery.instanceId,
									dcType: "Battery",
									stateOfCharge:
										validStateOfCharge !== null
											? validStateOfCharge * PERCENT_SCALE
											: undefined,
									stateOfHealth:
										validStateOfHealth !== null
											? validStateOfHealth * PERCENT_SCALE
											: undefined,
									timeRemaining: resolvedTimeRemaining ?? undefined,
									rippleVoltage: validRipple ?? undefined,
								},
							});
						}

						return res;
					}) as ConversionCallback,

					tests: [
						// Explicit timeRemaining provided
						{
							input: [12.5, 23.1, 290.15, 0.93, 12340, 378000, null, 0.6, 12.0],
							expected: [
								{
									prio: 2,
									pgn: 127508,
									dst: 255,
									fields: {
										instance: 1,
										voltage: 12.5,
										current: 23.1,
										temperature: 290.15,
									},
								},
								{
									prio: 2,
									pgn: 127506,
									dst: 255,
									fields: {
										instance: 1,
										dcType: "Battery",
										stateOfCharge: 93,
										stateOfHealth: 60,
										timeRemaining: "03:26:00",
										rippleVoltage: 12,
									},
								},
							],
						},
						// Derived timeRemaining from remaining C and positive discharge current
						{
							input: [13.63, 20, 293.5, 1.0, null, 378000, null, null, null],
							expected: [
								{
									prio: 2,
									pgn: 127508,
									dst: 255,
									fields: {
										instance: 1,
										voltage: 13.63,
										current: 20,
										temperature: 293.5,
									},
								},
								{
									prio: 2,
									pgn: 127506,
									dst: 255,
									fields: {
										instance: 1,
										dcType: "Battery",
										stateOfCharge: 100,
										timeRemaining: "05:15:00",
									},
								},
							],
						},
						// Derived timeRemaining with negative-discharge convention (current = -20 A)
						{
							input: [13.63, -20, 293.5, 1.0, null, 378000, null, null, null],
							expected: [
								{
									prio: 2,
									pgn: 127508,
									dst: 255,
									fields: {
										instance: 1,
										voltage: 13.63,
										current: -20,
										temperature: 293.5,
									},
								},
								{
									prio: 2,
									pgn: 127506,
									dst: 255,
									fields: {
										instance: 1,
										dcType: "Battery",
										stateOfCharge: 100,
										timeRemaining: "05:15:00",
									},
								},
							],
						},
						// Low current (below threshold): omit timeRemaining field (no meaningful value)
						{
							input: [13.26, 0, 292.9, 0.99, null, 376056, 378000, null, null],
							expected: [
								{
									prio: 2,
									pgn: 127508,
									dst: 255,
									fields: {
										instance: 1,
										voltage: 13.26,
										current: 0,
										temperature: 292.9,
									},
								},
								{
									prio: 2,
									pgn: 127506,
									dst: 255,
									fields: {
										instance: 1,
										dcType: "Battery",
										stateOfCharge: 99,
										// timeRemaining omitted when null - canboatjs won't include it in parsed output
									},
								},
							],
						},
					],
				};
			});
		},
	};
}
