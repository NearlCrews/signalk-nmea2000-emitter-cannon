import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { normalizePackReport } from "./package-report.mjs";

const npm = process.env.npm_execpath ?? (process.platform === "win32" ? "npm.cmd" : "npm");
const command = npm.endsWith(".js") ? process.execPath : npm;
const commandArgs = npm.endsWith(".js")
	? [npm, "pack", "--dry-run", "--ignore-scripts", "--json"]
	: ["pack", "--dry-run", "--ignore-scripts", "--json"];
const result = spawnSync(command, commandArgs, {
	encoding: "utf8",
});

if (result.status !== 0) {
	process.stderr.write(result.stderr);
	process.exit(result.status ?? 1);
}

const parsedReport = JSON.parse(result.stdout);
const report = normalizePackReport(parsedReport);

const paths = new Set(report.files.map((file) => file.path));
const required = [
	"CHANGELOG.md",
	"LICENSE",
	"README.md",
	"assets/icons/icon-72.png",
	"assets/icons/icon-96.png",
	"assets/icons/icon-192.png",
	"assets/icons/icon-512.png",
	"assets/icons/icon.svg",
	"assets/screenshots/config-advisor.png",
	"assets/screenshots/config-panel.png",
	"assets/screenshots/environment-conversions.png",
	"dist/index.mjs",
	"package.json",
	"public/remoteEntry.js",
];
const missing = required.filter((path) => !paths.has(path));
const forbidden = [...paths].filter(
	(path) =>
		path.endsWith(".map") ||
		path.startsWith("coverage/") ||
		path.startsWith("scripts/") ||
		path.startsWith("src/") ||
		path.startsWith("temp/") ||
		path.startsWith("tmp/"),
);
const hasPanelChunk = [...paths].some((path) => /^public\/\d+\.js$/.test(path));
const unexpectedPanelBundles = [...paths].filter(
	(path) =>
		path.startsWith("public/") &&
		path.endsWith(".js") &&
		path !== "public/remoteEntry.js" &&
		!/^public\/\d+\.js$/.test(path),
);

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
if (packageJson.dependencies?.["signalk-nearlcrews-ui"]) {
	throw new Error("signalk-nearlcrews-ui must be a bundled development dependency");
}
const sharedUiVersion = packageJson.devDependencies?.["signalk-nearlcrews-ui"];
if (typeof sharedUiVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(sharedUiVersion)) {
	throw new Error("signalk-nearlcrews-ui must be pinned to an exact version");
}

if (
	missing.length > 0 ||
	forbidden.length > 0 ||
	unexpectedPanelBundles.length > 0 ||
	!hasPanelChunk
) {
	if (missing.length > 0) console.error(`Missing package files: ${missing.join(", ")}`);
	if (forbidden.length > 0) console.error(`Forbidden package files: ${forbidden.join(", ")}`);
	if (unexpectedPanelBundles.length > 0) {
		console.error(`Unexpected panel bundles: ${unexpectedPanelBundles.join(", ")}`);
	}
	if (!hasPanelChunk) console.error("Missing generated panel chunk.");
	process.exit(1);
}

process.stdout.write(
	`Package contents verified: ${report.entryCount} files, ${report.unpackedSize} bytes.\n`,
);
