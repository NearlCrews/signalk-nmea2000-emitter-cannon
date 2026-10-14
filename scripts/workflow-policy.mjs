// Pure helpers for scripts/check-workflows.mjs. Workflows are read as text, not
// through a YAML parser, so these rely on the two-space indentation every
// workflow in this repository uses: top-level keys at column 0, jobs and
// triggers at column 2.

const PLAYWRIGHT_ENGINES = ["chromium", "firefox", "webkit"];
const PLAYWRIGHT_MODULE = String.raw`["'](?:@playwright\/test|playwright(?:-core)?)["']`;

/** Return the column-2 children of a top-level key, each mapped to its text. */
function topLevelChildren(workflow, key) {
	const children = new Map();
	let inside = false;
	let current = null;
	for (const line of workflow.split("\n")) {
		if (/^\s*(?:#|$)/.test(line)) {
			if (current !== null) children.get(current).push(line);
			continue;
		}
		if (/^\S/.test(line)) {
			inside = line.startsWith(`${key}:`);
			current = null;
			continue;
		}
		if (!inside) continue;
		const child = /^ {2}([\w-]+):/.exec(line);
		if (child) {
			current = child[1];
			children.set(current, [line]);
		} else if (current !== null) {
			children.get(current).push(line);
		}
	}
	return new Map([...children].map(([name, lines]) => [name, lines.join("\n")]));
}

/** Split a workflow into its jobs, keyed by job id. */
export function workflowJobs(workflow) {
	return topLevelChildren(workflow, "jobs");
}

/** Name the events that trigger a workflow. */
export function workflowTriggers(workflow) {
	const inline = /^on:[ \t]*(\S[^\n#]*)/m.exec(workflow);
	if (inline) {
		return new Set(
			inline[1]
				.replace(/[[\]]/g, "")
				.split(",")
				.map((name) => name.trim())
				.filter(Boolean),
		);
	}
	return new Set(topLevelChildren(workflow, "on").keys());
}

/**
 * Minutes into the UTC week (Sunday 00:00 is 0) of each weekly `cron` schedule
 * in a workflow. A schedule that is not a single weekly time throws, because
 * its place in the week cannot be compared.
 */
export function weeklyCronMinutes(workflow) {
	return [...workflow.matchAll(/^\s*- cron:\s*['"]([^'"]+)['"]/gm)].map(([, cron]) => {
		const weekly = /^(\d{1,2}) (\d{1,2}) \* \* ([0-6])$/.exec(cron.trim());
		if (weekly === null) throw new Error(`schedule "${cron}" is not a single weekly time`);
		const [, minute, hour, day] = weekly.map(Number);
		return day * 1440 + hour * 60 + minute;
	});
}

/** List the npm scripts a command line or script body invokes directly. */
export function npmScriptsInvoked(text) {
	const names = [];
	const command =
		/\bnpm(?:@\S+)?\s+(?:--?[\w-]+\s+)*(?:run(?:-script)?\s+(?:--?[\w-]+\s+)*([\w:.-]+)|(test)\b)/g;
	for (const match of text.matchAll(command)) names.push(match[1] ?? match[2]);
	return names;
}

/** Every npm script reached from a command, through nested runs and pre and post hooks. */
export function reachableScripts(scripts, text) {
	const reached = new Set();
	const pending = npmScriptsInvoked(text);
	while (pending.length > 0) {
		const name = pending.pop();
		if (reached.has(name) || typeof scripts[name] !== "string") continue;
		reached.add(name);
		pending.push(...npmScriptsInvoked(scripts[name]), `pre${name}`, `post${name}`);
	}
	return reached;
}

/**
 * The browser engines a script launches, read from its named Playwright
 * imports. Any other import form hides the engines, so it throws rather than
 * letting the install check pass on a guess.
 */
export function playwrightEngines(source) {
	const named = [
		...source.matchAll(
			new RegExp(String.raw`^import\s*\{([^}]*)\}\s*from\s*${PLAYWRIGHT_MODULE}`, "gm"),
		),
	];
	const all = source.match(
		new RegExp(String.raw`(?:from|import\s*\(|require\s*\()\s*${PLAYWRIGHT_MODULE}`, "g"),
	);
	if ((all?.length ?? 0) !== named.length) {
		throw new Error("import Playwright engines by name so the browser install check can read them");
	}
	const imported = named.flatMap(([, specifiers]) =>
		specifiers.split(",").map((specifier) => specifier.trim().split(/\s+as\s+/)[0]),
	);
	return new Set(PLAYWRIGHT_ENGINES.filter((engine) => imported.includes(engine)));
}

/** The engines a command needs, across every `node scripts/...` file it reaches. */
export function browserEnginesFor(text, scripts, enginesForFile) {
	const sources = [text, ...[...reachableScripts(scripts, text)].map((name) => scripts[name])];
	const engines = new Set();
	for (const source of sources) {
		for (const [, file] of source.matchAll(/\bnode\s+(scripts\/[\w./-]+\.m?js)\b/g)) {
			for (const engine of enginesForFile(file)) engines.add(engine);
		}
	}
	return engines;
}

/** The engines `playwright install` lines provide; no engine argument installs all of them. */
export function installedEngines(text) {
	const engines = new Set();
	for (const [, args] of text.matchAll(/\bplaywright\s+install\b([^\n]*)/g)) {
		const words = args.split(/\s+/).filter((word) => word !== "" && !word.startsWith("-"));
		for (const engine of words.length === 0 ? PLAYWRIGHT_ENGINES : words) {
			if (PLAYWRIGHT_ENGINES.includes(engine)) engines.add(engine);
		}
	}
	return engines;
}

/**
 * Report every workflow job that drives a Playwright suite without installing
 * each engine that suite launches. A job missing WebKit once failed only on CI.
 */
export function browserInstallFailures(workflows, scripts, enginesForFile) {
	const failures = [];
	for (const [path, workflow] of workflows) {
		for (const [job, text] of workflowJobs(workflow)) {
			const installed = installedEngines(text);
			const missing = [...browserEnginesFor(text, scripts, enginesForFile)]
				.filter((engine) => !installed.has(engine))
				.sort();
			if (missing.length > 0) {
				failures.push(
					`${path} job ${job} runs a Playwright suite but does not install ${missing.join(", ")}.`,
				);
			}
		}
	}
	return failures;
}
