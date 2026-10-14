// Signal K Admin releases up to at least 2.24.0 register their React share as
// 19.0.0 while shipping a newer React. A strictVersion share therefore refuses
// a compatible host, and with import: false the panel never mounts there. That
// shipped in 1.10.8, so the share map is checked as webpack will receive it,
// whatever spreads or overrides produced it.

/** Return the options of the single ModuleFederationPlugin in a webpack config. */
export function federationOptions(config) {
	const plugins = (Array.isArray(config) ? config : [config]).flatMap(
		(entry) => entry?.plugins ?? [],
	);
	const federation = plugins.filter(
		(plugin) => plugin?.constructor?.name === "ModuleFederationPlugin",
	);
	if (federation.length !== 1) {
		throw new Error(`expected one ModuleFederationPlugin, found ${federation.length}`);
	}
	// webpack 5 keeps the constructor options on `options`; older releases used
	// `_options`. Fail rather than pass if neither holds them.
	const options = federation[0].options ?? federation[0]._options;
	if (options === null || typeof options !== "object") {
		throw new Error("could not read the ModuleFederationPlugin options from this webpack release");
	}
	return options;
}

/** Name every share that sets strictVersion, in object or array form. */
export function strictShares(shared) {
	const entries = Array.isArray(shared)
		? shared.flatMap((item) =>
				item !== null && typeof item === "object" ? Object.entries(item) : [],
			)
		: Object.entries(shared ?? {});
	return entries
		.filter(
			([, share]) =>
				share !== null &&
				typeof share === "object" &&
				"strictVersion" in share &&
				share.strictVersion !== false,
		)
		.map(([name]) => name);
}
