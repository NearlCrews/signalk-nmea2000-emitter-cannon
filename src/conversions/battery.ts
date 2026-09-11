import {
	MAX_N2K_CURRENT_A,
	MAX_N2K_VOLTAGE_V,
	MAX_TEMPERATURE_K,
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
import { isPlainObject, toFiniteInRange, toValidNumber } from "../utils/validation.js";
import {
	instanceList,
	isValidInstanceSignalKId,
	normalizedN2kInstance,
} from "./instanceOptions.js";

const BATTERY_TIME_REMAINING_ALPHA = 0.3;
const DISCHARGE_THRESHOLD_A = 0.5;
// PGN 127506 timeRemaining clamp: 30 days. Anything beyond saturates the
// field so we cap rather than wrap.
const MAX_TIME_REMAINING_S = 30 * 24 * 3600;
const PERCENT_SCALE = 100;
// PGN 127506 remainingCapacity is an unsigned 16-bit field at 1 Ah, and
// canboatjs converts the Coulombs Signal K publishes into it, so the ceiling
// is 65532 Ah expressed in Coulombs. It wraps rather than refusing: 300 MC
// reaches the receiver as 64069200 C.
const MAX_REMAINING_CHARGE_C = 65_532 * 3600;

interface BatteryConfig {
	signalkId: string | number;
	instanceId: number;
}

function normalizedBatteryConfig(config: unknown): BatteryConfig | null {
	if (!isPlainObject(config) || !isValidInstanceSignalKId(config.signalkId)) return null;
	const instanceId = normalizedN2kInstance(config.instanceId);
	return instanceId === undefined ? null : { signalkId: config.signalkId, instanceId };
}

export default function createBatteryConversion(
	_app: SignalKApp,
	_plugin: SignalKPlugin,
): ConversionModule {
	const timeRemainingSmoother = new ExponentialSmoother(BATTERY_TIME_REMAINING_ALPHA);

	const batteryKeys = [
		"voltage",
		"current",
		"temperature",
		"capacity.stateOfCharge",
		"capacity.timeRemaining",
		"capacity.remaining",
		"capacity.actual",
		"capacity.stateOfHealth",
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
			const batteries = instanceList<unknown>(options, "batteries")
				.map(normalizedBatteryConfig)
				.filter((battery): battery is BatteryConfig => battery !== null);
			if (batteries.length === 0) return null;

			const sharedTimeouts = batteryKeys.map(() => SLOW_DATA_TIMEOUT_MS);

			return batteries.map((battery): SubConversionModule => {
				const smoothingKey = `${battery.signalkId}_${battery.instanceId}`;
				return {
					keys: batteryKeys.map((key) => `electrical.batteries.${battery.signalkId}.${key}`),
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
					) => {
						// PGN 127508 voltage is signed 16-bit at 0.01 V, current is signed
						// 16-bit at 0.1 A, and temperature is unsigned 16-bit at 0.01 K.
						// All three wrap: a battery temperature published in Celsius
						// rather than the Kelvin the Signal K spec calls for reaches the
						// receiver as 650.36 K on a -5 C morning, which is 377 C.
						const validVoltage =
							toFiniteInRange(voltage, -MAX_N2K_VOLTAGE_V, MAX_N2K_VOLTAGE_V) ?? null;
						// Do not relax this bound to let a large current through. It is
						// not only the ammeter reading: validCurrent is the divisor for
						// the derived timeRemaining below, so an out-of-range value
						// corrupts a second field that no longer looks out of range. A
						// shunt publishing milliamps sends 23.1 A as 23100, which reached
						// the receiver as -3114.4 A and drove timeRemaining to 16 s,
						// rendered by the 60 s resolution field as 00:00:00: a fully
						// charged battery reporting no time left, which is a false alarm
						// a skipper would act on. Rejecting the current here also keeps
						// it out of that divisor, so no time is derived at all.
						const validCurrent =
							toFiniteInRange(current, -MAX_N2K_CURRENT_A, MAX_N2K_CURRENT_A) ?? null;
						const validTemperature = toFiniteInRange(temperature, 0, MAX_TEMPERATURE_K) ?? null;
						// stateOfCharge and stateOfHealth are Signal K ratios feeding
						// unsigned 8-bit 1 % fields. A provider publishing percent
						// instead of the spec ratio scales to 9300, wraps, and shows a
						// 93 percent battery as 84 percent, so anything outside the
						// ratio range is rejected (matches tanks.ts and
						// raymarineBrightness.ts).
						const validStateOfCharge = toFiniteInRange(stateOfCharge, 0, 1) ?? null;
						const validTimeRemaining = toValidNumber(timeRemaining);
						const validStateOfHealth = toFiniteInRange(stateOfHealth, 0, 1) ?? null;
						const validCapacityRemaining = toValidNumber(capacityRemaining);
						const validCapacityActual = toValidNumber(capacityActual);

						const res: N2KMessage[] = [];

						if (validVoltage !== null || validCurrent !== null || validTemperature !== null) {
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
						// Hoisted out of the timeRemaining branch below: this is the
						// remaining charge, so it fills the remainingCapacity field too
						// rather than being computed for one use and thrown away. The
						// derived branch is worth emitting because the plugin already
						// broadcasts timeRemaining computed from it, and withholding the
						// charge while publishing the time derived from that same charge
						// would be the odder choice.
						const remainingC =
							validCapacityRemaining !== null
								? validCapacityRemaining
								: validCapacityActual !== null && validStateOfCharge !== null
									? validCapacityActual * validStateOfCharge
									: null;

						let computedTR: number | null = null;
						if (validTimeRemaining === null) {
							let dischargeCurrentA: number | null = null;
							if (validCurrent !== null) {
								if (validCurrent > DISCHARGE_THRESHOLD_A) {
									dischargeCurrentA = validCurrent;
								} else if (validCurrent < -DISCHARGE_THRESHOLD_A) {
									dischargeCurrentA = -validCurrent;
								}
							}

							// dischargeCurrentA is null or, when set, always
							// > DISCHARGE_THRESHOLD_A (0.5), so a non-null value is
							// already safe as a divisor; no separate > 0 check needed.
							if (remainingC !== null && dischargeCurrentA !== null) {
								let seconds = Math.round(remainingC / dischargeCurrentA);
								if (seconds < 0) seconds = 0;
								if (seconds > MAX_TIME_REMAINING_S) {
									seconds = MAX_TIME_REMAINING_S;
								}
								computedTR = Math.round(timeRemainingSmoother.smooth(smoothingKey, seconds));
							}
						}

						// The clamp above guards only the derived branch. A Signal K
						// supplied capacity.timeRemaining reaches the wire field the same
						// way and needs the same bound: PGN 127506 timeRemaining is
						// unsigned 16-bit at 60 s resolution, so an out-of-range value
						// wraps into a plausible one (-100 s decodes as 1092 hours).
						const resolvedTimeRemaining =
							toFiniteInRange(validTimeRemaining, 0, MAX_TIME_REMAINING_S) ?? computedTR;

						if (
							validStateOfCharge !== null ||
							resolvedTimeRemaining !== null ||
							validStateOfHealth !== null
						) {
							// rippleVoltage stays out of the wire payload: there is no
							// canonical Signal K source for ripple voltage, so canboatjs
							// encodes the omission as the spec's "data not available".
							res.push({
								prio: N2K_DEFAULT_PRIORITY,
								pgn: 127506,
								dst: N2K_BROADCAST_DST,
								fields: {
									instance: battery.instanceId,
									dcType: "Battery",
									stateOfCharge:
										validStateOfCharge !== null ? validStateOfCharge * PERCENT_SCALE : undefined,
									stateOfHealth:
										validStateOfHealth !== null ? validStateOfHealth * PERCENT_SCALE : undefined,
									timeRemaining: resolvedTimeRemaining ?? undefined,
									// SK capacity.remaining is Coulombs (As); canboatjs
									// converts it to the PGN 127506 Ah wire field, so the
									// Coulomb value is passed through directly.
									remainingCapacity:
										toFiniteInRange(remainingC, 0, MAX_REMAINING_CHARGE_C) ?? undefined,
								},
							});
						}

						return res;
					}) as ConversionCallback,

					tests: [
						// Explicit timeRemaining provided
						{
							input: [12.5, 23.1, 290.15, 0.93, 12340, 378000, null, 0.6],
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
										remainingCapacity: 378000,
									},
								},
							],
						},
						// Derived timeRemaining from remaining C and positive discharge current
						{
							input: [13.63, 20, 293.5, 1.0, null, 378000, null, null],
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
										remainingCapacity: 378000,
									},
								},
							],
						},
						// Derived timeRemaining with negative-discharge convention (current = -20 A)
						{
							input: [13.63, -20, 293.5, 1.0, null, 378000, null, null],
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
										remainingCapacity: 378000,
									},
								},
							],
						},
						// Low current (below threshold): omit timeRemaining field (no meaningful value)
						{
							input: [13.26, 0, 292.9, 0.99, null, 376056, 378000, null],
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
										remainingCapacity: 374400,
										// timeRemaining omitted when null - canboatjs won't include it in parsed output
									},
								},
							],
						},
						// capacity.remaining absent, capacity.actual and stateOfCharge
						// present. The plugin derives the remaining charge for the
						// timeRemaining calculation, so it emits it as the Ah field too
						// rather than reporting not-available. The current is below the
						// discharge threshold, which leaves timeRemaining out and lets
						// this case isolate the Ah field. 378000 C at 60 percent is
						// 226800 C, or exactly 63 Ah.
						{
							input: [13.26, 0, 292.9, 0.6, null, null, 378000, null],
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
										stateOfCharge: 60,
										remainingCapacity: 226800,
									},
								},
							],
						},
						// Regression on the provider-units hazards. A battery
						// temperature published in Celsius reached the receiver as
						// 650.36 K, and a state of charge and health published as
						// percent scaled to 9300 and 6000, wrapping to 84 and 112
						// percent. All three now encode as not-available, so only the
						// voltage and current survive and PGN 127506 is dropped
						// entirely.
						{
							input: [12.5, 23.1, -5, 93, null, null, null, 60],
							expected: [
								{
									prio: 2,
									pgn: 127508,
									dst: 255,
									fields: {
										instance: 1,
										voltage: 12.5,
										current: 23.1,
									},
								},
							],
						},
						// Regression: a shunt publishing milliamps sends 23.1 A as 23100,
						// which reached the receiver as -3114.4 A, a large charge current
						// shown as a large discharge. It also poisoned the derived
						// timeRemaining, which divides by this value: a full battery
						// reported 00:00:00 left. The current is now omitted, which keeps
						// it out of that divisor too, so only the voltage survives on
						// PGN 127508 and no time is derived.
						{
							input: [12.5, 23100, null, 0.93, null, 378000, null, null],
							expected: [
								{
									prio: 2,
									pgn: 127508,
									dst: 255,
									fields: {
										instance: 1,
										voltage: 12.5,
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
										remainingCapacity: 378000,
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
