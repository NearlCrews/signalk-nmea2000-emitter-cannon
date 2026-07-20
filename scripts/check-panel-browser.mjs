import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { build } from "esbuild";

const repositoryDir = new URL("../", import.meta.url);
const publicDir = new URL("../public/", import.meta.url);
const pluginPrefix = "/plugins/signalk-nmea2000-emitter-cannon/";
const vesselTripDescription =
	"Fuel range is an estimate, not a voyage-planning or safety value. Configure every fuel tank and propulsion consumer; other consumers, unusable reserve, cross-feed limits, weather, and tide are not included. Raymarine also requires Fuel Manager setup, fuel data from PGN 127489 or 127497, and PGN 129026 with GNSS for distance. Current Garmin documentation does not list PGN 127496.";

const meta = [
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
];

const configuration = {
	globalResendInterval: 5,
	conversions: {
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
	},
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
    configuration: ${JSON.stringify(configuration)},
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
		json(response, {
			pluginRunning: true,
			nmea2000Ready: true,
			enabledCount: 4,
			totalConversions: 4,
			perConversion: meta.map(({ key, title }) => ({
				key,
				title,
				enabled: true,
				emitCount: 1,
				lastEmitMs: 1000,
			})),
			startTime: Date.now() - 60_000,
		});
		return;
	}
	if (url.pathname === `${pluginPrefix}api/advisor/pending`) {
		json(response, { result: { autoApplied: [], pending: [], notes: [] } });
		return;
	}
	if (url.pathname === `${pluginPrefix}api/sources`) {
		json(response, { sources: [] });
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
		if (message.type() === "error") errors.push(message.text());
	});

	await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: "networkidle" });
	const root = page.locator('[data-snui-version="0.3.0"]');
	await root.waitFor();
	await page.getByRole("tab", { name: /Electrical/ }).click();
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
	await page.getByLabel("Signal K fuel tank path").fill("tanks.fuel.reserve_1");
	await page.getByLabel("Signal K engine id").fill("port");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	const saveResult = await page.evaluate(() => ({
		count: globalThis.__panelSaveCount,
		configuration: globalThis.__panelSavedConfiguration,
	}));
	if (saveResult.count !== 1) throw new Error(`expected one save, got ${saveResult.count ?? 0}`);
	const savedAc = saveResult.configuration?.conversions?.AC_STATUS?.extras?.acSources;
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
	const savedFuelTanks = saveResult.configuration?.conversions?.VESSEL_TRIP?.extras?.fuelTanks;
	if (savedFuelTanks?.length !== 1 || savedFuelTanks[0]?.signalkPath !== "tanks.fuel.reserve_1") {
		throw new Error("vessel trip fuel-tank changes were not saved");
	}
	const savedEngines = saveResult.configuration?.conversions?.VESSEL_TRIP?.extras?.engines;
	if (savedEngines?.length !== 1 || savedEngines[0]?.signalkId !== "port") {
		throw new Error("vessel trip engine changes were not saved");
	}
	if (errors.length > 0) throw new Error(`browser errors:\n${errors.join("\n")}`);
	process.stdout.write("Panel passed Chromium interaction, theme, and 320px layout checks.\n");
} finally {
	await browser?.close();
	await new Promise((resolve) => server.close(resolve));
}
