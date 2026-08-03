import { FromPgn, pgnToActisenseSerialFormat, toPgn } from "@canboat/canboatjs";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_DATA_TIMEOUT_MS,
	MAX_N2K_DOP,
	MAX_WIND_SPEED_MPS,
	WEATHER_DATA_TIMEOUT_MS,
} from "../constants.js";
import createGnssDataConversions from "../conversions/gnssData.js";
import { createConversionModules } from "../conversions/index.js";
import createPgnListConversion from "../conversions/pgnList.js";
import { createWind130306Conversion } from "../conversions/windData.js";
import createWindTrueGroundConversion from "../conversions/windTrueGround.js";
import createWindWeatherApparentConversion from "../conversions/windWeatherApparent.js";
import createWindWeatherTrueConversion from "../conversions/windWeatherTrue.js";
import type { ConversionModule, N2KMessage, SignalKApp, SignalKPlugin } from "../types/index.js";
import { cleanN2KMessage } from "../utils/messageUtils.js";
import { withCanonicalPgnPriority } from "../utils/pgnPriorities.js";

function conversionByKey(
	conversions: ConversionModule<unknown[]>[],
	key: string,
): ConversionModule {
	const conversion = conversions.find((candidate) => candidate.optionKey === key);
	if (!conversion?.callback) throw new Error(`Missing conversion callback for ${key}`);
	return conversion;
}

async function invoke(conversion: ConversionModule, ...values: unknown[]): Promise<N2KMessage[]> {
	if (!conversion.callback)
		throw new Error(`Missing conversion callback for ${conversion.optionKey}`);
	return Promise.resolve(conversion.callback(...values));
}

function roundTrip(message: N2KMessage): { payload: Buffer; decoded: N2KMessage } {
	const wireMessage = withCanonicalPgnPriority(message);
	const payload = toPgn(wireMessage as unknown as Parameters<typeof toPgn>[0]);
	if (!payload) throw new Error(`Canboat did not encode PGN ${message.pgn}`);

	const serial = pgnToActisenseSerialFormat(
		wireMessage as unknown as Parameters<typeof pgnToActisenseSerialFormat>[0],
	);
	if (!serial) throw new Error(`Canboat did not serialize PGN ${message.pgn}`);
	const parsed = new FromPgn().parseString(serial);
	if (!parsed) throw new Error(`Canboat did not decode PGN ${message.pgn}`);

	return {
		payload,
		decoded: cleanN2KMessage(parsed as unknown as Record<string, unknown>),
	};
}

function fullConversionRegistry(): ConversionModule[] {
	const app = {
		selfId: "urn:mrn:signalk:uuid:test-vessel",
		getSelfPath: () => undefined,
		getPath: () => undefined,
		getCourse: async () => ({ activeRoute: null, nextPoint: null, previousPoint: null }),
		debug: () => {},
		error: (message: string) => {
			throw new Error(message);
		},
		emit: () => {},
		streambundle: {
			getSelfBus: () => {
				const stream = {
					value: null,
					map: () => stream,
					filter: () => stream,
					onValue: () => () => {},
				};
				return stream;
			},
		},
		subscriptionmanager: { subscribe: () => {} },
	} as unknown as SignalKApp;
	const plugin = { id: "signalk-nmea2000-emitter-cannon" } as SignalKPlugin;
	return createConversionModules(app, plugin);
}

describe("marine conversion wire contracts", () => {
	it("rejects invalid DOP values and derives VDOP only from a valid pair", async () => {
		const dops = conversionByKey(createGnssDataConversions({} as SignalKApp), "GNSS_DOPS");

		expect(await invoke(dops, -0.01, 2)).toEqual([]);
		expect(await invoke(dops, MAX_N2K_DOP + 0.01, MAX_N2K_DOP)).toEqual([]);
		expect((await invoke(dops, 2, 1))[0]?.fields).toEqual({
			sid: 0,
			hdop: 2,
		});
		expect((await invoke(dops, 3, 5))[0]?.fields.vdop).toBe(4);
	});

	it("omits unknown satellite fields, skips invalid PRNs, and caps the list at eighteen", async () => {
		const satellites = conversionByKey(
			createGnssDataConversions({} as SignalKApp),
			"GNSS_SATELLITES",
		);
		const validSatellites: Array<{ id: number; used?: boolean }> = Array.from(
			{ length: 20 },
			(_, index) => ({ id: index + 1 }),
		);
		validSatellites[0] = { id: 1, used: true };
		const result = await invoke(satellites, {
			count: 19,
			satellites: [{}, { id: -1 }, { id: 253 }, ...validSatellites],
		});
		const fields = result[0]?.fields as Record<string, unknown>;
		const list = fields.list as Array<Record<string, unknown>>;

		expect(fields.satsInView).toBe(18);
		expect(fields).not.toHaveProperty("rangeResidualMode");
		expect(list).toHaveLength(18);
		expect(list[0]).toEqual({ prn: 1, status: "Used" });
		expect(list.at(-1)).toEqual({ prn: 18 });
		expect(list.every((satellite) => !Object.hasOwn(satellite, "rangeResiduals"))).toBe(true);

		const message = result[0];
		if (!message) throw new Error("Missing satellite message");
		const { payload, decoded } = roundTrip(message);
		// PGN 129540 has a three-byte header and a twelve-byte repeating group.
		expect(payload).toHaveLength(3 + 18 * 12);
		expect(payload.length).toBeLessThanOrEqual(223);
		expect(decoded.fields).toEqual(message.fields);
	});

	it("keeps wind speed inside the unsigned PGN 130306 wire range", async () => {
		const wind = createWind130306Conversion({} as SignalKApp, {
			title: "Test Wind (PGN 130306)",
			optionKey: "TEST_WIND",
			keys: ["environment.wind.angleApparent", "environment.wind.speedApparent"],
			reference: "Apparent",
		});

		expect(await invoke(wind, null, -0.01)).toEqual([]);
		const angleOnly = (await invoke(wind, 1.2, -0.01))[0]?.fields;
		expect(angleOnly).toMatchObject({
			sid: 87,
			reference: "Apparent",
		});
		expect(angleOnly?.windAngle).toBeCloseTo(1.2);
		expect((await invoke(wind, null, MAX_WIND_SPEED_MPS))[0]?.fields.windSpeed).toBe(
			MAX_WIND_SPEED_MPS,
		);
		expect(await invoke(wind, null, MAX_WIND_SPEED_MPS + 0.01)).toEqual([]);
	});

	it("uses extended freshness only for forecast wind inputs", () => {
		const apparent = createWindWeatherApparentConversion({} as SignalKApp);
		const ground = createWindTrueGroundConversion({} as SignalKApp);
		const trueCompatibility = createWindWeatherTrueConversion({} as SignalKApp);
		const live = createWind130306Conversion({} as SignalKApp, {
			title: "Test Wind (PGN 130306)",
			optionKey: "TEST_WIND",
			keys: ["environment.wind.angleApparent", "environment.wind.speedApparent"],
			reference: "Apparent",
		});

		expect(apparent.timeouts).toEqual([WEATHER_DATA_TIMEOUT_MS, WEATHER_DATA_TIMEOUT_MS]);
		expect(ground.timeouts).toEqual([WEATHER_DATA_TIMEOUT_MS, WEATHER_DATA_TIMEOUT_MS]);
		expect(trueCompatibility.timeouts).toEqual([
			WEATHER_DATA_TIMEOUT_MS,
			DEFAULT_DATA_TIMEOUT_MS,
			WEATHER_DATA_TIMEOUT_MS,
		]);
		expect(live.timeouts).toEqual([DEFAULT_DATA_TIMEOUT_MS, DEFAULT_DATA_TIMEOUT_MS]);
	});

	it("advertises only plugin-owned transmit PGNs", async () => {
		const pgnList = createPgnListConversion([130306, 130306]);
		const messages = await invoke(pgnList, null);
		const transmitMessage = messages[0];
		if (!transmitMessage) throw new Error("Missing PGN list message");
		const transmit = (transmitMessage.fields.list as Array<{ pgn: number }>).map(({ pgn }) => pgn);

		expect(pgnList.immediate).toBe(true);
		expect(messages).toHaveLength(1);
		expect(transmit).toEqual([126464, 130306]);
		expect(transmit).toEqual([...transmit].sort((a, b) => a - b));
		expect(new Set(transmit).size).toBe(transmit.length);
	});

	it("round-trips the complete registry PGN list within one fast packet", async () => {
		const pgnList = fullConversionRegistry().find(
			(conversion) => conversion.optionKey === "PGN_LIST",
		);
		if (!pgnList) throw new Error("Full conversion registry omitted PGN_LIST");
		const messages = await invoke(pgnList, null);
		expect(messages).toHaveLength(1);

		for (const message of messages) {
			const list = message.fields.list as Array<{ pgn: number }>;
			const { payload, decoded } = roundTrip(message);
			// PGN 126464 has a one-byte function code and three bytes per listed PGN.
			expect(payload).toHaveLength(1 + list.length * 3);
			expect(payload.length).toBeLessThanOrEqual(223);
			expect(decoded.fields).toEqual(message.fields);
		}
	});
});
