import { useMemo } from "react";
import { formatHours, formatPercent, formatPerWeek, plural } from "../format";
import type { RepoData } from "../github/load";
import { periods, summarise, weeklySeries } from "../metrics/compute";
import type { DeploySource, Summary } from "../metrics/types";
import { MetricChart } from "./MetricChart";

interface Props {
  data: RepoData;
  weeks: number;
  /** Epoch ms the data was fetched at, which is the end of the current period. */
  asOf: number;
  failureLabels: string[];
  incidentLabels: string[];
}

const SOURCE_NAMES: Record<DeploySource, string> = {
  deployments: "GitHub Deployments to a production environment",
  releases: "published GitHub Releases",
  prs: "pull requests merged into the default branch",
};

function Card({
  name,
  current,
  previous,
  detail,
}: {
  name: string;
  current: string;
  previous: string;
  detail: string;
}) {
  return (
    <div className="card">
      <div className="card-name">{name}</div>
      <div className="card-value">{current}</div>
      <div className="muted">{detail}</div>
      <div className="muted">Previous period: {previous}</div>
    </div>
  );
}

function cards(now: Summary, before: Summary) {
  return [
    {
      name: "Deployment frequency",
      current: formatPerWeek(now.deploymentsPerWeek),
      previous: formatPerWeek(before.deploymentsPerWeek),
      detail: plural(now.deployments, "deployment"),
    },
    {
      name: "Lead time for changes",
      current: formatHours(now.leadTimeMedianHours),
      previous: formatHours(before.leadTimeMedianHours),
      detail: `Median of ${now.leadTimeCount} PRs, 90th percentile ${formatHours(now.leadTimeP90Hours)}`,
    },
    {
      name: "Change failure rate",
      current: formatPercent(now.changeFailureRate),
      previous: formatPercent(before.changeFailureRate),
      detail: `${now.failedChanges} of ${now.mergedChanges} merged PRs`,
    },
    {
      name: "Time to restore",
      current: formatHours(now.restoreMedianHours),
      previous: formatHours(before.restoreMedianHours),
      detail: `Median of ${plural(now.restoreCount, "closed incident")}`,
    },
  ];
}

export function Results({
  data,
  weeks,
  asOf,
  failureLabels,
  incidentLabels,
}: Props) {
  const view = useMemo(() => {
    const { current, previous } = periods(weeks, asOf);
    const inputs = {
      prs: data.prs,
      deployments: data.deployments,
      incidents: data.incidents,
      failureLabels,
    };
    return {
      now: summarise(inputs, current),
      before: summarise(inputs, previous),
      series: weeklySeries(inputs, current),
    };
  }, [data, weeks, asOf, failureLabels]);

  const { series } = view;
  return (
    <>
      {data.warnings.map((warning) => (
        <p className="notice" key={warning}>
          {warning}
        </p>
      ))}
      <p className="muted">
        Deployments counted from {SOURCE_NAMES[data.deploySource]}. Showing the
        last {weeks} weeks to {new Date(asOf).toLocaleDateString("en-GB")}.
      </p>

      <section className="cards">
        {cards(view.now, view.before).map((card) => (
          <Card key={card.name} {...card} />
        ))}
      </section>

      <section className="charts">
        <MetricChart
          title="Deployment frequency"
          yLabel="Deployments per week"
          kind="bar"
          rows={series.map((p) => ({
            weekStart: p.weekStart,
            value: p.deployments,
            detail: plural(p.deployments, "deployment"),
          }))}
          formatValue={(v) => plural(v, "deployment")}
        />
        <MetricChart
          title="Lead time for changes"
          yLabel="Median hours, commit to merge"
          kind="line"
          rows={series.map((p) => ({
            weekStart: p.weekStart,
            value: p.leadTimeMedianHours,
            detail: `${plural(p.leadTimeCount, "PR")} merged`,
          }))}
          formatValue={formatHours}
        />
        <MetricChart
          title="Change failure rate"
          yLabel="Failure-fix PRs, % of merged"
          kind="line"
          rows={series.map((p) => ({
            weekStart: p.weekStart,
            value:
              p.changeFailureRate === null ? null : p.changeFailureRate * 100,
            detail: `${p.failedChanges} of ${p.mergedChanges} merged PRs`,
          }))}
          formatValue={(v) => `${v.toFixed(1)}%`}
        />
        <MetricChart
          title="Time to restore"
          yLabel="Median hours, open to close"
          emptyHint={`No closed issues labelled ${incidentLabels.join(", ") || "(none set)"} were found. Change the incident label under Options.`}
          kind="line"
          rows={series.map((p) => ({
            weekStart: p.weekStart,
            value: p.restoreMedianHours,
            detail: `${p.restoreCount} incidents closed`,
          }))}
          formatValue={formatHours}
        />
      </section>

      <details className="definitions">
        <summary>How each metric is measured</summary>
        <dl>
          <dt>Deployment frequency</dt>
          <dd>
            Count of successful deployments per week, from{" "}
            {SOURCE_NAMES[data.deploySource]}. With automatic source selection
            the tool uses Deployments if the repository has any in range, then
            Releases, then merged pull requests.
          </dd>
          <dt>Lead time for changes</dt>
          <dd>
            For each pull request merged into{" "}
            <code>{data.info.defaultBranch}</code>: time from its first commit
            to its merge. It stops at merge, not at production, because GitHub
            does not record when a merge reached users.
          </dd>
          <dt>Change failure rate</dt>
          <dd>
            Share of merged pull requests that fix a bad change: the title
            starts with “Revert” or “Hotfix”, the branch starts with{" "}
            <code>revert-</code>, <code>revert/</code>, <code>hotfix-</code> or{" "}
            <code>hotfix/</code>, or the PR has one of these labels:{" "}
            {failureLabels.length > 0 ? failureLabels.join(", ") : "none set"}.
            This counts the fixes, not the changes that needed them.
          </dd>
          <dt>Time to restore</dt>
          <dd>
            Time from a closed issue being opened to being closed, for issues
            labelled {incidentLabels.join(", ") || "none set"}. Placed in the
            week the issue was closed.
          </dd>
        </dl>
      </details>
    </>
  );
}
