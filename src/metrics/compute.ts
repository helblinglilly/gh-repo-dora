import type {
  ClosedIssue,
  Inputs,
  MergedPr,
  Period,
  Summary,
  WeekPoint,
} from "./types";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** The window of `weeks` whole weeks ending at `end`, and the equal window just before it. */
export function periods(
  weeks: number,
  end: number,
): { current: Period; previous: Period } {
  const start = end - weeks * WEEK_MS;
  return {
    current: { start, end },
    previous: { start: start - weeks * WEEK_MS, end: start },
  };
}

export function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

/** Linear-interpolated percentile, p in [0, 1]. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const low = sorted[lower] as number;
  const high = sorted[upper] as number;
  return low + (high - low) * (rank - lower);
}

const inPeriod = (t: number, p: Period) => t >= p.start && t < p.end;

/** Hours from a PR's first commit to its merge. Rebased history can put the commit after the merge, so clamp at 0. */
export function leadTimeHours(pr: MergedPr): number {
  return Math.max(0, (pr.mergedAt - pr.firstCommitAt) / HOUR_MS);
}

export function restoreHours(issue: ClosedIssue): number {
  return Math.max(0, (issue.closedAt - issue.createdAt) / HOUR_MS);
}

/** A merged PR counts as a failure fix if it reverts, hotfixes, or carries one of the failure labels. */
export function isFailureFix(pr: MergedPr, failureLabels: string[]): boolean {
  const wanted = new Set(
    failureLabels.map((l) => l.trim().toLowerCase()).filter(Boolean),
  );
  if (pr.labels.some((l) => wanted.has(l.toLowerCase()))) return true;
  if (/^\s*(revert|hotfix)\b/i.test(pr.title)) return true;
  return /^(revert|hotfix)[-/]/i.test(pr.headRefName);
}

export function summarise(inputs: Inputs, period: Period): Summary {
  const weeks = (period.end - period.start) / WEEK_MS;
  const deployments = inputs.deployments.filter((t) =>
    inPeriod(t, period),
  ).length;
  const prs = inputs.prs.filter((pr) => inPeriod(pr.mergedAt, period));
  const incidents = inputs.incidents.filter((i) =>
    inPeriod(i.closedAt, period),
  );
  const leadTimes = prs.map(leadTimeHours);
  const failedChanges = prs.filter((pr) =>
    isFailureFix(pr, inputs.failureLabels),
  ).length;

  return {
    deployments,
    deploymentsPerWeek: deployments / weeks,
    leadTimeMedianHours: median(leadTimes),
    leadTimeP90Hours: percentile(leadTimes, 0.9),
    leadTimeCount: leadTimes.length,
    failedChanges,
    mergedChanges: prs.length,
    changeFailureRate: prs.length === 0 ? null : failedChanges / prs.length,
    restoreMedianHours: median(incidents.map(restoreHours)),
    restoreCount: incidents.length,
  };
}

/** One point per 7-day bucket across the period. Buckets with no data report null so charts leave a gap. */
export function weeklySeries(inputs: Inputs, period: Period): WeekPoint[] {
  const count = Math.round((period.end - period.start) / WEEK_MS);
  const bucketOf = (t: number) => Math.floor((t - period.start) / WEEK_MS);

  const points: WeekPoint[] = Array.from({ length: count }, (_, i) => ({
    weekStart: period.start + i * WEEK_MS,
    deployments: 0,
    leadTimeMedianHours: null,
    leadTimeCount: 0,
    changeFailureRate: null,
    failedChanges: 0,
    mergedChanges: 0,
    restoreMedianHours: null,
    restoreCount: 0,
  }));

  for (const t of inputs.deployments) {
    if (inPeriod(t, period)) (points[bucketOf(t)] as WeekPoint).deployments++;
  }

  const leadTimes: number[][] = points.map(() => []);
  for (const pr of inputs.prs) {
    if (!inPeriod(pr.mergedAt, period)) continue;
    const i = bucketOf(pr.mergedAt);
    const point = points[i] as WeekPoint;
    point.mergedChanges++;
    if (isFailureFix(pr, inputs.failureLabels)) point.failedChanges++;
    (leadTimes[i] as number[]).push(leadTimeHours(pr));
  }

  const restores: number[][] = points.map(() => []);
  for (const issue of inputs.incidents) {
    if (inPeriod(issue.closedAt, period))
      (restores[bucketOf(issue.closedAt)] as number[]).push(
        restoreHours(issue),
      );
  }

  points.forEach((point, i) => {
    const lead = leadTimes[i] as number[];
    const restore = restores[i] as number[];
    point.leadTimeMedianHours = median(lead);
    point.leadTimeCount = lead.length;
    point.changeFailureRate =
      point.mergedChanges === 0
        ? null
        : point.failedChanges / point.mergedChanges;
    point.restoreMedianHours = median(restore);
    point.restoreCount = restore.length;
  });

  return points;
}

/**
 * Least-squares line through the non-null values, evaluated at every index so the trend
 * draws as one continuous line. Returns all nulls when fewer than two points exist.
 */
export function trendLine(values: (number | null)[]): (number | null)[] {
  const known = values.flatMap((v, x) => (v === null ? [] : [{ x, y: v }]));
  if (known.length < 2) return values.map(() => null);

  const n = known.length;
  const meanX = known.reduce((s, p) => s + p.x, 0) / n;
  const meanY = known.reduce((s, p) => s + p.y, 0) / n;
  const covariance = known.reduce(
    (s, p) => s + (p.x - meanX) * (p.y - meanY),
    0,
  );
  const variance = known.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  const slope = variance === 0 ? 0 : covariance / variance;
  const intercept = meanY - slope * meanX;
  return values.map((_, x) => intercept + slope * x);
}
