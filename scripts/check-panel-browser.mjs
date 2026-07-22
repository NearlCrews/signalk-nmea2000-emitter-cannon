import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { build } from "esbuild";

const repositoryDir = new URL("../", import.meta.url);
const publicDir = new URL("../public/", import.meta.url);
const pluginPrefix = "/plugins/signalk-nmea2000-emitter-cannon/";
const updateScreenshots = process.argv.includes("--update-screenshots");
const vesselTripDescription =
	"Fuel range is an estimate, not a voyage-planning or safety value. Configure every fuel tank and propulsion consumer; other consumers, unusable reserve, cross-feed limits, weather, and tide are not included. Raymarine also requires Fuel Manager setup, fuel data from PGN 127489 or 127497, and PGN 129026 with GNSS for distance. Current Garmin documentation does not list PGN 127496.";

async function loadConversionCatalog() {
	const source = `
import { buildConversionMetadata } from "./src/api/conversion-metadata.ts";
import { createConversionModules } from "./src/conversions/index.ts";
const app = new Proxy(
  { error: console.error, selfId: "vessels.self" },
  { get: (target, key) => key in target ? target[key] : () => undefined },
);
const plugin = { id: "signalk-nmea2000-emitter-cannon" };
export default buildConversionMetadata(createConversionModules(app, plugin));
`;
	const result = await build({
		stdin: { contents: source, loader: "ts", resolveDir: new URL("../", import.meta.url).pathname },
		bundle: true,
		format: "esm",
		platform: "node",
		write: false,
	});
	const bundled = result.outputFiles[0]?.contents;
	if (!bundled) throw new Error("conversion catalog bundle was not produced");
	const module = await import(
		`data:text/javascript;base64,${Buffer.from(bundled).toString("base64")}`
	);
	if (!Array.isArray(module.default)) throw new Error("conversion catalog did not return a list");
	return module.default;
}

const testMeta = [
	{
		key: "BATTERY",
		title: "Battery (PGNs 127506, 127508)",
		canResend: true,
		pgns: ["127506", "127508"],
		category: "electrical",
		presets: [],
		paths: ["electrical.batteries.house.voltage"],
		extras: { type: "batteryMapping", minRows: 0 },
		purpose: "Basic and detailed battery status.",
	},
	{
		key: "AC_STATUS",
		title: "AC Input and Output Status (PGNs 127503, 127504)",
		canResend: true,
		pgns: ["127503", "127504"],
		category: "electrical",
		presets: [],
		paths: [],
		extras: { type: "acMapping", minRows: 0 },
		purpose: "Per-line AC input and output measurements.",
	},
	{
		key: "CHARGER_STATUS",
		title: "Charger Status (PGN 127507)",
		canResend: true,
		pgns: ["127507"],
		category: "electrical",
		presets: [],
		paths: [],
		extras: { type: "chargerMapping", minRows: 0 },
		purpose: "Battery charger operating state and role.",
	},
	{
		key: "INVERTER_STATUS",
		title: "Inverter Status (PGN 127509)",
		canResend: true,
		pgns: ["127509"],
		category: "electrical",
		presets: [],
		paths: [],
		extras: { type: "inverterMapping", minRows: 0 },
		purpose: "Inverter operating state and linked AC and DC instances.",
	},
	{
		key: "VESSEL_TRIP",
		title: "Vessel Trip Parameters (PGN 127496)",
		canResend: false,
		pgns: ["127496"],
		category: "engine",
		presets: ["engine-set"],
		paths: [],
		extras: { type: "vesselTripMapping", minRows: 0 },
		purpose: "Aggregate vessel fuel remaining and derived range.",
		description: vesselTripDescription,
	},
	{
		key: "TEMPERATURE2_OUTSIDE",
		title: "Outside Temperature (PGN 130316)",
		canResend: true,
		pgns: ["130316"],
		category: "environment",
		presets: ["environmental"],
		paths: ["environment.outside.temperature"],
		extras: {
			type: "fields",
			fields: [
				{
					key: "n2kSource",
					label: "NMEA 2000 Source Type",
					control: "select",
					default: "",
					options: [
						{ value: "", label: "Default (per Signal K path)" },
						{ value: "Sea Temperature", label: "Sea Temperature" },
						{ value: "Outside Temperature", label: "Outside Temperature" },
					],
				},
			],
		},
	},
	{
		key: "TEMPERATURE2_SEA",
		title: "Sea Temperature (PGN 130316)",
		canResend: true,
		pgns: ["130316"],
		category: "environment",
		presets: ["environmental"],
		paths: ["environment.water.temperature"],
		extras: { type: "fields", fields: [] },
	},
];

const testMetaByKey = new Map(testMeta.map((entry) => [entry.key, entry]));
const meta = (await loadConversionCatalog()).map((entry) => testMetaByKey.get(entry.key) ?? entry);

const configuration = {
	globalResendInterval: 5,
	conversions: {
		BATTERY: {
			enabled: true,
			resend: 0,
			sources: {},
			extras: {
				batteries: [null, { signalkId: "house", instanceId: 0 }],
			},
		},
		AC_STATUS: {
			enabled: true,
			resend: 0,
			sources: {},
			extras: {
				acSources: [
					null,
					{
						signalkId: "shore",
						instanceId: 1,
						direction: "input",
						phaseMode: "single",
						acceptability: "Good",
					},
				],
			},
		},
		CHARGER_STATUS: {
			enabled: true,
			resend: 0,
			sources: {},
			extras: {
				chargers: [null, { signalkId: "shore", instanceId: 4, batteryInstanceId: 1 }],
			},
		},
		INVERTER_STATUS: {
			enabled: true,
			resend: 0,
			sources: {},
			extras: {
				inverters: [null, { signalkId: "main", instanceId: 2, acInstanceId: 1, dcInstanceId: 3 }],
			},
		},
		VESSEL_TRIP: {
			enabled: true,
			resend: 0,
			sources: {},
			extras: {
				fuelTanks: [null],
				engines: [null],
			},
		},
		TEMPERATURE2_OUTSIDE: {
			enabled: true,
			resend: 0,
			sources: {},
			extras: { n2kSource: "Retired Temperature Source" },
		},
		TEMPERATURE2_SEA: {
			enabled: true,
			resend: 0,
			sources: { "environment.water.temperature": "missing-water-sensor" },
			extras: {},
		},
	},
};

const screenshotEnabledKeys = new Set(
	meta
		.filter(
			(entry) =>
				!entry.extras.type.endsWith("Mapping") &&
				(entry.presets.includes("basic-nav") || entry.presets.includes("environmental")),
		)
		.map((entry) => entry.key),
);
const screenshotConfiguration = {
	globalResendInterval: 5,
	conversions: Object.fromEntries(
		meta
			.filter((entry) => screenshotEnabledKeys.has(entry.key))
			.map((entry) => [
				entry.key,
				{
					enabled: true,
					resend: 0,
					sources: {},
					extras: {},
				},
			]),
	),
};

const hostSource = `
import React from "react";
import { createRoot } from "react-dom/client";

const container = globalThis.signalk_nmea2000_emitter_cannon;
if (!container) throw new Error("Module Federation container was not loaded");
const shareEntry = (module, version) => ({
  [version]: {
    get: () => Promise.resolve(() => module),
    loaded: true,
    from: "panel-browser-check",
    eager: true,
    shareConfig: { singleton: true, requiredVersion: ">=19.2.0 <20.0.0" },
  },
});
await container.init({ react: shareEntry(React, React.version) });
const factory = await container.get("./PluginConfigurationPanel");
const Panel = factory().default;
createRoot(document.getElementById("root")).render(
  React.createElement(Panel, {
	configuration: new URLSearchParams(location.search).has("screenshots")
		? ${JSON.stringify(screenshotConfiguration)}
		: ${JSON.stringify(configuration)},
    save: (next) => {
      globalThis.__panelSaveCount = (globalThis.__panelSaveCount ?? 0) + 1;
      globalThis.__panelSavedConfiguration = next;
    },
  }),
);
`;

const hostBuild = await build({
	stdin: {
		contents: hostSource,
		loader: "js",
		resolveDir: new URL(".", repositoryDir).pathname,
	},
	bundle: true,
	format: "esm",
	platform: "browser",
	write: false,
	minify: true,
});
const hostJs = hostBuild.outputFiles[0]?.contents;
if (!hostJs) throw new Error("browser host bundle was not produced");

const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div id="root"></div>
<script src="${pluginPrefix}remoteEntry.js"></script>
<script type="module" src="/host.js"></script>
</body></html>`;

function json(response, body) {
	response.writeHead(200, { "content-type": "application/json" });
	response.end(JSON.stringify(body));
}

let pathRequestCount = 0;
let seaSourceRequestCount = 0;

const server = createServer((request, response) => {
	const url = new URL(request.url ?? "/", "http://127.0.0.1");
	if (url.pathname === "/" || url.pathname === "/index.html") {
		response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
		response.end(html);
		return;
	}
	if (url.pathname === "/host.js") {
		response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
		response.end(hostJs);
		return;
	}
	if (url.pathname === "/favicon.ico") {
		response.writeHead(204);
		response.end();
		return;
	}
	if (url.pathname === `${pluginPrefix}api/conversions`) {
		json(response, { conversions: meta });
		return;
	}
	if (url.pathname === `${pluginPrefix}api/status`) {
		const screenshotRequest = request.headers.referer?.includes("screenshots=1") ?? false;
		const enabledKeys = screenshotRequest
			? screenshotEnabledKeys
			: new Set(
					Object.entries(configuration.conversions)
						.filter(([, entry]) => entry.enabled)
						.map(([key]) => key),
				);
		json(response, {
			pluginRunning: true,
			nmea2000Ready: true,
			enabledCount: enabledKeys.size,
			totalConversions: meta.length,
			perConversion: meta.map(({ key, title }) => ({
				key,
				title,
				enabled: enabledKeys.has(key),
				emitCount: enabledKeys.has(key) ? 42 : 0,
				...(enabledKeys.has(key) ? { lastEmitMs: 2000 } : {}),
			})),
			startTime: Date.now() - 60_000,
		});
		return;
	}
	if (url.pathname === `${pluginPrefix}api/paths`) {
		pathRequestCount++;
		setTimeout(() => {
			if (pathRequestCount === 2) {
				response.writeHead(503, { "content-type": "text/plain" });
				response.end("inventory temporarily unavailable");
				return;
			}
			json(response, {
				paths: [
					"electrical.batteries.fomleMonitor-second.voltage",
					"electrical.ac.shorePower.phase.single.lineNeutralVoltage",
					"electrical.chargers.shore.chargingMode",
					"electrical.inverters.main.inverterMode",
					"tanks.fuel.reserve_1.currentVolume",
					"propulsion.port.fuel.rate",
					"environment.outside.temperature",
				],
			});
		}, 75);
		return;
	}
	if (url.pathname === `${pluginPrefix}api/advisor/pending`) {
		json(response, { result: { autoApplied: [], pending: [], notes: [] } });
		return;
	}
	if (url.pathname === `${pluginPrefix}api/sources`) {
		if (url.searchParams.get("path") === "environment.water.temperature") {
			seaSourceRequestCount++;
			if (seaSourceRequestCount === 1) {
				response.writeHead(503, { "content-type": "text/plain" });
				response.end("publisher inventory temporarily unavailable");
				return;
			}
		}
		json(response, {
			sources:
				url.searchParams.get("path") === "environment.outside.temperature"
					? ["open-meteo", "venus.com.victronenergy.temperature.24"]
					: [],
		});
		return;
	}
	if (url.pathname.startsWith(pluginPrefix)) {
		const name = url.pathname.slice(pluginPrefix.length);
		const file = new URL(name, publicDir);
		if (
			file.pathname.startsWith(publicDir.pathname) &&
			existsSync(file) &&
			statSync(file).isFile()
		) {
			response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
			response.end(readFileSync(file));
			return;
		}
	}
	response.writeHead(404);
	response.end("Not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
	const address = server.address();
	if (address === null || typeof address === "string") {
		throw new Error("browser server did not bind");
	}

	const systemChromium = "/usr/bin/chromium";
	const executablePath =
		process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
		(existsSync(systemChromium) ? systemChromium : undefined);
	browser = await chromium.launch({
		headless: true,
		...(executablePath === undefined ? {} : { executablePath }),
	});
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	const errors = [];
	page.on("pageerror", (error) => errors.push(error.message));
	page.on("console", (message) => {
		const text = message.text();
		const isExpectedInventoryFailure =
			pathRequestCount >= 2 &&
			text ===
				"Failed to load resource: the server responded with a status of 503 (Service Unavailable)";
		if (message.type() === "error" && !isExpectedInventoryFailure) errors.push(text);
	});

	await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
	const root = page.locator('[data-snui-version="0.3.0"]');
	await root.waitFor();
	await page.getByRole("tab", { name: /Electrical/ }).click();
	await page.locator("#skn-row-toggle-BATTERY").click();
	await page.getByText("Battery mapping", { exact: true }).waitFor();
	const batteryId = page.getByLabel("Signal K battery id");
	await batteryId.fill("fomleMonitor-second");
	await page.getByText("Asset found", { exact: true }).waitFor();
	await page
		.getByText("Required input found: at least one battery measurement", { exact: true })
		.waitFor();
	const batteryTableRegion = page.getByRole("region", { name: "Battery mapping" });
	await batteryTableRegion.waitFor();
	if ((await batteryTableRegion.getAttribute("tabindex")) !== "0") {
		throw new Error("mapping table scroll region was not keyboard focusable");
	}
	const refreshAssets = page.getByRole("button", { name: "Refresh path inventory" });
	await refreshAssets.click();
	await page.getByText("Refreshing Signal K server path inventory...", { exact: true }).waitFor();
	await page.getByRole("button", { name: "Retry path inventory" }).waitFor();
	await page.getByText(/Signal K server path inventory unavailable: HTTP 503/).waitFor();
	await page.getByRole("button", { name: "Retry path inventory" }).click();
	await page.getByText("7 paths in the Signal K server inventory.", { exact: true }).waitFor();
	if (pathRequestCount < 3) throw new Error("path inventory retry did not issue a new request");
	const advancedPublishers = page.getByRole("button", { name: /Advanced publisher filters/ });
	if ((await advancedPublishers.getAttribute("aria-expanded")) !== "false") {
		throw new Error("mapped publisher filters were not collapsed by default");
	}
	await advancedPublishers.click();
	await page.getByLabel("Signal K input path: electrical.batteries.house.voltage").waitFor();
	if (!(await batteryId.evaluate((element) => element.checkValidity()))) {
		throw new Error("hyphenated Venus battery id was rejected by the panel");
	}
	await page.getByText(/For electrical\.batteries\.258-second\.voltage/).waitFor();
	await page.getByRole("columnheader", { name: "Signal K input", exact: true }).waitFor();
	await page.getByRole("columnheader", { name: "NMEA 2000 output", exact: true }).waitFor();
	await page.locator("#skn-row-toggle-AC_STATUS").click();
	await page.getByText("AC source mapping", { exact: true }).waitFor();
	await page
		.getByLabel("Resend interval seconds for AC Input and Output Status (PGNs 127503, 127504)")
		.waitFor();
	await page.getByLabel("Signal K AC bus id").fill("shorePower");
	await page.getByLabel("Direction").selectOption("output");
	if (!(await page.getByLabel("Input acceptability").isDisabled())) {
		throw new Error("output rows must disable input acceptability");
	}
	await page.getByRole("tab", { name: /Environment/ }).click();
	await page.locator("#skn-row-toggle-TEMPERATURE2_OUTSIDE").click();
	const signalKInputGroup = page.getByRole("group", { name: "Signal K input" });
	await signalKInputGroup.waitFor();
	const fixedInputPath = signalKInputGroup.getByLabel(
		"Signal K input path: environment.outside.temperature",
	);
	if ((await fixedInputPath.inputValue()) !== "environment.outside.temperature") {
		throw new Error("fixed Signal K input path was not displayed");
	}
	if ((await fixedInputPath.getAttribute("readonly")) === null) {
		throw new Error("fixed Signal K input path was editable");
	}
	const publisher = signalKInputGroup.getByLabel(
		"Signal K publisher ($source), optional, for environment.outside.temperature",
	);
	if ((await publisher.inputValue()) !== "") {
		throw new Error("publisher filter did not default to All publishers");
	}
	await publisher.selectOption({ label: "Enter publisher manually..." });
	const manualPublisher = signalKInputGroup.getByLabel(
		"Manual Signal K publisher for environment.outside.temperature",
	);
	await manualPublisher.fill("environment.outside.temperature");
	await signalKInputGroup.getByRole("status").waitFor();
	await page
		.locator("#skn-card-TEMPERATURE2_OUTSIDE")
		.getByText(/publisher filter repeats the Signal K input path/i, { exact: false })
		.waitFor();
	if ((await publisher.getAttribute("aria-invalid")) !== "true") {
		throw new Error("path entered as a publisher filter was not marked invalid");
	}
	if (
		!(await publisher.evaluate((element) =>
			element
				.getAttribute("aria-describedby")
				?.split(/\s+/)
				.every((id) => document.getElementById(id) !== null),
		))
	) {
		throw new Error("publisher filter helper and warning were not associated accessibly");
	}
	if (
		!(
			await signalKInputGroup
				.getByText(/filters who may publish the fixed input path/)
				.textContent()
		)?.includes("does not change the Signal K path")
	) {
		throw new Error("publisher filter helper did not distinguish source from path");
	}
	await publisher.selectOption("venus.com.victronenergy.temperature.24");
	await page
		.getByRole("group", { name: "NMEA 2000 output" })
		.getByText("Emits PGN 130316.")
		.waitFor();
	const n2kSourceType = page.getByLabel("NMEA 2000 Source Type");
	if (
		(await n2kSourceType.locator("option:checked").textContent()) !==
		"Retired Temperature Source (not a known option)"
	) {
		throw new Error("unknown persisted select value was hidden behind a valid-looking default");
	}
	await n2kSourceType.selectOption("");
	await page.locator("#skn-row-toggle-TEMPERATURE2_SEA").click();
	const seaCard = page.locator("#skn-card-TEMPERATURE2_SEA");
	await seaCard.getByText(/Publisher lookup unavailable: HTTP 503/).waitFor();
	if ((await seaCard.getByText(/No publisher in the server model matches/).count()) !== 0) {
		throw new Error("publisher lookup failure was presented as a definitive mismatch");
	}
	await seaCard.getByRole("button", { name: "Retry" }).click();
	await seaCard.getByText(/No publisher in the server model matches/).waitFor();
	if (seaSourceRequestCount !== 2)
		throw new Error("publisher lookup retry did not issue a request");

	for (const [label, value] of [
		["Light", "light"],
		["Dark", "dark"],
		["Night", "night"],
	]) {
		await page.getByRole("radio", { name: label, exact: true }).click();
		if ((await root.getAttribute("data-snui-theme")) !== value) {
			throw new Error(`${label} theme did not update the panel root`);
		}
	}

	await page.setViewportSize({ width: 320, height: 800 });
	await page.evaluate(
		() =>
			new Promise((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))),
			),
	);
	const rootOverflow = await root.evaluate((element) => element.scrollWidth - element.clientWidth);
	if (rootOverflow > 1) {
		throw new Error(`panel root overflows a 320px viewport by ${rootOverflow}px`);
	}

	await page.getByRole("tab", { name: /Electrical/ }).click();
	await page.locator("#skn-row-toggle-CHARGER_STATUS").click();
	await page.getByLabel("NMEA 2000 charger instance").fill("5");
	await page.locator("#skn-row-toggle-INVERTER_STATUS").click();
	await page.getByLabel("NMEA 2000 DC instance").fill("7");
	await page.getByRole("tab", { name: /Engine/ }).click();
	await page.locator("#skn-row-toggle-VESSEL_TRIP").click();
	const vesselTripNote = page.getByRole("note");
	await vesselTripNote.waitFor();
	if (!(await vesselTripNote.textContent())?.includes(vesselTripDescription)) {
		throw new Error("vessel trip safety advisory was not rendered");
	}
	await page.getByText("Fuel tanks used for vessel range", { exact: true }).waitFor();
	await page.getByText("Engines used for vessel range", { exact: true }).waitFor();
	await page.getByRole("button", { name: "Add row to Fuel tanks used for vessel range" }).click();
	await page.getByRole("button", { name: "Add row to Engines used for vessel range" }).click();
	await page
		.getByRole("button", { name: "Remove row 1 from Fuel tanks used for vessel range" })
		.waitFor();
	await page
		.getByRole("button", { name: "Remove row 1 from Engines used for vessel range" })
		.waitFor();
	const vesselTripOverflow = await root.evaluate(
		(element) => element.scrollWidth - element.clientWidth,
	);
	if (vesselTripOverflow > 1) {
		throw new Error(`vessel trip editor overflows a 320px viewport by ${vesselTripOverflow}px`);
	}
	const fuelTankInput = page.getByLabel("Signal K fuel tank path");
	const engineInput = page.getByLabel("Signal K engine id");
	await fuelTankInput.fill("tanks.fuel.reserve_1");
	await engineInput.fill("invalid.id");
	await page.getByRole("button", { name: "Review first error" }).click();
	await page.waitForFunction(
		() => document.activeElement?.getAttribute("aria-label") === "Signal K engine id",
	);
	if ((await engineInput.getAttribute("aria-invalid")) !== "true") {
		throw new Error("Vessel Trip engine validation did not mark the engine table row");
	}
	if ((await fuelTankInput.getAttribute("aria-invalid")) === "true") {
		throw new Error("Vessel Trip engine validation marked the fuel-tank table row");
	}
	if (!(await page.getByRole("button", { name: "Save", exact: true }).isDisabled())) {
		throw new Error("invalid Vessel Trip engine row did not block Save");
	}
	await engineInput.fill("port");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const saveResult = await page.evaluate(() => ({
		count: globalThis.__panelSaveCount,
		configuration: globalThis.__panelSavedConfiguration,
	}));
	if (saveResult.count !== 1) throw new Error(`expected one save, got ${saveResult.count ?? 0}`);
	const savedAc = saveResult.configuration?.conversions?.AC_STATUS?.extras?.acSources;
	const savedBatteries = saveResult.configuration?.conversions?.BATTERY?.extras?.batteries;
	if (savedBatteries?.length !== 1 || savedBatteries[0]?.signalkId !== "fomleMonitor-second") {
		throw new Error("hyphenated Venus battery id was not saved");
	}
	if (savedAc?.length !== 1 || savedAc[0]?.signalkId !== "shorePower") {
		throw new Error("AC editor changes were not saved");
	}
	if (savedAc[0]?.direction !== "output") throw new Error("AC direction was not saved");
	const savedChargers = saveResult.configuration?.conversions?.CHARGER_STATUS?.extras?.chargers;
	if (savedChargers?.length !== 1 || savedChargers[0]?.instanceId !== 5) {
		throw new Error("charger editor changes were not saved");
	}
	const savedInverters = saveResult.configuration?.conversions?.INVERTER_STATUS?.extras?.inverters;
	if (savedInverters?.length !== 1 || savedInverters[0]?.dcInstanceId !== 7) {
		throw new Error("inverter editor changes were not saved");
	}
	const savedTemperaturePublisher =
		saveResult.configuration?.conversions?.TEMPERATURE2_OUTSIDE?.sources?.[
			"environment.outside.temperature"
		];
	if (savedTemperaturePublisher !== "venus.com.victronenergy.temperature.24") {
		throw new Error("Signal K publisher filter was not saved under its existing path key");
	}
	const savedFuelTanks = saveResult.configuration?.conversions?.VESSEL_TRIP?.extras?.fuelTanks;
	if (savedFuelTanks?.length !== 1 || savedFuelTanks[0]?.signalkPath !== "tanks.fuel.reserve_1") {
		throw new Error("vessel trip fuel-tank changes were not saved");
	}
	const savedEngines = saveResult.configuration?.conversions?.VESSEL_TRIP?.extras?.engines;
	if (savedEngines?.length !== 1 || savedEngines[0]?.signalkId !== "port") {
		throw new Error("vessel trip engine changes were not saved");
	}
	if (errors.length > 0) throw new Error(`browser errors:\n${errors.join("\n")}`);

	if (updateScreenshots) {
		const capture = async (name, viewport, prepare = async () => {}) => {
			const screenshotPage = await browser.newPage({ viewport });
			await screenshotPage.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
			await screenshotPage.goto(`http://127.0.0.1:${address.port}/?screenshots=1`, {
				waitUntil: "networkidle",
			});
			await screenshotPage.locator('[data-snui-version="0.3.0"]').waitFor();
			await prepare(screenshotPage);
			await screenshotPage.evaluate(
				() =>
					new Promise((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))),
					),
			);
			await screenshotPage.screenshot({
				path: new URL(`../assets/screenshots/${name}`, import.meta.url).pathname,
			});
			await screenshotPage.close();
		};

		await capture("config-panel.png", { width: 1405, height: 1279 });
		await capture(
			"environment-conversions.png",
			{ width: 1393, height: 1235 },
			async (screenshotPage) => {
				await screenshotPage.getByRole("tab", { name: /Environment/ }).click();
				await screenshotPage.locator("#skn-row-toggle-TEMPERATURE2_SEA:visible").waitFor();
			},
		);
		await capture("config-advisor.png", { width: 1405, height: 1510 }, async (screenshotPage) => {
			await screenshotPage.getByRole("button", { name: "Config Advisor" }).click();
			await screenshotPage.getByRole("button", { name: "Review now" }).waitFor();
		});
	}
	process.stdout.write("Panel passed Chromium interaction, theme, and 320px layout checks.\n");
} finally {
	await browser?.close();
	await new Promise((resolve) => server.close(resolve));
}
