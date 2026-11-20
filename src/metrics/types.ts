/** A pull request merged into the default branch. Timestamps are epoch milliseconds. */
export interface MergedPr {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  labels: string[];
  firstCommitAt: number;
  mergedAt: number;
}

/** An issue that was opened and then closed, used as an incident. */
export interface ClosedIssue {
  number: number;
  title: string;
  url: string;
  createdAt: number;
  closedAt: number;
}

/** Where deployment timestamps come from. */
export type DeploySource = "deployments" | "releases" | "prs";

/** Half-open window [start, end) of whole weeks, in epoch milliseconds. */
export interface Period {
  start: number;
  end: number;
}

export interface Inputs {
  prs: MergedPr[];
  /** Timestamps of production deployments (or the chosen stand-in). */
  deployments: number[];
  incidents: ClosedIssue[];
  /** Labels that mark a merged PR as a fix for a bad change. */
  failureLabels: string[];
}

export interface Summary {
  deployments: number;
  deploymentsPerWeek: number;
  leadTimeMedianHours: number | null;
  leadTimeP90Hours: number | null;
  leadTimeCount: number;
  failedChanges: number;
  mergedChanges: number;
  changeFailureRate: number | null;
  restoreMedianHours: number | null;
  restoreCount: number;
}

export interface WeekPoint {
  /** Start of the 7-day bucket, epoch milliseconds. */
  weekStart: number;
  deployments: number;
  leadTimeMedianHours: number | null;
  leadTimeCount: number;
  changeFailureRate: number | null;
  failedChanges: number;
  mergedChanges: number;
  restoreMedianHours: number | null;
  restoreCount: number;
}
