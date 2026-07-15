import { readdirSync, readFileSync } from "node:fs";
import vm from "node:vm";
import React from "react";
import ReactDOM from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";

const publicDir = new URL("../public/", import.meta.url);
const bundles = readdirSync(publicDir)
	.filter((name) => name.endsWith(".js"))
	.map((name) => ({ name, source: readFileSync(new URL(name, publicDir), "utf8") }));

if (bundles.length === 0) throw new Error("panel build produced no JavaScript bundles");

for (const { name, source } of bundles) {
	if (source.includes("jsxDEV") || source.includes("jsx-dev-runtime")) {
		throw new Error(`${name} uses the React development JSX runtime`);
	}
}

const context = vm.createContext({
	console,
	setTimeout,
	clearTimeout,
	setInterval,
	clearInterval,
	AbortController,
	AbortSignal,
	URL,
	Intl,
	document: {
		currentScript: {
			tagName: "SCRIPT",
			src: "http://localhost/plugins/signalk-nmea2000-emitter-cannon/remoteEntry.js",
		},
	},
	fetch: async () => {
		throw new Error("panel runtime check must not fetch during render");
	},
});
context.self = context;
context.window = context;
context.globalThis = context;
context.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
context.confirm = () => false;

const remoteEntry = bundles.find(({ name }) => name === "remoteEntry.js");
if (!remoteEntry) throw new Error("panel build produced no remoteEntry.js");
vm.runInContext(remoteEntry.source, context, {
	filename: "remoteEntry.js",
});

const container = context.signalk_nmea2000_emitter_cannon;
if (container === null || typeof container !== "object") {
	throw new Error("panel remote did not expose the expected global container");
}

const shareEntry = (module, version) => ({
	[version]: {
		get: () => Promise.resolve(() => module),
		loaded: true,
		from: "panel-runtime-check",
		eager: true,
		shareConfig: { singleton: true, requiredVersion: `^${version}` },
	},
});
await container.init({
	react: shareEntry(React, React.version),
	"react-dom": shareEntry(ReactDOM, ReactDOM.version),
});

// Register the already-built chunks after the container runtime exists. The
// real browser loads these on demand; pre-registering them keeps this smoke
// test deterministic without implementing a networked DOM script loader.
for (const { name, source } of bundles.filter(({ name }) => name !== "remoteEntry.js")) {
	vm.runInContext(source, context, { filename: name });
}
const factory = await container.get("./PluginConfigurationPanel");
const panelModule = factory();
const markup = renderToStaticMarkup(
	React.createElement(panelModule.default, { configuration: null, save: () => {} }),
);
if (!markup.includes("Loading conversions")) {
	throw new Error("panel runtime check did not render the configuration panel");
}

process.stdout.write(`Panel production runtime rendered across ${bundles.length} bundles.\n`);
