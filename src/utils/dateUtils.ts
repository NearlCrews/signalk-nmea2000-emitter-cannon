export function toN2KDate(date: Date = new Date()): number {
	return Math.trunc(date.getTime() / 86400 / 1000);
}

export function toN2KTime(date: Date = new Date()): number {
	return (
		date.getUTCHours() * 3600 +
		date.getUTCMinutes() * 60 +
		date.getUTCSeconds() +
		date.getUTCMilliseconds() / 1000
	);
}

export function toN2KDateTime(date: Date = new Date()): {
	date: number;
	time: number;
} {
	return {
		date: toN2KDate(date),
		time: toN2KTime(date),
	};
}
