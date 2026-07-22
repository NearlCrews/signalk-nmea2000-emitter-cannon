import { MAX_N2K_INSTANCE, MAX_TANK_INSTANCE } from "../constants.js";
import { pathToPropName } from "../utils/pathUtils.js";
import { isPlainObject, isValidNumber, isValidSignalKId } from "../utils/validation.js";
import { SEATALK_NETWORK_GROUPS } from "./enums.js";
import {
	HUMIDITY_DEFAULT_IDENTITIES,
	HUMIDITY_SOURCE_VALUES,
	TEMPERATURE_DEFINITIONS,
	TEMPERATURE_SOURCE_VALUES,
} from "./environmentSources.js";
import type { Config, ConversionConfig } from "./schema.js";

type ConfigIssueSeverity = "error" | "warning";

export interface ConfigIssue {
	severity: ConfigIssueSeverity;
	conversionKey: string;
	field: string;
	/** Mapping collection that owns rowIndex when a conversion renders multiple tables. */
	collection?: string;
	/** Fixed Signal K input path that owns a publisher-filter issue. */
	inputPath?: string;
	rowIndex?: number;
	message: string;
}

interface RowRule {
	collection: string;
	label: string;
	idField: "signalkId" | "signalkPath";
	idLabel: string;
	allowNumericId?: boolean;
	instanceFields?: ReadonlyArray<{ key: string; label: string; max?: number }>;
	/** Scalar wire identities that must be unique across rows in this mapping. */
	outputIdentities?: ReadonlyArray<{ key: string; label: string }>;
}

const MAPPING_RULES: Readonly<Record<string, RowRule>> = {
	AC_STATUS: {
		collection: "acSources",
		label: "AC source",
		idField: "signalkId",
		idLabel: "Signal K AC bus id",
		instanceFields: [{ key: "instanceId", label: "NMEA 2000 instance" }],
		outputIdentities: [{ key: "instanceId", label: "NMEA 2000 instance" }],
	},
	BATTERY: {
		collection: "batteries",
		label: "battery",
		idField: "signalkId",
		idLabel: "Signal K battery id",
		allowNumericId: true,
		instanceFields: [{ key: "instanceId", label: "NMEA 2000 battery instance" }],
		outputIdentities: [{ key: "instanceId", label: "NMEA 2000 battery instance" }],
	},
	CHARGER_STATUS: {
		collection: "chargers",
		label: "charger",
		idField: "signalkId",
		idLabel: "Signal K charger id",
		instanceFields: [
			{ key: "instanceId", label: "NMEA 2000 charger instance" },
			{ key: "batteryInstanceId", label: "NMEA 2000 battery instance" },
		],
		outputIdentities: [{ key: "instanceId", label: "NMEA 2000 charger instance" }],
	},
	INVERTER_STATUS: {
		collection: "inverters",
		label: "inverter",
		idField: "signalkId",
		idLabel: "Signal K inverter id",
		instanceFields: [
			{ key: "instanceId", label: "NMEA 2000 inverter instance" },
			{ key: "acInstanceId", label: "NMEA 2000 AC instance" },
			{ key: "dcInstanceId", label: "NMEA 2000 DC instance" },
		],
		outputIdentities: [{ key: "instanceId", label: "NMEA 2000 inverter instance" }],
	},
	ENGINE_PARAMETERS: {
		collection: "engines",
		label: "engine",
		idField: "signalkId",
		idLabel: "Signal K engine id",
		allowNumericId: true,
		instanceFields: [{ key: "instanceId", label: "NMEA 2000 engine instance" }],
		outputIdentities: [{ key: "instanceId", label: "NMEA 2000 engine instance" }],
	},
	ENGINE_TRIP: {
		collection: "engines",
		label: "engine",
		idField: "signalkId",
		idLabel: "Signal K engine id",
		allowNumericId: true,
		instanceFields: [{ key: "instanceId", label: "NMEA 2000 engine instance" }],
		outputIdentities: [{ key: "instanceId", label: "NMEA 2000 engine instance" }],
	},
	ENGINE_STATIC: {
		collection: "engines",
		label: "engine",
		idField: "signalkId",
		idLabel: "Signal K engine id",
		allowNumericId: true,
		instanceFields: [{ key: "instanceId", label: "NMEA 2000 engine instance" }],
		outputIdentities: [{ key: "instanceId", label: "NMEA 2000 engine instance" }],
	},
	EXHAUST_TEMPERATURE: {
		collection: "engines",
		label: "engine",
		idField: "signalkId",
		idLabel: "Signal K engine id",
		allowNumericId: true,
		instanceFields: [{ key: "tempInstanceId", label: "NMEA 2000 temperature instance" }],
		outputIdentities: [{ key: "tempInstanceId", label: "NMEA 2000 temperature instance" }],
	},
	SOLAR: {
		collection: "chargers",
		label: "solar charger",
		idField: "signalkId",
		idLabel: "Signal K solar charger id",
		allowNumericId: true,
		instanceFields: [
			{ key: "instanceId", label: "NMEA 2000 charger instance" },
			{ key: "panelInstanceId", label: "NMEA 2000 panel instance" },
		],
		// Both values are emitted as the primary Instance field of PGN 127508,
		// so they share one identity namespace even within a single row.
		outputIdentities: [
			{ key: "instanceId", label: "NMEA 2000 charger instance" },
			{ key: "panelInstanceId", label: "NMEA 2000 panel instance" },
		],
	},
	RAYMARINE_BRIGHTNESS: {
		collection: "groups",
		label: "brightness group",
		idField: "signalkId",
		idLabel: "Signal K brightness group id",
		outputIdentities: [{ key: "groupLabel", label: "NMEA 2000 brightness group" }],
	},
	TANKS: {
		collection: "tanks",
		label: "tank",
		idField: "signalkPath",
		idLabel: "Signal K tank path",
		instanceFields: [
			{ key: "instanceId", label: "NMEA 2000 tank instance", max: MAX_TANK_INSTANCE },
		],
		outputIdentities: [{ key: "instanceId", label: "NMEA 2000 tank instance" }],
	},
};

const SUPPORTED_TANK_TYPES = new Set([
	"fuel",
	"blackWater",
	"freshWater",
	"wasteWater",
	"greyWater",
	"grayWater",
	"liveWell",
	"lubrication",
	"gas",
]);
const TEMPERATURE_SOURCES = new Set<string>(TEMPERATURE_SOURCE_VALUES);
const HUMIDITY_SOURCES = new Set<string>(HUMIDITY_SOURCE_VALUES);
const BRIGHTNESS_GROUPS = new Set<string>(SEATALK_NETWORK_GROUPS);

function severityFor(config: ConversionConfig | undefined): ConfigIssueSeverity {
	return config?.enabled ? "error" : "warning";
}

function addIssue(
	issues: ConfigIssue[],
	config: ConversionConfig | undefined,
	conversionKey: string,
	field: string,
	message: string,
	rowIndex?: number,
	collection?: string,
): void {
	issues.push({
		severity: severityFor(config),
		conversionKey,
		field,
		message,
		...(collection === undefined ? {} : { collection }),
		...(rowIndex === undefined ? {} : { rowIndex }),
	});
}

function validId(value: unknown, allowNumeric: boolean): boolean {
	return allowNumeric
		? isValidSignalKId(value) ||
				(typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
		: isValidSignalKId(value);
}

function parseTankPath(value: unknown): { type: string; path: string } | null {
	if (typeof value !== "string") return null;
	const segments = value.split(".");
	const type = segments[1];
	if (segments.length !== 3 || segments[0] !== "tanks" || !type || !segments[2]) return null;
	return { type, path: value };
}

function validateInstance(
	issues: ConfigIssue[],
	config: ConversionConfig | undefined,
	conversionKey: string,
	row: Record<string, unknown>,
	rowIndex: number,
	field: { key: string; label: string; max?: number },
	collection: string,
): void {
	const max = field.max ?? MAX_N2K_INSTANCE;
	const value = row[field.key];
	if (!isValidNumber(value) || !Number.isInteger(value) || value < 0 || value > max) {
		addIssue(
			issues,
			config,
			conversionKey,
			field.key,
			`${field.label} must be a whole number from 0 to ${max}.`,
			rowIndex,
			collection,
		);
	}
}

function validateMapping(
	issues: ConfigIssue[],
	conversionKey: string,
	config: ConversionConfig | undefined,
	rule: RowRule,
): void {
	if (!config) return;
	const value = config.extras[rule.collection];
	if (value === undefined) {
		if (config.enabled) {
			addIssue(
				issues,
				config,
				conversionKey,
				rule.collection,
				`Add at least one ${rule.label} mapping before enabling this conversion.`,
			);
		}
		return;
	}
	if (!Array.isArray(value)) {
		addIssue(
			issues,
			config,
			conversionKey,
			rule.collection,
			`${rule.label[0]?.toUpperCase() ?? "M"}${rule.label.slice(1)} mappings must be a list.`,
		);
		return;
	}
	if (value.length === 0 && config.enabled) {
		addIssue(
			issues,
			config,
			conversionKey,
			rule.collection,
			`Add at least one ${rule.label} mapping before enabling this conversion.`,
		);
	}

	const seenIds = new Map<string, number>();
	const seenOutputIdentities = new Map<string, { rowIndex: number; label: string }>();
	for (const [rowIndex, candidate] of value.entries()) {
		if (!isPlainObject(candidate)) {
			addIssue(
				issues,
				config,
				conversionKey,
				rule.collection,
				`${rule.label[0]?.toUpperCase() ?? "M"}${rule.label.slice(1)} row ${rowIndex + 1} is not valid.`,
				rowIndex,
				rule.collection,
			);
			continue;
		}

		const id = candidate[rule.idField];
		if (rule.idField === "signalkPath") {
			const parsed = parseTankPath(id);
			if (parsed === null || !SUPPORTED_TANK_TYPES.has(parsed.type)) {
				addIssue(
					issues,
					config,
					conversionKey,
					rule.idField,
					`${rule.idLabel} must be a supported path such as tanks.fuel.0.`,
					rowIndex,
					rule.collection,
				);
			}
		} else if (!validId(id, rule.allowNumericId ?? false)) {
			addIssue(
				issues,
				config,
				conversionKey,
				rule.idField,
				`${rule.idLabel} must be one path segment using letters, numbers, hyphens, or underscores.`,
				rowIndex,
				rule.collection,
			);
		}

		if (typeof id === "string" || typeof id === "number") {
			const normalizedId = String(id);
			const firstRow = seenIds.get(normalizedId);
			if (firstRow !== undefined) {
				addIssue(
					issues,
					config,
					conversionKey,
					rule.idField,
					`${rule.idLabel} duplicates row ${firstRow + 1}.`,
					rowIndex,
					rule.collection,
				);
			} else {
				seenIds.set(normalizedId, rowIndex);
			}
		}

		for (const field of rule.instanceFields ?? []) {
			validateInstance(issues, config, conversionKey, candidate, rowIndex, field, rule.collection);
		}
		for (const identity of rule.outputIdentities ?? []) {
			const raw = candidate[identity.key];
			if (
				!(typeof raw === "string" && raw.length > 0) &&
				!(isValidNumber(raw) && Number.isInteger(raw))
			) {
				continue;
			}
			const normalized = `${typeof raw}:${String(raw)}`;
			const first = seenOutputIdentities.get(normalized);
			if (first !== undefined) {
				const location =
					first.rowIndex === rowIndex
						? `${first.label} in this row`
						: `${first.label} in row ${first.rowIndex + 1}`;
				addIssue(
					issues,
					config,
					conversionKey,
					identity.key,
					`${identity.label} duplicates ${location}.`,
					rowIndex,
					rule.collection,
				);
			} else {
				seenOutputIdentities.set(normalized, {
					rowIndex,
					label: identity.label,
				});
			}
		}

		if (conversionKey === "AC_STATUS") {
			if (candidate.direction !== "input" && candidate.direction !== "output") {
				addIssue(
					issues,
					config,
					conversionKey,
					"direction",
					"Select Input or Output.",
					rowIndex,
					rule.collection,
				);
			}
			if (candidate.phaseMode !== "single" && candidate.phaseMode !== "three") {
				addIssue(
					issues,
					config,
					conversionKey,
					"phaseMode",
					"Select a phase mode.",
					rowIndex,
					rule.collection,
				);
			}
			if (
				candidate.direction === "input" &&
				!new Set(["Bad level", "Bad frequency", "Being qualified", "Good"]).has(
					candidate.acceptability as string,
				)
			) {
				addIssue(
					issues,
					config,
					conversionKey,
					"acceptability",
					"Select input acceptability for this AC source.",
					rowIndex,
					rule.collection,
				);
			}
		}
		if (
			conversionKey === "RAYMARINE_BRIGHTNESS" &&
			!BRIGHTNESS_GROUPS.has(candidate.groupLabel as string)
		) {
			addIssue(
				issues,
				config,
				conversionKey,
				"groupLabel",
				"Select a known NMEA 2000 brightness group.",
				rowIndex,
				rule.collection,
			);
		}
		if (
			conversionKey === "ENGINE_STATIC" &&
			candidate.ratedEngineSpeed !== undefined &&
			(!isValidNumber(candidate.ratedEngineSpeed) || candidate.ratedEngineSpeed < 0)
		) {
			addIssue(
				issues,
				config,
				conversionKey,
				"ratedEngineSpeed",
				"Rated engine speed must be zero or a positive number.",
				rowIndex,
				rule.collection,
			);
		}
	}
}

function validateVesselTrip(issues: ConfigIssue[], config: ConversionConfig | undefined): void {
	if (!config) return;
	const fuelTanks = config.extras.fuelTanks;
	if (!Array.isArray(fuelTanks)) {
		addIssue(
			issues,
			config,
			"VESSEL_TRIP",
			"fuelTanks",
			"Fuel tank mappings must be a list with at least one tanks.fuel.<id> path.",
		);
	} else {
		if (fuelTanks.length === 0 && config.enabled) {
			addIssue(
				issues,
				config,
				"VESSEL_TRIP",
				"fuelTanks",
				"Add at least one fuel tank before enabling Vessel Trip.",
			);
		}
		const seen = new Map<string, number>();
		for (const [rowIndex, candidate] of fuelTanks.entries()) {
			const path = isPlainObject(candidate) ? candidate.signalkPath : undefined;
			const parsed = parseTankPath(path);
			if (parsed?.type !== "fuel") {
				addIssue(
					issues,
					config,
					"VESSEL_TRIP",
					"signalkPath",
					"Signal K fuel tank path must match tanks.fuel.<id>.",
					rowIndex,
					"fuelTanks",
				);
				continue;
			}
			const firstRow = seen.get(parsed.path);
			if (firstRow !== undefined) {
				addIssue(
					issues,
					config,
					"VESSEL_TRIP",
					"signalkPath",
					`Signal K fuel tank path duplicates row ${firstRow + 1}.`,
					rowIndex,
					"fuelTanks",
				);
			} else {
				seen.set(parsed.path, rowIndex);
			}
		}
	}

	const engines = config.extras.engines;
	if (engines !== undefined && !Array.isArray(engines)) {
		addIssue(issues, config, "VESSEL_TRIP", "engines", "Engine mappings must be a list.");
	} else if (Array.isArray(engines)) {
		const seen = new Map<string, number>();
		for (const [rowIndex, candidate] of engines.entries()) {
			const id = isPlainObject(candidate) ? candidate.signalkId : undefined;
			if (!validId(id, true)) {
				addIssue(
					issues,
					config,
					"VESSEL_TRIP",
					"signalkId",
					"Signal K engine id must be one path segment.",
					rowIndex,
					"engines",
				);
				continue;
			}
			const normalizedId = String(id);
			const firstRow = seen.get(normalizedId);
			if (firstRow !== undefined) {
				addIssue(
					issues,
					config,
					"VESSEL_TRIP",
					"signalkId",
					`Signal K engine id duplicates row ${firstRow + 1}.`,
					rowIndex,
					"engines",
				);
			} else {
				seen.set(normalizedId, rowIndex);
			}
		}
	}
}

function validateEnvironmentalFields(
	issues: ConfigIssue[],
	conversionKey: string,
	config: ConversionConfig,
): void {
	if (
		conversionKey.startsWith("TEMPERATURE_") ||
		conversionKey.startsWith("TEMPERATURE2_") ||
		conversionKey.startsWith("HUMIDITY_")
	) {
		const instance = config.extras.instance;
		if (
			instance !== undefined &&
			(!isValidNumber(instance) ||
				!Number.isInteger(instance) ||
				instance < 0 ||
				instance > MAX_N2K_INSTANCE)
		) {
			addIssue(
				issues,
				config,
				conversionKey,
				"instance",
				`NMEA 2000 instance must be a whole number from 0 to ${MAX_N2K_INSTANCE}.`,
			);
		}
		const source = config.extras.n2kSource;
		const allowed = conversionKey.startsWith("HUMIDITY_") ? HUMIDITY_SOURCES : TEMPERATURE_SOURCES;
		if (source !== undefined && source !== "" && !allowed.has(source as string)) {
			addIssue(issues, config, conversionKey, "n2kSource", "Select a known NMEA 2000 source type.");
		}
	}

	if (conversionKey === "ENVIRONMENT_PARAMETERS") {
		const temperatureSource = config.extras.temperatureSource;
		if (
			temperatureSource !== undefined &&
			temperatureSource !== "" &&
			!TEMPERATURE_SOURCES.has(temperatureSource as string)
		) {
			addIssue(
				issues,
				config,
				conversionKey,
				"temperatureSource",
				"Select a known NMEA 2000 temperature source type.",
			);
		}
		const humiditySource = config.extras.humiditySource;
		if (
			humiditySource !== undefined &&
			humiditySource !== "" &&
			!HUMIDITY_SOURCES.has(humiditySource as string)
		) {
			addIssue(
				issues,
				config,
				conversionKey,
				"humiditySource",
				"Select a known NMEA 2000 humidity source type.",
			);
		}
	}
}

function validatePublisherFilters(
	issues: ConfigIssue[],
	conversionKey: string,
	config: ConversionConfig,
): void {
	for (const [storedPath, source] of Object.entries(config.sources)) {
		if (typeof source !== "string" || source.length === 0) continue;
		if (source !== storedPath && pathToPropName(source) !== storedPath) continue;
		issues.push({
			severity: severityFor(config),
			conversionKey,
			field: "source",
			inputPath: source,
			message:
				"The publisher filter repeats the Signal K input path. Clear it to accept all publishers, or select an actual $source publisher ID.",
		});
	}
}

function configuredEngineInstances(config: ConversionConfig | undefined): Map<string, number> {
	const result = new Map<string, number>();
	const rows = config?.extras.engines;
	if (!Array.isArray(rows)) return result;
	for (const row of rows) {
		if (
			isPlainObject(row) &&
			validId(row.signalkId, true) &&
			isValidNumber(row.instanceId) &&
			Number.isInteger(row.instanceId)
		) {
			result.set(String(row.signalkId), row.instanceId);
		}
	}
	return result;
}

function validateEngineConsistency(
	issues: ConfigIssue[],
	conversions: Config["conversions"],
): void {
	const keys = ["ENGINE_PARAMETERS", "ENGINE_TRIP", "ENGINE_STATIC"] as const;
	const registries = keys.map((key) => ({
		key,
		config: conversions[key],
		instances: configuredEngineInstances(conversions[key]),
	}));
	const firstById = new Map<string, { key: string; instance: number; enabled: boolean }>();
	for (const registry of registries) {
		for (const [id, instance] of registry.instances) {
			const first = firstById.get(id);
			if (!first) {
				firstById.set(id, {
					key: registry.key,
					instance,
					enabled: registry.config?.enabled ?? false,
				});
				continue;
			}
			if (first.instance === instance) continue;
			const config = registry.config;
			const severity: ConfigIssueSeverity =
				first.enabled && (config?.enabled ?? false) ? "error" : "warning";
			issues.push({
				severity,
				conversionKey: registry.key,
				field: "instanceId",
				message: `Engine ${id} uses NMEA 2000 instance ${instance}, but ${first.key} uses ${first.instance}. Use the same instance across engine conversions.`,
			});
		}
	}
}

interface WireIdentity {
	conversionKey: string;
	config: ConversionConfig;
	field: string;
	label: string;
	value: number;
	collection?: string;
	rowIndex?: number;
}

function validWireInstance(value: unknown): value is number {
	return isValidNumber(value) && Number.isInteger(value) && value >= 0 && value <= MAX_N2K_INSTANCE;
}

function mappingInstances(
	config: ConversionConfig | undefined,
	collection: string,
	fields: readonly string[],
): Set<number> {
	const result = new Set<number>();
	const rows = config?.extras[collection];
	if (!Array.isArray(rows)) return result;
	for (const row of rows) {
		if (!isPlainObject(row)) continue;
		for (const field of fields) {
			const instance = row[field];
			if (validWireInstance(instance)) result.add(instance);
		}
	}
	return result;
}

function addCrossConversionCollision(
	issues: ConfigIssue[],
	current: WireIdentity,
	first: WireIdentity,
	message: string,
): void {
	issues.push({
		severity: current.config.enabled && first.config.enabled ? "error" : "warning",
		conversionKey: current.conversionKey,
		field: current.field,
		message,
		...(current.collection === undefined ? {} : { collection: current.collection }),
		...(current.rowIndex === undefined ? {} : { rowIndex: current.rowIndex }),
	});
}

/** PGN 127508 has one primary identity namespace shared by batteries and solar outputs. */
function validateDcStatusIdentities(
	issues: ConfigIssue[],
	conversions: Config["conversions"],
): void {
	const identities: WireIdentity[] = [];
	const battery = conversions.BATTERY;
	const batteryRows = battery?.extras.batteries;
	if (battery && Array.isArray(batteryRows)) {
		for (const [rowIndex, row] of batteryRows.entries()) {
			if (isPlainObject(row) && validWireInstance(row.instanceId)) {
				identities.push({
					conversionKey: "BATTERY",
					config: battery,
					field: "instanceId",
					label: "battery instance",
					value: row.instanceId,
					collection: "batteries",
					rowIndex,
				});
			}
		}
	}

	const solar = conversions.SOLAR;
	const solarRows = solar?.extras.chargers;
	if (solar && Array.isArray(solarRows)) {
		for (const [rowIndex, row] of solarRows.entries()) {
			if (!isPlainObject(row)) continue;
			for (const field of ["instanceId", "panelInstanceId"] as const) {
				const value = row[field];
				if (!validWireInstance(value)) continue;
				identities.push({
					conversionKey: "SOLAR",
					config: solar,
					field,
					label: field === "instanceId" ? "solar charger instance" : "solar panel instance",
					value,
					collection: "chargers",
					rowIndex,
				});
			}
		}
	}

	// Intra-conversion duplicates are reported by validateMapping. This pass is
	// only for the shared BATTERY/SOLAR PGN identity namespace.
	const firstByInstance = new Map<number, WireIdentity>();
	for (const identity of identities) {
		const first = firstByInstance.get(identity.value);
		if (!first) {
			firstByInstance.set(identity.value, identity);
			continue;
		}
		if (first.conversionKey === identity.conversionKey) continue;
		addCrossConversionCollision(
			issues,
			identity,
			first,
			`NMEA 2000 ${identity.label} ${identity.value} is also used by ${first.label} in ${first.conversionKey}. PGN 127508 identities must be unique.`,
		);
	}
}

function resolvedEnvironmentalIdentity(
	config: ConversionConfig,
	defaultInstance: number,
	defaultSource: string,
): { instance: number; source: string } | null {
	const rawInstance = config.extras.instance;
	const instance = rawInstance === undefined ? defaultInstance : rawInstance;
	if (!validWireInstance(instance)) return null;
	const rawSource = config.extras.n2kSource;
	const source = rawSource === undefined || rawSource === "" ? defaultSource : rawSource;
	return typeof source === "string" && source.length > 0 ? { instance, source } : null;
}

function validateEnvironmentalIdentities(
	issues: ConfigIssue[],
	conversions: Config["conversions"],
): void {
	const firstByIdentity = new Map<string, WireIdentity>();
	const add = (family: string, identity: WireIdentity, source: string): void => {
		const key = `${family}\u0000${source}\u0000${identity.value}`;
		const first = firstByIdentity.get(key);
		if (!first) {
			firstByIdentity.set(key, identity);
			return;
		}
		// Row-level mapping validation already reports duplicates within one
		// conversion. This pass is only for identities shared across conversions.
		if (first.conversionKey === identity.conversionKey) return;
		addCrossConversionCollision(
			issues,
			identity,
			first,
			`NMEA 2000 source ${source} and instance ${identity.value} duplicate ${first.conversionKey}. Each ${family} source-plus-instance identity must be unique.`,
		);
	};

	for (const prefix of ["TEMPERATURE", "TEMPERATURE2"] as const) {
		for (const definition of TEMPERATURE_DEFINITIONS) {
			const conversionKey = `${prefix}_${definition.option}`;
			const config = conversions[conversionKey];
			if (!config) continue;
			const resolved = resolvedEnvironmentalIdentity(
				config,
				definition.instance,
				definition.n2kSource,
			);
			if (!resolved || !TEMPERATURE_SOURCES.has(resolved.source)) continue;
			add(
				prefix === "TEMPERATURE" ? "PGN 130312" : "PGN 130316",
				{
					conversionKey,
					config,
					field: "instance",
					label: "temperature identity",
					value: resolved.instance,
				},
				resolved.source,
			);
		}
	}

	const exhaust = conversions.EXHAUST_TEMPERATURE;
	const exhaustRows = exhaust?.extras.engines;
	if (exhaust && Array.isArray(exhaustRows)) {
		for (const [rowIndex, row] of exhaustRows.entries()) {
			if (!isPlainObject(row) || !validWireInstance(row.tempInstanceId)) continue;
			add(
				"PGN 130312",
				{
					conversionKey: "EXHAUST_TEMPERATURE",
					config: exhaust,
					field: "tempInstanceId",
					label: "exhaust temperature identity",
					value: row.tempInstanceId,
					collection: "engines",
					rowIndex,
				},
				"Exhaust Gas Temperature",
			);
		}
	}

	for (const [conversionKey, defaults] of Object.entries(HUMIDITY_DEFAULT_IDENTITIES)) {
		const config = conversions[conversionKey];
		if (!config) continue;
		const resolved = resolvedEnvironmentalIdentity(config, defaults.instance, defaults.source);
		if (!resolved || !HUMIDITY_SOURCES.has(resolved.source)) continue;
		add(
			"PGN 130313",
			{
				conversionKey,
				config,
				field: "instance",
				label: "humidity identity",
				value: resolved.instance,
			},
			resolved.source,
		);
	}
}

function addReferenceWarning(
	issues: ConfigIssue[],
	conversionKey: string,
	field: string,
	referenceLabel: string,
	value: number,
	targetLabel: string,
	rowIndex: number,
	collection: string,
): void {
	issues.push({
		severity: "warning",
		conversionKey,
		field,
		collection,
		rowIndex,
		message: `NMEA 2000 ${referenceLabel} instance ${value} does not match a configured ${targetLabel}. Verify the linked instance on the receiving display.`,
	});
}

/** Validate references only when this configuration defines a local target registry. */
function validateLinkedInstances(issues: ConfigIssue[], conversions: Config["conversions"]): void {
	const batteryInstances = mappingInstances(conversions.BATTERY, "batteries", ["instanceId"]);
	const acInstances = mappingInstances(conversions.AC_STATUS, "acSources", ["instanceId"]);
	const dcInstances = new Set([
		...batteryInstances,
		...mappingInstances(conversions.SOLAR, "chargers", ["instanceId", "panelInstanceId"]),
	]);

	const chargerRows = conversions.CHARGER_STATUS?.extras.chargers;
	if (batteryInstances.size > 0 && Array.isArray(chargerRows)) {
		for (const [rowIndex, row] of chargerRows.entries()) {
			const value = isPlainObject(row) ? row.batteryInstanceId : undefined;
			if (validWireInstance(value) && !batteryInstances.has(value)) {
				addReferenceWarning(
					issues,
					"CHARGER_STATUS",
					"batteryInstanceId",
					"battery",
					value,
					"battery instance",
					rowIndex,
					"chargers",
				);
			}
		}
	}

	const inverterRows = conversions.INVERTER_STATUS?.extras.inverters;
	if (!Array.isArray(inverterRows)) return;
	for (const [rowIndex, row] of inverterRows.entries()) {
		if (!isPlainObject(row)) continue;
		if (
			acInstances.size > 0 &&
			validWireInstance(row.acInstanceId) &&
			!acInstances.has(row.acInstanceId)
		) {
			addReferenceWarning(
				issues,
				"INVERTER_STATUS",
				"acInstanceId",
				"AC",
				row.acInstanceId,
				"AC source instance",
				rowIndex,
				"inverters",
			);
		}
		if (
			dcInstances.size > 0 &&
			validWireInstance(row.dcInstanceId) &&
			!dcInstances.has(row.dcInstanceId)
		) {
			addReferenceWarning(
				issues,
				"INVERTER_STATUS",
				"dcInstanceId",
				"DC",
				row.dcInstanceId,
				"DC source instance",
				rowIndex,
				"inverters",
			);
		}
	}
}

/**
 * Validate panel-editable conversion configuration before it reaches runtime.
 * Invalid enabled mappings are errors and block Save. The same defect on a
 * disabled conversion is a warning so stale draft data cannot block unrelated
 * edits. This mirrors the runtime's accepted identifiers and wire ranges.
 */
export function validateConfig(config: Pick<Config, "conversions">): ConfigIssue[] {
	const issues: ConfigIssue[] = [];
	for (const [conversionKey, rule] of Object.entries(MAPPING_RULES)) {
		validateMapping(issues, conversionKey, config.conversions[conversionKey], rule);
	}
	validateVesselTrip(issues, config.conversions.VESSEL_TRIP);
	for (const [conversionKey, conversion] of Object.entries(config.conversions)) {
		validatePublisherFilters(issues, conversionKey, conversion);
		validateEnvironmentalFields(issues, conversionKey, conversion);
	}
	validateEngineConsistency(issues, config.conversions);
	validateDcStatusIdentities(issues, config.conversions);
	validateEnvironmentalIdentities(issues, config.conversions);
	validateLinkedInstances(issues, config.conversions);
	return issues;
}
