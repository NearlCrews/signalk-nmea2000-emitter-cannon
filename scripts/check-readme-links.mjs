import { readFile } from "node:fs/promises";
import { relativeLinkTargets } from "./doc-links.mjs";

const findings = relativeLinkTargets(await readFile("README.md", "utf8"));

if (findings.length > 0) {
	console.error(
		findings
			.map(
				({ line, target }) =>
					`README.md:${line} links to "${target}", which is dead in the Signal K App Store. ` +
					"Use an absolute https URL or plain text.",
			)
			.join("\n"),
	);
	process.exit(1);
}

process.stdout.write("README.md has no relative link targets.\n");
