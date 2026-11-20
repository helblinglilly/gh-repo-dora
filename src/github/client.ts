const ENDPOINT = "https://api.github.com/graphql";
const PAGE_SIZE = 100;
/** Safety valve so a huge repo cannot loop forever; hitting it is reported to the user. */
const MAX_PAGES = 30;

export type ErrorKind =
  "auth" | "forbidden" | "not-found" | "rate-limit" | "network" | "graphql";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { type?: string; message: string }[];
}

export async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new GitHubError(
      "Could not reach api.github.com. Check your connection.",
      "network",
    );
  }

  if (response.status === 401) {
    throw new GitHubError(
      "GitHub rejected the token. It may be mistyped, expired, or revoked.",
      "auth",
    );
  }
  if (response.status === 403) {
    if (response.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(response.headers.get("x-ratelimit-reset")) * 1000;
      const when = reset
        ? ` Resets at ${new Date(reset).toLocaleTimeString()}.`
        : "";
      throw new GitHubError(`GitHub rate limit reached.${when}`, "rate-limit");
    }
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new GitHubError(
      body.message ?? "GitHub refused the request (403).",
      "forbidden",
    );
  }
  if (!response.ok) {
    throw new GitHubError(`GitHub returned ${response.status}.`, "graphql");
  }

  const body = (await response.json()) as GraphQLResponse<T>;
  const first = body.errors?.[0];
  if (first) {
    if (first.type === "NOT_FOUND") {
      throw new GitHubError(
        "Repository not found, or the token has no access to it.",
        "not-found",
      );
    }
    throw new GitHubError(first.message, "graphql");
  }
  if (!body.data)
    throw new GitHubError("GitHub returned an empty response.", "graphql");
  return body.data;
}

export interface Page<N> {
  nodes: N[];
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Paged<N> {
  nodes: N[];
  /** True when MAX_PAGES stopped the walk before reaching the cutoff. */
  truncated: boolean;
}

/**
 * Walks pages newest-first until a node is older than `cutoff`, the pages run out, or MAX_PAGES is hit.
 * Nodes older than the cutoff are dropped.
 */
export async function paginate<N>(
  fetchPage: (cursor: string | null) => Promise<Page<N>>,
  timestampOf: (node: N) => number,
  cutoff: number,
): Promise<Paged<N>> {
  const nodes: N[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result: Page<N> = await fetchPage(cursor);
    for (const node of result.nodes) {
      if (timestampOf(node) < cutoff) return { nodes, truncated: false };
      nodes.push(node);
    }
    if (!result.hasNextPage) return { nodes, truncated: false };
    cursor = result.endCursor;
  }
  return { nodes, truncated: true };
}

export { PAGE_SIZE };
