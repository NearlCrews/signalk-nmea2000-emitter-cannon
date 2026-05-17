import type { ConversionModule, SignalKApp } from "../types/index.js";
import { createWind130306Conversion } from "./windTrueWater.js";

export default function createWindTrueGroundConversion(
	app: SignalKApp,
): ConversionModule {
	return createWind130306Conversion(app, {
		title: "Wind True Over Ground (PGN 130306)",
		optionKey: "WIND_TRUE_GROUND",
		keys: [
			"environment.wind.directionTrue",
			"environment.wind.speedOverGround",
		],
		reference: "True (ground referenced to North)",
	});
}
