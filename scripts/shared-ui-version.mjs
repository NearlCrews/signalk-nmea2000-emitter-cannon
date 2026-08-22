import { readFileSync } from "node:fs";

/**
 * The exact signalk-nearlcrews-ui release this panel is built and verified
 * against. The shared UI ships breaking changes in minor releases, so an
 * unreviewed dependency bump must fail the panel checks rather than reach a
 * build: bumping the dependency means bumping this constant too, after working
 * through the package's migration notes.
 */
const EXPECTED_SHARED_UI_VERSION = "0.8.2";

/** A bare version: three numeric parts, no range operator, prerelease, or build suffix. */
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * Asserts that a version is written as an exact one. This is deliberately
 * separate from the equality check below, because the two catch different
 * mistakes and the obvious repair for one of them defeats the other: after
 * `npm install signalk-nearlcrews-ui@latest` rewrites the manifest to a range,
 * pasting the reported value into the constant makes an equality-only check
 * pass again while its message still claims the pin is exact. A range fails
 * this assertion whichever side it is written on, so the constant stays a
 * deliberate-bump tripwire rather than somewhere to park a failing value.
 */
export function assertExactVersion(version, source) {
	if (typeof version !== "string" || !EXACT_VERSION.test(version)) {
		throw new Error(
			`signalk-nearlcrews-ui in ${source} must be an exact version such as 1.2.3, got ${String(version)}`,
		);
	}
	return version;
}

/**
 * Asserts that the manifest pin and the installed package both match the
 * expected release. Returns the resolved version, which the panel checks also
 * assert against the rendered `data-snui-version` root attribute.
 */
export function assertSharedUiVersion(repositoryUrl) {
	assertExactVersion(EXPECTED_SHARED_UI_VERSION, "scripts/shared-ui-version.mjs");
	const packageJson = JSON.parse(readFileSync(new URL("package.json", repositoryUrl), "utf8"));
	const manifestVersion = packageJson.devDependencies?.["signalk-nearlcrews-ui"];
	assertExactVersion(manifestVersion, "package.json");
	if (manifestVersion !== EXPECTED_SHARED_UI_VERSION) {
		throw new Error(
			`package.json pins signalk-nearlcrews-ui ${manifestVersion}, but this panel is verified against ${EXPECTED_SHARED_UI_VERSION}; bump the constant deliberately, after working through the release's migration notes`,
		);
	}
	const installedVersion = JSON.parse(
		readFileSync(new URL("node_modules/signalk-nearlcrews-ui/package.json", repositoryUrl), "utf8"),
	).version;
	if (installedVersion !== manifestVersion) {
		throw new Error(
			`installed signalk-nearlcrews-ui ${String(installedVersion)} does not match package.json ${manifestVersion}`,
		);
	}
	return installedVersion;
}
