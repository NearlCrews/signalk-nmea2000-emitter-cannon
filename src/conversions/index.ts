import type {
	ConversionModule,
	ConversionModuleFactory,
	SignalKApp,
	SignalKPlugin,
} from "../types/index.js";
import { errMessage } from "../utils/errorUtils.js";
import { isDefined } from "../utils/pathUtils.js";

// Import all conversion modules dynamically
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
import createProductInfoConversion from "./productInfo.js";
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

export function createConversionModules(
	app: SignalKApp,
	plugin: SignalKPlugin,
): ConversionModule<unknown[]>[] {
	const conversionFactories: ConversionModuleFactory[] = [
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
		createPgnListConversion,
		createPressureConversion,
		createProductInfoConversion,
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
	];

	return conversionFactories
		.flatMap((factory) => {
			try {
				const moduleOrModules = factory(app, plugin);
				return Array.isArray(moduleOrModules)
					? moduleOrModules
					: [moduleOrModules];
			} catch (e) {
				app.error(`Error loading conversion module: ${errMessage(e)}`);
				return [];
			}
		})
		.filter(isDefined);
}
