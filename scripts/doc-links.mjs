// The Signal K App Store renders README link targets unmodified and rewrites
// only image paths against the package CDN, so a relative link that works on
// GitHub and npm is dead there. Relative images stay allowed for that reason.
const ALLOWED_TARGET = /^(?:https?:|mailto:|#)/i;

// Blank fenced blocks and inline code spans, keeping every newline so reported
// line numbers still match the file. A link written as an example inside code
// is not a link.
function blankCode(markdown) {
	const blank = (code) => code.replace(/[^\n]/g, " ");
	return markdown
		.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, blank)
		.replace(/(`+)[^\n]*?\1/g, blank);
}

function openingBracket(text, closeIndex) {
	let depth = 0;
	for (let index = closeIndex; index >= 0; index--) {
		if (text[index] === "]") depth++;
		else if (text[index] === "[" && --depth === 0) return index;
	}
	return -1;
}

/**
 * List every link target in a Markdown document that is not an absolute URL, a
 * mailto address, or an in-page anchor: inline links, reference definitions,
 * and HTML anchors. Inline and HTML images are not links and are skipped.
 */
export function relativeLinkTargets(markdown) {
	const text = blankCode(markdown);
	const lineOf = (index) => text.slice(0, index).split("\n").length;
	const findings = [];
	const check = (target, index) => {
		if (!ALLOWED_TARGET.test(target)) findings.push({ line: lineOf(index), target });
	};

	for (const match of text.matchAll(/\]\(\s*<?([^)\s>]*)/g)) {
		const open = openingBracket(text, match.index);
		if (open > 0 && text[open - 1] === "!") continue;
		check(match[1], match.index);
	}
	for (const match of text.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*<?([^\s>]+)/gm)) {
		check(match[1], match.index);
	}
	for (const match of text.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1/gi)) {
		check(match[2], match.index);
	}

	return findings.sort((left, right) => left.line - right.line);
}
