import { describe, expect, it } from "vitest";
import {
  isFailureFix,
  leadTimeHours,
  median,
  percentile,
  periods,
  summarise,
  trendLine,
  WEEK_MS,
  weeklySeries,
} from "./compute";
import type { ClosedIssue, Inputs, MergedPr } from "./types";

const HOUR = 60 * 60 * 1000;
const END = Date.UTC(2026, 10, 20);

const pr = (over: Partial<MergedPr> & { mergedAt: number }): MergedPr => ({
  number: 1,
  title: "Add thing",
  url: "https://example.test/1",
  headRefName: "feature/thing",
  labels: [],
  firstCommitAt: over.mergedAt - 10 * HOUR,
  ...over,
});

const incident = (createdAt: number, closedAt: number): ClosedIssue => ({
  number: 1,
  title: "Outage",
  url: "https://example.test/i/1",
  createdAt,
  closedAt,
});

const inputs = (over: Partial<Inputs> = {}): Inputs => ({
  prs: [],
  deployments: [],
  incidents: [],
  failureLabels: ["hotfix"],
  ...over,
});

describe("median and percentile", () => {
  it("returns null for no values", () => {
    expect(median([])).toBeNull();
  });

  it("takes the middle of an odd list and the mean of the middle two of an even list", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("interpolates between ranks", () => {
    expect(percentile([0, 10], 0.9)).toBe(9);
  });
});

describe("periods", () => {
  it("returns the current window and the equal one before it", () => {
    const { current, previous } = periods(4, END);
    expect(current).toEqual({ start: END - 4 * WEEK_MS, end: END });
    expect(previous).toEqual({
      start: END - 8 * WEEK_MS,
      end: END - 4 * WEEK_MS,
    });
  });
});

describe("leadTimeHours", () => {
  it("measures first commit to merge", () => {
    expect(
      leadTimeHours(pr({ mergedAt: END, firstCommitAt: END - 36 * HOUR })),
    ).toBe(36);
  });

  it("clamps negative durations from rewritten history to zero", () => {
    expect(
      leadTimeHours(pr({ mergedAt: END, firstCommitAt: END + HOUR })),
    ).toBe(0);
  });
});

describe("isFailureFix", () => {
  it("matches revert and hotfix titles and branches", () => {
    expect(
      isFailureFix(pr({ mergedAt: END, title: 'Revert "Add thing"' }), []),
    ).toBe(true);
    expect(
      isFailureFix(pr({ mergedAt: END, title: "hotfix: null check" }), []),
    ).toBe(true);
    expect(
      isFailureFix(
        pr({ mergedAt: END, headRefName: "revert-123-add-thing" }),
        [],
      ),
    ).toBe(true);
    expect(
      isFailureFix(pr({ mergedAt: END, headRefName: "hotfix/login" }), []),
    ).toBe(true);
  });

  it("matches configured labels case-insensitively", () => {
    expect(
      isFailureFix(pr({ mergedAt: END, labels: ["Rollback"] }), [" rollback "]),
    ).toBe(true);
  });

  it("does not match words that merely start with the keyword", () => {
    expect(
      isFailureFix(
        pr({ mergedAt: END, title: "Reverting is hard to spell" }),
        [],
      ),
    ).toBe(false);
    expect(
      isFailureFix(pr({ mergedAt: END, title: "Add thing" }), ["hotfix"]),
    ).toBe(false);
  });
});

describe("summarise", () => {
  const { current } = periods(4, END);

  it("counts only events inside the period", () => {
    const summary = summarise(
      inputs({ deployments: [END - HOUR, END - 5 * WEEK_MS, END + HOUR] }),
      current,
    );
    expect(summary.deployments).toBe(1);
    expect(summary.deploymentsPerWeek).toBe(0.25);
  });

  it("computes lead time, change failure rate, and restore time", () => {
    const summary = summarise(
      inputs({
        prs: [
          pr({ mergedAt: END - HOUR, firstCommitAt: END - 11 * HOUR }),
          pr({ mergedAt: END - 2 * HOUR, firstCommitAt: END - 32 * HOUR }),
          pr({
            mergedAt: END - 3 * HOUR,
            firstCommitAt: END - 4 * HOUR,
            title: 'Revert "x"',
          }),
          pr({
            mergedAt: END - 4 * HOUR,
            firstCommitAt: END - 54 * HOUR,
            labels: ["hotfix"],
          }),
        ],
        incidents: [
          incident(END - 20 * HOUR, END - 18 * HOUR),
          incident(END - 30 * HOUR, END - 24 * HOUR),
        ],
      }),
      current,
    );
    expect(summary.mergedChanges).toBe(4);
    expect(summary.failedChanges).toBe(2);
    expect(summary.changeFailureRate).toBe(0.5);
    expect(summary.leadTimeMedianHours).toBe(20); // sorted 1, 10, 30, 50 -> mean of 10 and 30
    expect(summary.restoreMedianHours).toBe(4); // 2h and 6h
    expect(summary.restoreCount).toBe(2);
  });

  it("reports null rather than zero when there is nothing to measure", () => {
    const summary = summarise(inputs(), current);
    expect(summary.changeFailureRate).toBeNull();
    expect(summary.leadTimeMedianHours).toBeNull();
    expect(summary.restoreMedianHours).toBeNull();
  });
});

describe("weeklySeries", () => {
  const { current } = periods(4, END);

  it("returns one point per week, oldest first, with gaps as null", () => {
    const series = weeklySeries(
      inputs({
        deployments: [
          current.start + HOUR,
          current.start + 2 * HOUR,
          END - HOUR,
        ],
        prs: [pr({ mergedAt: END - HOUR, firstCommitAt: END - 3 * HOUR })],
      }),
      current,
    );
    expect(series).toHaveLength(4);
    expect(series.map((p) => p.deployments)).toEqual([2, 0, 0, 1]);
    expect(series[0]?.weekStart).toBe(current.start);
    expect(series[0]?.leadTimeMedianHours).toBeNull();
    expect(series[3]?.leadTimeMedianHours).toBe(2);
    expect(series[3]?.changeFailureRate).toBe(0);
  });

  it("places an event exactly on a week boundary in the later week", () => {
    const series = weeklySeries(
      inputs({ deployments: [current.start + WEEK_MS] }),
      current,
    );
    expect(series.map((p) => p.deployments)).toEqual([0, 1, 0, 0]);
  });
});

describe("trendLine", () => {
  it("fits a straight line through the points", () => {
    expect(trendLine([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
  });

  it("bridges gaps in the data", () => {
    expect(trendLine([0, null, 2, null, 4])).toEqual([0, 1, 2, 3, 4]);
  });

  it("returns nulls with fewer than two points", () => {
    expect(trendLine([null, 3, null])).toEqual([null, null, null]);
  });
});
