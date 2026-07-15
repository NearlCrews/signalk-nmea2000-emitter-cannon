import type { ConversionModule, SignalKApp } from "../types/index.js";
import { createWind130306Conversion } from "./windData.js";

export default function createWindTrueWaterConversion(app: SignalKApp): ConversionModule {
	return createWind130306Conversion(app, {
		title: "Wind True Over Water (PGN 130306)",
		optionKey: "WIND_TRUE",
		keys: ["environment.wind.angleTrueWater", "environment.wind.speedTrue"],
		reference: "True (boat referenced)",
	});
}
