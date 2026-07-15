import type { ConversionModule, SignalKApp } from "../types/index.js";
import { createWind130306Conversion } from "./windData.js";

export default function createWindConversion(app: SignalKApp): ConversionModule {
	return createWind130306Conversion(app, {
		title: "Wind (PGN 130306)",
		optionKey: "WIND",
		keys: ["environment.wind.angleApparent", "environment.wind.speedApparent"],
		reference: "Apparent",
		presets: ["basic-nav"],
	});
}
