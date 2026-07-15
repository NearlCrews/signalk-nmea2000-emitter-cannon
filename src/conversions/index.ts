import type {
	ConversionModule,
	ConversionModuleFactory,
	SignalKApp,
	SignalKPlugin,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isDefined } from "../utils/pathUtils.js";
import { extractPgnsFromTitle } from "../utils/pgnUtils.js";

import createAisConversion from "./ais.js";
import createAisExtendedConversion from "./aisExtended.js";
import createAttitudeConversion from "./attitude.js";
import createBatteryConversion from "./battery.js";
import createBearingDistanceBetweenMarksConversion from "./bearingDistanceBetweenMarks.js";
import createCogSogConversion from "./cogSOG.js";
import createDepthConversion from "./depth.js";
import createDirectionDataConversion from "./directionData.js";
import createDscCallsConversion from "./dscCalls.js";
import createEngineParametersConversion from "./engineParameters.js";
import createEngineStaticConversion from "./engineStatic.js";
import createEngineTripConversion from "./engineTrip.js";
import createEnvironmentParametersConversion from "./environmentParameters.js";
import createGnssDataConversion from "./gnssData.js";
import createGpsConversion from "./gps.js";
import createHeadingConversion from "./heading.js";
import createHeaveConversion from "./heave.js";
import createHumidityConversion from "./humidity.js";
import createLeewayConversion from "./leeway.js";
import createMagneticVarianceConversion from "./magneticVariance.js";
import createNavigationDataConversion from "./navigationData.js";
import createNotificationsConversion from "./notifications.js";
import createPgnListConversion from "./pgnList.js";
import createPressureConversion from "./pressure.js";
import createRadioFrequencyConversion from "./radioFrequency.js";
import createRateOfTurnConversion from "./rateOfTurn.js";
import createRaymarineAlarmsConversion from "./raymarineAlarms.js";
import createRaymarineBrightnessConversion from "./raymarineBrightness.js";
import createRouteWaypointConversion from "./routeWaypoint.js";
import createRouteWpListConversion from "./routeWpList.js";
import createRudderConversion from "./rudder.js";
import createSeaTempConversion from "./seaTemp.js";
import createSetDriftConversion from "./setdrift.js";
import createSmallCraftStatusConversion from "./smallCraftStatus.js";
import createSolarConversion from "./solar.js";
import createSpeedConversion from "./speed.js";
import createSystemTimeConversion from "./systemTime.js";
import createTanksConversion from "./tanks.js";
import createTemperatureConversion from "./temperature.js";
import createTimeToMarkConversion from "./timeToMark.js";
import createTransmissionParametersConversion from "./transmissionParameters.js";
import createTrueHeadingConversion from "./trueheading.js";
import createWindConversion from "./wind.js";
import createWindTrueGroundConversion from "./windTrueGround.js";
import createWindTrueWaterConversion from "./windTrueWater.js";
import createWindWeatherApparentConversion from "./windWeatherApparent.js";
import createWindWeatherTrueConversion from "./windWeatherTrue.js";

/**
 * Run a conversion factory and normalize its return value to a flat array.
 * Errors are caught and reported so a single bad factory cannot prevent
 * other conversions from loading.
 */
function buildConversions(
	factory: ConversionModuleFactory,
	app: SignalKApp,
	plugin: SignalKPlugin,
): ConversionModule<unknown[]>[] {
	try {
		const moduleOrModules = factory(app, plugin);
		const arr = Array.isArray(moduleOrModules) ? moduleOrModules : [moduleOrModules];
		return arr.filter(isDefined);
	} catch (e) {
		app.error(`Error loading conversion module: ${errMessage(e)}`);
		return [];
	}
}

export function createConversionModules(
	app: SignalKApp,
	plugin: SignalKPlugin,
): ConversionModule<unknown[]>[] {
	// Every conversion factory EXCEPT pgnList: pgnList needs the title-derived
	// PGN list from these modules to build its 126464 transmit advertisement,
	// so it must be constructed after the data conversions are loaded.
	const dataConversionFactories: ConversionModuleFactory[] = [
		createAisConversion,
		createAisExtendedConversion,
		createAttitudeConversion,
		createBatteryConversion,
		createBearingDistanceBetweenMarksConversion,
		createCogSogConversion,
		createDepthConversion,
		createDirectionDataConversion,
		createDscCallsConversion,
		createEngineParametersConversion,
		createEngineStaticConversion,
		createEngineTripConversion,
		createEnvironmentParametersConversion,
		createGnssDataConversion,
		createGpsConversion,
		createHeadingConversion,
		createHeaveConversion,
		createHumidityConversion,
		createLeewayConversion,
		createMagneticVarianceConversion,
		createNavigationDataConversion,
		createNotificationsConversion,
		createPressureConversion,
		createRadioFrequencyConversion,
		createRateOfTurnConversion,
		createRaymarineAlarmsConversion,
		createRaymarineBrightnessConversion,
		createRouteWaypointConversion,
		createRouteWpListConversion,
		createRudderConversion,
		createSeaTempConversion,
		createSetDriftConversion,
		createSmallCraftStatusConversion,
		createSolarConversion,
		createSpeedConversion,
		createSystemTimeConversion,
		createTanksConversion,
		createTemperatureConversion,
		createTimeToMarkConversion,
		createTransmissionParametersConversion,
		createTrueHeadingConversion,
		createWindConversion,
		createWindTrueGroundConversion,
		createWindTrueWaterConversion,
		createWindWeatherApparentConversion,
		createWindWeatherTrueConversion,
	];

	const dataConversions = dataConversionFactories.flatMap((factory) =>
		buildConversions(factory, app, plugin),
	);

	// Derive the transmit-PGN advertisement from the actual conversion titles
	// so adding a new conversion auto-updates the 126464 message. ISO transport
	// PGNs and canboatjs-auto-emit PGNs are unioned in by pgnList itself.
	// pgnList's own title contributes PGN 126464 (self-advertisement is
	// correct: the device transmits 126464 in response to ISO Requests and
	// on its own timer).
	const dataTransmitPgns: number[] = [];
	for (const conv of dataConversions) {
		for (const pgnStr of extractPgnsFromTitle(conv.title)) {
			const pgn = Number(pgnStr);
			if (Number.isFinite(pgn)) dataTransmitPgns.push(pgn);
		}
	}

	const pgnList = createPgnListConversion(dataTransmitPgns);

	return [...dataConversions, pgnList];
}
