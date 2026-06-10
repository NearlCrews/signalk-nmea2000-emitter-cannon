// Humanize an age in milliseconds as a short "Xs ago" / "Xm ago" / "Xh ago" /
// "Xd ago" string. The status snapshot already reports ages (the snapshot's
// own clock minus the event time) for `lastEmitMs` and `lastErrorAgeMs`, so
// callers pass those values straight through without any local `Date.now()`
// arithmetic. Returns "unknown" for a missing, non-finite, or negative age so
// the caller can decide whether to render it.
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
