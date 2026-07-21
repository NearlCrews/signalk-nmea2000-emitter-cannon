import { describe, expect, it } from "vitest";
import createEnvironmentParametersConversion from "../conversions/environmentParameters.js";
import type { N2KMessage, SignalKApp } from "../types/index.js";

type SubFactory = (options: Record<string, unknown>) => Array<{
	callback?: (...values: unknown[]) => N2KMessage[];
}> | null;

function emit(options: Record<string, unknown>, input: unknown[]): N2KMessage[] {
	const conversion = createEnvironmentParametersConversion(null as unknown as SignalKApp);
	const sub = (conversion.conversions as SubFactory)(options)?.[0];
	return sub?.callback?.(...input) ?? [];
}

describe("Environmental Parameters", () => {
	it("uses the configured temperature and humidity sources", () => {
		const [message] = emit(
			{ temperatureSource: "Dew Point Temperature", humiditySource: "Inside" },
			[285.15, 0.48, null, 100800],
		);
		expect(message?.fields).toMatchObject({
			temperatureSource: "Dew Point Temperature",
			humiditySource: "Inside",
			temperature: 285.15,
			humidity: 48,
			atmosphericPressure: 100800,
		});
	});

	it("prefers relativeHumidity and falls back to the legacy humidity path", () => {
		expect(emit({}, [null, 0.4, 0.8, null])[0]?.fields.humidity).toBe(40);
		expect(emit({}, [null, null, 0.8, null])[0]?.fields.humidity).toBe(80);
	});

	it("falls back to valid source enums and rejects invalid measurements", () => {
		const [message] = emit({ temperatureSource: "not-an-enum", humiditySource: "not-an-enum" }, [
			295.15,
			0.5,
			null,
			null,
		]);
		expect(message?.fields).toMatchObject({
			temperatureSource: "Outside Temperature",
			humiditySource: "Outside",
		});
		expect(emit({}, [-1, 1.01, -0.1, -1])).toEqual([]);
	});
});
