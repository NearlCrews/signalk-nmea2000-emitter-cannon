import { WEATHER_DATA_TIMEOUT_MS } from "../constants.js";
import type { ConversionModule, SignalKApp } from "../types/index.js";
import { createWind130306Conversion } from "./windData.js";

export default function createWindTrueGroundConversion(app: SignalKApp): ConversionModule {
	return createWind130306Conversion(app, {
		title: "Wind True Over Ground (PGN 130306)",
		optionKey: "WIND_TRUE_GROUND",
		keys: ["environment.wind.directionTrue", "environment.wind.speedOverGround"],
		reference: "True (ground referenced to North)",
		inputTimeoutMs: WEATHER_DATA_TIMEOUT_MS,
	});
}
