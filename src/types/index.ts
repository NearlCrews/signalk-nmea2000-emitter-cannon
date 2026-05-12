export {
	Categories,
	type Config,
	type ConversionCategory,
	type ConversionConfig,
	type PresetTag,
	PresetTags,
	RootConfig,
} from "../config/schema.js";
export type * from "./nmea2000.js";
export type * from "./plugin.js";
// Value-level re-exports (type guards, runtime helpers)
export { isConversionOptions } from "./plugin.js";
export type * from "./signalk.js";
