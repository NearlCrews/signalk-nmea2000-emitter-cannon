// Humanize an age in milliseconds as a short "Xs ago" / "Xm ago" / "Xh ago" /
// "Xd ago" string. The status snapshot already reports ages (the snapshot's
// own clock minus the event time) for `lastEmitMs` and `lastErrorAgeMs`, so
// callers pass those values straight through without any local `Date.now()`
// arithmetic. Returns "unknown" for a missing, non-finite, or negative age so
// the caller can decide whether to render it.
// Count-plus-noun formatter: "1 error", "0 errors", "3 matches". Pluralizes
// with "es" for sibilant endings (match, box) and a plain "s" otherwise, which
// covers every word the panel pluralizes. Note 0 takes the plural form.
export function plural(n: number, word: string): string {
	if (n === 1) return `1 ${word}`;
	const es = /(?:s|x|z|ch|sh)$/.test(word);
	return `${n} ${word}${es ? "es" : "s"}`;
}

export function humanizeAgo(ageMs: number | undefined): string {
	if (ageMs === undefined || !Number.isFinite(ageMs) || ageMs < 0) {
		return "unknown";
	}
	const seconds = Math.round(ageMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}
