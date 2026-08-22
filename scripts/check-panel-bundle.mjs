import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import * as ReactDOM from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { assertSharedUiVersion } from "./shared-ui-version.mjs";

const sharedUiVersion = assertSharedUiVersion(new URL("../", import.meta.url));

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

// React Aria's overlay, focus, and transition modules run global setup the
// moment their chunk evaluates, guarded only on `window` and `document` being
// defined. This context defines both, so it also has to answer the small set of
// DOM members that setup touches. Render itself is server-side, so these are
// inert listeners, not a DOM implementation.
const domEventTargetStub = () => ({
	addEventListener: () => {},
	removeEventListener: () => {},
});

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
		readyState: "complete",
		body: domEventTargetStub(),
		documentElement: domEventTargetStub(),
		...domEventTargetStub(),
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
context.HTMLElement = class HTMLElement {};
Object.assign(context, domEventTargetStub());
context.matchMedia = () => ({ matches: false, ...domEventTargetStub() });

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

const require = createRequire(import.meta.url);
const webpackConfig = require("../webpack.config.cjs");
const federation = webpackConfig.plugins.find((plugin) => plugin?.options?.shared !== undefined);
const shared = federation?.options?.shared;
const sharedRequests = Object.keys(shared ?? {}).sort();
if (sharedRequests.length !== 2 || sharedRequests.join(",") !== "react,react-dom") {
	throw new Error("the panel share map must contain only react and react-dom");
}
for (const request of ["react", "react-dom"]) {
	const entry = shared?.[request];
	if (
		entry?.singleton !== true ||
		entry?.import !== false ||
		entry?.requiredVersion !== "^19.2.0"
	) {
		throw new Error(`${request} must be configured as an exact host-provided singleton share`);
	}
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
