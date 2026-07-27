import { readdirSync, readFileSync } from "node:fs";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const sharedUiVersion = packageJson.devDependencies?.["signalk-nearlcrews-ui"];
if (typeof sharedUiVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(sharedUiVersion)) {
	throw new Error("signalk-nearlcrews-ui must be pinned to an exact version");
}

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
context.CSSScopeRule = class CSSScopeRule {};
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
});

// Register the already-built chunks after the container runtime exists. The
// real browser loads these on demand; pre-registering them keeps this smoke
// test deterministic without implementing a networked DOM script loader.
for (const { name, source } of bundles.filter(({ name }) => name !== "remoteEntry.js")) {
	vm.runInContext(source, context, { filename: name });
}
const factory = await container.get("./PluginConfigurationPanel");
const panelModule = factory();
Reflect.deleteProperty(context, "CSSScopeRule");
const unsupportedMarkup = renderToStaticMarkup(
	React.createElement(panelModule.default, { configuration: null, save: () => {} }),
);
if (!unsupportedMarkup.includes("Browser update required")) {
	throw new Error("panel runtime check did not render the browser compatibility message");
}
context.CSSScopeRule = class CSSScopeRule {};
const markup = renderToStaticMarkup(
	React.createElement(panelModule.default, { configuration: null, save: () => {} }),
);
if (!markup.includes("Loading conversions")) {
	throw new Error("panel runtime check did not render the configuration panel");
}
if (!markup.includes(`data-snui-version="${sharedUiVersion}"`)) {
	throw new Error("panel runtime check did not render signalk-nearlcrews-ui");
}

const combinedSource = bundles.map(({ source }) => source).join("\n");
for (const marker of [
	"__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE",
	"react.production.min",
	"react-dom.production.min",
]) {
	if (combinedSource.includes(marker)) {
		throw new Error(`panel bundled a React implementation marker: ${marker}`);
	}
}

process.stdout.write(`Panel production runtime rendered across ${bundles.length} bundles.\n`);
