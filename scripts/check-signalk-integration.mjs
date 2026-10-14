import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { chromiumLaunchOptions } from "./chromium-launch.mjs";

// Runs against a live Signal K server with this package installed from the
// packed release tarball (the signalk-admin job in .github/workflows/ci.yml sets
// one up). It proves what the fixture checks cannot: that server's own Admin
// application loads the production remote through its own share scope and
// mounts the configuration panel.
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const rawBaseUrl = process.env.SIGNALK_URL;
assert.ok(rawBaseUrl, "SIGNALK_URL must identify the running Signal K server");
const baseUrl = new URL(rawBaseUrl);

async function requestText(path) {
	const response = await fetch(new URL(path, baseUrl), {
		headers: { accept: "text/html,application/javascript,application/json" },
		signal: AbortSignal.timeout(10_000),
	});
	assert.equal(response.ok, true, `${path} returned HTTP ${response.status}`);
	return response.text();
}

const plugins = JSON.parse(await requestText("/skServer/plugins"));
assert.ok(Array.isArray(plugins), "the Signal K plugin list was not an array");
assert.ok(
	plugins.some((plugin) => plugin?.packageName === pkg.name || plugin?.id === pkg.name),
	`${pkg.name} was absent from the running Signal K plugin list`,
);

const remotePath = `/${pkg.name}/remoteEntry.js`;
const safeName = pkg.name.replace(/[-@/]/g, "_");
const remote = await requestText(remotePath);
assert.match(
	remote,
	new RegExp(`\\b${safeName}\\b`),
	"the served panel remote did not expose its classic global name",
);
assert.doesNotMatch(
	remote,
	/jsxDEV|jsx-dev-runtime/,
	"the served panel remote used the React development JSX runtime",
);

const browser = await chromium.launch(chromiumLaunchOptions());
try {
	const page = await browser.newPage();
	const pageErrors = [];
	const consoleErrors = [];
	page.on("pageerror", (error) => pageErrors.push(error.message));
	page.on("console", (message) => {
		if (message.type() === "error") consoleErrors.push(message.text());
	});
	const adminUrl = new URL(
		`/admin/#/serverConfiguration/plugins/${encodeURIComponent(pkg.name)}`,
		baseUrl,
	);
	await page.goto(adminUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
	// The same button scripts/check-panel-browser.mjs and test:panel anchor on.
	// Exact, because a fresh configuration also shows the first-run callout's
	// "Open setup wizard" button once the catalog loads.
	try {
		await page
			.getByRole("button", { name: "Setup wizard", exact: true })
			.waitFor({ state: "visible", timeout: 30_000 });
	} catch (error) {
		// A strict share on a host that under-reports React lands here, with the
		// "Unsatisfied version" error in the console.
		throw new Error(
			`the production panel did not mount in Signal K Admin: ${String(error).split("\n")[0]}\n` +
				`Page errors: ${pageErrors.join(" | ") || "none"}\n` +
				`Console errors: ${consoleErrors.join(" | ") || "none"}`,
		);
	}

	assert.ok(
		(await page.locator("[data-snui-version]").count()) > 0,
		"the mounted panel did not render signalk-nearlcrews-ui",
	);
	for (const fallback of ["Plugin Configuration Unavailable", "Error loading component"]) {
		assert.equal(
			await page.getByText(fallback, { exact: true }).count(),
			0,
			`the Admin host displayed "${fallback}"`,
		);
	}

	const container = await page.evaluate((name) => {
		const candidate = window[name];
		return {
			hasGet: typeof candidate?.get === "function",
			hasInit: typeof candidate?.init === "function",
			scripts: [...document.querySelectorAll('script[src$="/remoteEntry.js"]')].map((script) =>
				script.getAttribute("src"),
			),
		};
	}, safeName);
	assert.deepEqual(
		{ hasGet: container.hasGet, hasInit: container.hasInit },
		{ hasGet: true, hasInit: true },
		"the Admin page did not execute the production Module Federation container",
	);
	assert.ok(
		container.scripts.includes(remotePath),
		"the Admin page did not load the expected remote script",
	);
	assert.deepEqual(pageErrors, [], "the Admin page reported uncaught errors");
} finally {
	await browser.close();
}

process.stdout.write(
	`Signal K Admin mounted the installed ${pkg.name} production panel at ${baseUrl.origin}.\n`,
);
