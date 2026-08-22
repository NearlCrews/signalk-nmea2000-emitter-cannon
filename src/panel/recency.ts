import type { FormatRelativeAgeOptions } from "signalk-nearlcrews-ui";

// Count-plus-noun formatter: "1 error", "0 errors", "3 matches". Pluralizes
// with "es" for sibilant endings (match, box) and a plain "s" otherwise, which
// covers every word the panel pluralizes. Note 0 takes the plural form.
export function plural(n: number, word: string): string {
	if (n === 1) return `1 ${word}`;
	const es = /(?:s|x|z|ch|sh)$/.test(word);
	return `${n} ${word}${es ? "es" : "s"}`;
}

/**
 * Shared options for every formatRelativeAge call in the panel. The library
 * default is narrow and always numeric, which renders a fresh timestamp as
 * "0 sec. ago"; the family convention is words. One constant so the six call
 * sites cannot drift into two different wordings.
 */
export const RELATIVE_AGE_FORMAT: FormatRelativeAgeOptions = {
	numeric: "auto",
	style: "long",
};
