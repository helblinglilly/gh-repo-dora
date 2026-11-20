import type { ClosedIssue, DeploySource, MergedPr } from "../metrics/types";
import { graphql, PAGE_SIZE, paginate, type Page } from "./client";
import type { RepoRef } from "./repo";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** A deployment status that means "this shipped". INACTIVE is a superseded success. */
const SHIPPED_STATES = new Set(["SUCCESS", "ACTIVE", "INACTIVE"]);
/** Environment names tried for production deployments. The API filter is case-sensitive. */
const PRODUCTION_ENVIRONMENTS = ["production", "Production", "prod", "Prod"];
/** Incidents are matched on close date, but listed by creation date, so look a little further back. */
const INCIDENT_LOOKBACK_PAD = 8 * WEEK_MS;

const t = (iso: string) => Date.parse(iso);

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

function toPage<N>(connection: { nodes: N[]; pageInfo: PageInfo }): Page<N> {
  return { nodes: connection.nodes, ...connection.pageInfo };
}

export interface RepoInfo {
  nameWithOwner: string;
  defaultBranch: string;
  isPrivate: boolean;
}

export async function fetchRepoInfo(
  token: string,
  repo: RepoRef,
  signal?: AbortSignal,
): Promise<RepoInfo> {
  const data = await graphql<{
    repository: {
      nameWithOwner: string;
      isPrivate: boolean;
      defaultBranchRef: { name: string } | null;
    };
  }>(
    token,
    `
      query ($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          nameWithOwner
          isPrivate
          defaultBranchRef {
            name
          }
        }
      }
    `,
    { ...repo },
    signal,
  );
  const { repository } = data;
  return {
    nameWithOwner: repository.nameWithOwner,
    isPrivate: repository.isPrivate,
    defaultBranch: repository.defaultBranchRef?.name ?? "main",
  };
}

interface PrNode {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  createdAt: string;
  mergedAt: string;
  updatedAt: string;
  labels: { nodes: { name: string }[] };
  commits: { nodes: { commit: { authoredDate: string } }[] };
}

export async function fetchMergedPrs(
  token: string,
  repo: RepoRef,
  baseBranch: string,
  since: number,
  signal?: AbortSignal,
) {
  // A PR merged in the window was updated no earlier than its merge, so walking by
  // update time and stopping at `since` cannot miss one.
  const { nodes, truncated } = await paginate<PrNode>(
    async (cursor) => {
      const data = await graphql<{
        repository: { pullRequests: { nodes: PrNode[]; pageInfo: PageInfo } };
      }>(
        token,
        `
          query (
            $owner: String!
            $name: String!
            $base: String!
            $cursor: String
            $size: Int!
          ) {
            repository(owner: $owner, name: $name) {
              pullRequests(
                states: MERGED
                baseRefName: $base
                first: $size
                after: $cursor
                orderBy: { field: UPDATED_AT, direction: DESC }
              ) {
                nodes {
                  number
                  title
                  url
                  headRefName
                  createdAt
                  mergedAt
                  updatedAt
                  labels(first: 20) {
                    nodes {
                      name
                    }
                  }
                  commits(first: 1) {
                    nodes {
                      commit {
                        authoredDate
                      }
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `,
        { ...repo, base: baseBranch, cursor, size: PAGE_SIZE },
        signal,
      );
      return toPage(data.repository.pullRequests);
    },
    (pr) => t(pr.updatedAt),
    since,
  );

  const prs: MergedPr[] = nodes.map((pr) => {
    const mergedAt = t(pr.mergedAt);
    const firstCommit = pr.commits.nodes[0]?.commit.authoredDate;
    return {
      number: pr.number,
      title: pr.title,
      url: pr.url,
      headRefName: pr.headRefName,
      labels: pr.labels.nodes.map((l) => l.name),
      // A PR with no readable commits falls back to when it was opened.
      firstCommitAt: firstCommit ? t(firstCommit) : t(pr.createdAt),
      mergedAt,
    };
  });
  return { prs, truncated };
}

interface DeploymentNode {
  createdAt: string;
  latestStatus: { state: string } | null;
}

export async function fetchDeployments(
  token: string,
  repo: RepoRef,
  since: number,
  signal?: AbortSignal,
) {
  const { nodes, truncated } = await paginate<DeploymentNode>(
    async (cursor) => {
      const data = await graphql<{
        repository: {
          deployments: { nodes: DeploymentNode[]; pageInfo: PageInfo };
        };
      }>(
        token,
        `
          query (
            $owner: String!
            $name: String!
            $envs: [String!]
            $cursor: String
            $size: Int!
          ) {
            repository(owner: $owner, name: $name) {
              deployments(
                environments: $envs
                first: $size
                after: $cursor
                orderBy: { field: CREATED_AT, direction: DESC }
              ) {
                nodes {
                  createdAt
                  latestStatus {
                    state
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `,
        { ...repo, envs: PRODUCTION_ENVIRONMENTS, cursor, size: PAGE_SIZE },
        signal,
      );
      return toPage(data.repository.deployments);
    },
    (d) => t(d.createdAt),
    since,
  );
  const shipped = nodes.filter(
    (d) => d.latestStatus && SHIPPED_STATES.has(d.latestStatus.state),
  );
  return { times: shipped.map((d) => t(d.createdAt)), truncated };
}

interface ReleaseNode {
  createdAt: string;
  publishedAt: string | null;
  isDraft: boolean;
  isPrerelease: boolean;
}

export async function fetchReleases(
  token: string,
  repo: RepoRef,
  since: number,
  signal?: AbortSignal,
) {
  const { nodes, truncated } = await paginate<ReleaseNode>(
    async (cursor) => {
      const data = await graphql<{
        repository: { releases: { nodes: ReleaseNode[]; pageInfo: PageInfo } };
      }>(
        token,
        `
          query (
            $owner: String!
            $name: String!
            $cursor: String
            $size: Int!
          ) {
            repository(owner: $owner, name: $name) {
              releases(
                first: $size
                after: $cursor
                orderBy: { field: CREATED_AT, direction: DESC }
              ) {
                nodes {
                  createdAt
                  publishedAt
                  isDraft
                  isPrerelease
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        `,
        { ...repo, cursor, size: PAGE_SIZE },
        signal,
      );
      return toPage(data.repository.releases);
    },
    (r) => t(r.createdAt),
    since,
  );
  const times = nodes.flatMap((r) =>
    r.isDraft || r.isPrerelease || !r.publishedAt ? [] : [t(r.publishedAt)],
  );
  return { times, truncated };
}

interface IssueNode {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  closedAt: string | null;
}

/** Closed issues carrying any of `labels`. The API ANDs labels, so each is queried on its own. */
export async function fetchIncidents(
  token: string,
  repo: RepoRef,
  labels: string[],
  since: number,
  signal?: AbortSignal,
) {
  const byNumber = new Map<number, ClosedIssue>();
  let truncated = false;

  for (const label of labels) {
    const result = await paginate<IssueNode>(
      async (cursor) => {
        const data = await graphql<{
          repository: { issues: { nodes: IssueNode[]; pageInfo: PageInfo } };
        }>(
          token,
          `
            query (
              $owner: String!
              $name: String!
              $labels: [String!]
              $cursor: String
              $size: Int!
            ) {
              repository(owner: $owner, name: $name) {
                issues(
                  states: CLOSED
                  labels: $labels
                  first: $size
                  after: $cursor
                  orderBy: { field: CREATED_AT, direction: DESC }
                ) {
                  nodes {
                    number
                    title
                    url
                    createdAt
                    closedAt
                  }
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                }
              }
            }
          `,
          { ...repo, labels: [label], cursor, size: PAGE_SIZE },
          signal,
        );
        return toPage(data.repository.issues);
      },
      (issue) => t(issue.createdAt),
      since - INCIDENT_LOOKBACK_PAD,
    );
    truncated ||= result.truncated;
    for (const issue of result.nodes) {
      if (!issue.closedAt) continue;
      byNumber.set(issue.number, {
        number: issue.number,
        title: issue.title,
        url: issue.url,
        createdAt: t(issue.createdAt),
        closedAt: t(issue.closedAt),
      });
    }
  }
  return { incidents: [...byNumber.values()], truncated };
}

export type SourceChoice = DeploySource | "auto";

export interface LoadOptions {
  token: string;
  repo: RepoRef;
  /** How far back to fetch, in epoch milliseconds. Covers the current and previous period. */
  since: number;
  source: SourceChoice;
  incidentLabels: string[];
}

export interface RepoData {
  info: RepoInfo;
  prs: MergedPr[];
  deployments: number[];
  /** The source actually used, which differs from the request when `auto` falls back. */
  deploySource: DeploySource;
  incidents: ClosedIssue[];
  /** Human-readable notes about data that may be incomplete. */
  warnings: string[];
}

export async function loadRepoData(
  options: LoadOptions,
  signal?: AbortSignal,
): Promise<RepoData> {
  const { token, repo, since, source, incidentLabels } = options;
  const warnings: string[] = [];

  const info = await fetchRepoInfo(token, repo, signal);
  const [
    { prs, truncated: prsTruncated },
    { incidents, truncated: incidentsTruncated },
  ] = await Promise.all([
    fetchMergedPrs(token, repo, info.defaultBranch, since, signal),
    fetchIncidents(token, repo, incidentLabels, since, signal),
  ]);
  if (prsTruncated)
    warnings.push(
      "Merged pull requests were capped at 3,000, so the older end of the range is incomplete.",
    );
  if (incidentsTruncated)
    warnings.push(
      "Incident issues were capped, so the older end of the range is incomplete.",
    );

  let deployments: number[] = [];
  let deploySource: DeploySource = source === "auto" ? "prs" : source;
  const tryDeployments = source === "auto" || source === "deployments";
  const tryReleases = source === "auto" || source === "releases";

  if (tryDeployments) {
    const result = await fetchDeployments(token, repo, since, signal);
    if (result.truncated)
      warnings.push(
        "Deployments were capped, so the older end of the range is incomplete.",
      );
    if (result.times.length > 0 || source === "deployments") {
      deployments = result.times;
      deploySource = "deployments";
    }
  }
  if (deploySource !== "deployments" && tryReleases) {
    const result = await fetchReleases(token, repo, since, signal);
    if (result.truncated)
      warnings.push(
        "Releases were capped, so the older end of the range is incomplete.",
      );
    if (result.times.length > 0 || source === "releases") {
      deployments = result.times;
      deploySource = "releases";
    }
  }
  if (deploySource === "prs") {
    deployments = prs.map((pr) => pr.mergedAt);
  }

  return { info, prs, deployments, deploySource, incidents, warnings };
}
