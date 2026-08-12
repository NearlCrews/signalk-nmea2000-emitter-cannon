// Count-plus-noun formatter: "1 error", "0 errors", "3 matches". Pluralizes
// with "es" for sibilant endings (match, box) and a plain "s" otherwise, which
// covers every word the panel pluralizes. Note 0 takes the plural form.
export function plural(n: number, word: string): string {
	if (n === 1) return `1 ${word}`;
	const es = /(?:s|x|z|ch|sh)$/.test(word);
	return `${n} ${word}${es ? "es" : "s"}`;
}
