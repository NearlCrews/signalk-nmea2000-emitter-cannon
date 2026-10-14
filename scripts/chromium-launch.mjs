import { existsSync } from "node:fs";

const systemChromium = "/usr/bin/chromium";

/**
 * Launch options for Chromium: an explicit PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
 * first, then the system Chromium where one is installed, then Playwright's own
 * download.
 */
export function chromiumLaunchOptions() {
	const executablePath =
		process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
		(existsSync(systemChromium) ? systemChromium : undefined);
	return { headless: true, ...(executablePath === undefined ? {} : { executablePath }) };
}
