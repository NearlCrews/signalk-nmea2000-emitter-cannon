import { createRequire } from "node:module";

/**
 * The installed signalk-nearlcrews-ui release. `snui-check-consumer` owns the
 * pin assertion; the panel checks and the notice generator only need the
 * resolved version, so it is resolved once here rather than in each script.
 */
export const sharedUiVersion = createRequire(import.meta.url)(
	"signalk-nearlcrews-ui/package.json",
).version;

/** The attribute the package stamps on the panel root it renders. */
const sharedUiRootAttribute = `data-snui-version="${sharedUiVersion}"`;

/** CSS selector for that root. */
export const sharedUiRootSelector = `[${sharedUiRootAttribute}]`;
