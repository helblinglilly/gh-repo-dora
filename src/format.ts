export function formatHours(hours: number | null): string {
  if (hours === null) return "–";
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export function formatPercent(ratio: number | null): string {
  return ratio === null ? "–" : `${(ratio * 100).toFixed(1)}%`;
}

export function formatPerWeek(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)} / week`;
}

/** Day and month in UTC, so a week's label does not shift with the viewer's timezone. */
export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
