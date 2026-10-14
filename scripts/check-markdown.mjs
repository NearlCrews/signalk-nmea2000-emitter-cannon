import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { lint, readConfig } from "markdownlint/promise";

// Lints the maintained Markdown with the markdownlint library, called directly.
// Its command-line wrapper exists to expand globs, and its glob stack carried a
// development-only advisory with no fixed release (GHSA-vfj7-8cjw-p6xm, in
// braces). The scope needs no glob: the root files, the .github guides, and
// every guide under docs/ except docs/decisions/, whose dated design memos are
// historical records kept as written.
const root = fileURLToPath(new URL("..", import.meta.url));
const HISTORICAL = "docs/decisions/";

function markdownFiles(directory, recursive) {
	return readdirSync(join(root, directory), { recursive, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

const files = [
	...markdownFiles(".", false),
	...markdownFiles(".github", false),
	...markdownFiles("docs", true),
]
	.filter((path) => !path.startsWith(HISTORICAL))
	.sort();

const config = await readConfig(join(root, ".markdownlint.json"));
const results = await lint({ config, files: files.map((path) => join(root, path)) });
const failures = files.flatMap((path) =>
	results[join(root, path)]
		.toSorted((left, right) => left.lineNumber - right.lineNumber)
		.map((issue) => {
			const detail = issue.errorDetail ?? issue.errorContext;
			return `${path}:${issue.lineNumber} ${issue.ruleNames.join("/")} ${issue.ruleDescription}${detail ? ` [${detail}]` : ""}`;
		}),
);

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

process.stdout.write(`Markdown lint passed for ${files.length} files.\n`);
