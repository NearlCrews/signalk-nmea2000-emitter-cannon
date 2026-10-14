import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pluginBundlePackages } from "./plugin-bundle-packages.mjs";
import { sharedUiVersion } from "./shared-ui-version.mjs";

/**
 * The panel remote bundles its dependency tree into public/*.js, so the
 * published package redistributes that code. MIT requires the copyright and
 * permission notice to travel with a copy, and Apache-2.0 section 4(a)
 * requires giving recipients the license. Terser only extracts comments that
 * carry an @license or @preserve marker, and most of this tree ships none, so
 * the emitted sidecar alone does not discharge either obligation.
 *
 * The plugin bundle dist/index.mjs inlines whatever it imports except rxjs,
 * which stays external and reaches the user through npm with its own license.
 * Its inlined packages are read from an esbuild metafile of the exact
 * build:plugin command, so a new import is attributed without a hand list.
 *
 * Run `npm run licenses` to regenerate. `--check` verifies the committed file
 * still matches the tree without paying for a second webpack build; the plugin
 * bundle is cheap to rebuild, so the check confirms every package it inlines.
 */

const repositoryDir = new URL("../", import.meta.url);
const noticesUrl = new URL("THIRD_PARTY_NOTICES.md", repositoryDir);
const checkOnly = process.argv.includes("--check");

const HEADER_MARKER = "<!-- generated-for-signalk-nearlcrews-ui:";
const PANEL = "the configuration panel (`public/*.js`)";
const PLUGIN = "the plugin (`dist/index.mjs`)";
const packageJson = JSON.parse(readFileSync(new URL("package.json", repositoryDir), "utf8"));
const pluginPackages = () =>
	pluginBundlePackages(packageJson.scripts["build:plugin"], new URL(".", repositoryDir).pathname);

/** Ask webpack which packages it actually bundles, rather than guessing. */
function bundledPackageNames() {
	const result = spawnSync(
		process.execPath,
		["node_modules/webpack-cli/bin/cli.js", "--config", "webpack.config.cjs", "--json"],
		{ cwd: new URL(".", repositoryDir).pathname, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
	);
	if (result.status !== 0) {
		process.stderr.write(result.stderr ?? "");
		throw new Error("webpack did not produce a module list");
	}
	const stats = JSON.parse(result.stdout);
	const names = new Set();
	// Recurse rather than reading the top level only. Module concatenation nests
	// the records it merged, and those nested entries can carry a package the
	// outer record does not name. A top-level walk happens to find everything in
	// this build, verified by comparing the two, but silent under-attribution is
	// exactly the failure this file exists to prevent, so it should not depend on
	// the optimizer's shape.
	const collect = (modules) => {
		for (const module of modules ?? []) {
			const match = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(module.name ?? "");
			if (match?.[1]) names.add(match[1]);
			collect(module.modules);
			collect(module.children);
		}
	};
	collect(stats.modules);
	// webpack templates its own runtime into every emitted bundle (the chunk
	// loader, the share-scope consume logic, and the container bootstrap), so its
	// code really is redistributed here. Those records are moduleType "runtime"
	// and carry no node_modules path, so no walk over the module list can find
	// them. Named explicitly instead.
	names.add("webpack");
	return [...names].sort();
}

function licenseTextFor(name) {
	for (const candidate of ["LICENSE", "license", "LICENSE.md", "LICENSE.txt"]) {
		const url = new URL(`node_modules/${name}/${candidate}`, repositoryDir);
		if (existsSync(url)) return readFileSync(url, "utf8").trim();
	}
	return null;
}

function licenseIdFor(name) {
	const manifest = JSON.parse(
		readFileSync(new URL(`node_modules/${name}/package.json`, repositoryDir), "utf8"),
	);
	return typeof manifest.license === "string" ? manifest.license : "see below";
}

function render(placements) {
	const sections = [...placements.keys()].sort().map((name) => {
		const id = licenseIdFor(name);
		const text = licenseTextFor(name);
		const body =
			text === null
				? `This package ships no license file. Its manifest declares ${id}.`
				: `\`\`\`text\n${text}\n\`\`\``;
		const where = placements.get(name).join(" and ");
		return `## ${name}\n\nLicense: ${id}\n\nBundled in ${where}.\n\n${body}`;
	});
	return [
		"# Third-party notices",
		"",
		`${HEADER_MARKER}${sharedUiVersion} -->`,
		"",
		// One element per PARAGRAPH, not per source line: the join below puts a
		// blank line between elements, so a line-per-element shape would render
		// every wrapped line as its own one-line paragraph.
		"The configuration panel is a Module Federation remote bundled into " +
			"`public/*.js`, and the plugin itself is bundled into `dist/index.mjs`, so " +
			"the packages below are redistributed with this plugin. Each section names " +
			"the bundle that carries it, and the licenses follow. Regenerate with " +
			"`npm run licenses` after any change to either dependency tree.",
		"React and React DOM are supplied by the Signal K admin host as singletons and " +
			"are not bundled here; the React entry that does appear is the JSX runtime. " +
			"rxjs stays external to the plugin bundle and installs from npm with its own " +
			"license.",
		...sections,
	]
		.join("\n\n")
		.replace(/[ \t]+$/gm, "")
		.replace(/\n{3,}/g, "\n\n");
}

if (checkOnly) {
	if (!existsSync(noticesUrl)) {
		throw new Error("THIRD_PARTY_NOTICES.md is missing; run npm run licenses");
	}
	const current = readFileSync(noticesUrl, "utf8");
	if (!current.includes(`${HEADER_MARKER}${sharedUiVersion} -->`)) {
		throw new Error(
			`THIRD_PARTY_NOTICES.md was generated for a different signalk-nearlcrews-ui than ${sharedUiVersion}; run npm run licenses`,
		);
	}
	// Every package the file names must still resolve with the license it claims,
	// which catches a relicense or a removal without paying for a webpack build.
	const listed = [...current.matchAll(/^## (\S+)$/gm)].map((match) => match[1]);
	if (listed.length === 0) throw new Error("THIRD_PARTY_NOTICES.md lists no packages");
	for (const name of listed) {
		if (!existsSync(new URL(`node_modules/${name}/package.json`, repositoryDir))) {
			throw new Error(`THIRD_PARTY_NOTICES.md names ${name}, which is no longer installed`);
		}
		const declared = licenseIdFor(name);
		if (!current.includes(`## ${name}\n\nLicense: ${declared}\n`)) {
			throw new Error(`${name} now declares ${declared}; run npm run licenses`);
		}
	}
	// The plugin bundle rebuilds in well under a second, so confirm every package
	// it inlines today is attributed to it.
	for (const name of pluginPackages()) {
		const section = current.split(`\n## ${name}\n`)[1]?.split("\n## ")[0] ?? "";
		if (!section.includes(PLUGIN)) {
			throw new Error(
				`${name} is inlined into dist/index.mjs but not attributed; run npm run licenses`,
			);
		}
	}
	process.stdout.write(`Third-party notices cover ${listed.length} bundled packages.\n`);
} else {
	const placements = new Map();
	const place = (names, bundle) => {
		for (const name of names) placements.set(name, [...(placements.get(name) ?? []), bundle]);
	};
	const panelNames = bundledPackageNames();
	if (panelNames.length === 0) throw new Error("webpack reported no bundled packages");
	place(panelNames, PANEL);
	place(pluginPackages(), PLUGIN);
	writeFileSync(noticesUrl, `${render(placements)}\n`);
	process.stdout.write(`Wrote THIRD_PARTY_NOTICES.md for ${placements.size} bundled packages.\n`);
}
