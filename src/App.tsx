import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Results } from "./components/Results";
import { TokenGate } from "./components/TokenGate";
import { GitHubError } from "./github/client";
import { loadRepoData, type RepoData, type SourceChoice } from "./github/load";
import { parseRepo } from "./github/repo";
import { periods } from "./metrics/compute";

const TOKEN_KEY = "gh-repo-dora:token";
const WEEK_OPTIONS = [4, 13, 26, 52];
const DEFAULT_WEEKS = 13;

const SOURCE_OPTIONS: { value: SourceChoice; label: string }[] = [
  { value: "auto", label: "Automatic" },
  { value: "deployments", label: "GitHub Deployments (production)" },
  { value: "releases", label: "GitHub Releases" },
  { value: "prs", label: "Merged pull requests" },
];

type View =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      data: RepoData;
      weeks: number;
      asOf: number;
      failureLabels: string[];
      incidentLabels: string[];
    };

const splitLabels = (text: string) =>
  text
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the token then lives in memory only.
  }
}

function initialParams() {
  const params = new URLSearchParams(window.location.search);
  const weeks = Number(params.get("weeks"));
  return {
    repo: params.get("repo") ?? "",
    weeks: WEEK_OPTIONS.includes(weeks) ? weeks : DEFAULT_WEEKS,
  };
}

export function App() {
  const initial = useRef(initialParams()).current;
  const [token, setToken] = useState<string | null>(readToken);
  const [repoText, setRepoText] = useState(initial.repo);
  const [weeks, setWeeks] = useState(initial.weeks);
  const [source, setSource] = useState<SourceChoice>("auto");
  const [failureText, setFailureText] = useState("revert, hotfix, rollback");
  const [incidentText, setIncidentText] = useState("incident");
  const [view, setView] = useState<View>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(
    async (overrideWeeks?: number) => {
      const repo = parseRepo(repoText);
      if (!token) return;
      if (!repo) {
        setView({
          status: "error",
          message: "Enter a repository as owner/name or paste its GitHub URL.",
        });
        return;
      }
      const chosenWeeks = overrideWeeks ?? weeks;
      const incidentLabels = splitLabels(incidentText);
      const failureLabels = splitLabels(failureText);

      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setView({ status: "loading" });

      const asOf = Date.now();
      try {
        const data = await loadRepoData(
          {
            token,
            repo,
            since: periods(chosenWeeks, asOf).previous.start,
            source,
            incidentLabels,
          },
          current.signal,
        );
        const query = new URLSearchParams({
          repo: `${repo.owner}/${repo.name}`,
          weeks: String(chosenWeeks),
        });
        window.history.replaceState(null, "", `?${query}`);
        setView({
          status: "ready",
          data,
          weeks: chosenWeeks,
          asOf,
          failureLabels,
          incidentLabels,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (error instanceof GitHubError && error.kind === "auth") {
          writeToken(null);
          setToken(null);
        }
        setView({
          status: "error",
          message:
            error instanceof Error ? error.message : "Something went wrong.",
        });
      }
    },
    [repoText, token, weeks, source, incidentText, failureText],
  );

  // Open a shared link (?repo=owner/name) straight into its charts once a token is available.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !token || !initial.repo) return;
    autoRan.current = true;
    void run();
  }, [token, initial.repo, run]);

  const forgetToken = () => {
    controller.current?.abort();
    writeToken(null);
    setToken(null);
    setView({ status: "idle" });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run();
  };

  return (
    <main>
      <header>
        <h1>Repo DORA</h1>
        <p className="muted">
          Deployment frequency, lead time, change failure rate and time to
          restore for a GitHub repository.
        </p>
      </header>

      {!token ? (
        <TokenGate
          onToken={(value) => {
            writeToken(value);
            setToken(value);
            setView({ status: "idle" });
          }}
        />
      ) : (
        <form className="panel controls" onSubmit={submit}>
          <label className="grow">
            Repository
            <input
              type="text"
              placeholder="owner/name or https://github.com/owner/name"
              value={repoText}
              onChange={(event) => setRepoText(event.target.value)}
              spellCheck={false}
            />
          </label>
          <label>
            Period
            <select
              value={weeks}
              onChange={(event) => {
                const next = Number(event.target.value);
                setWeeks(next);
                if (view.status === "ready") void run(next);
              }}
            >
              {WEEK_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  Last {option} weeks
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={view.status === "loading" || !repoText.trim()}
          >
            {view.status === "loading" ? "Loading…" : "Load"}
          </button>
          <details className="options">
            <summary>Options</summary>
            <label>
              Count deployments from
              <select
                value={source}
                onChange={(event) =>
                  setSource(event.target.value as SourceChoice)
                }
              >
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              PR labels that mark a failure fix (comma separated)
              <input
                type="text"
                value={failureText}
                onChange={(event) => setFailureText(event.target.value)}
              />
            </label>
            <label>
              Issue labels that mark an incident (comma separated)
              <input
                type="text"
                value={incidentText}
                onChange={(event) => setIncidentText(event.target.value)}
              />
            </label>
            <p className="muted">Press Load to apply option changes.</p>
          </details>
          <button type="button" className="link" onClick={forgetToken}>
            Forget token
          </button>
        </form>
      )}

      {view.status === "error" && (
        <p className="notice error" role="alert">
          {view.message}
        </p>
      )}
      {view.status === "loading" && (
        <p className="muted">
          Fetching pull requests, deployments, releases and issues…
        </p>
      )}
      {view.status === "ready" && (
        <Results
          data={view.data}
          weeks={view.weeks}
          asOf={view.asOf}
          failureLabels={view.failureLabels}
          incidentLabels={view.incidentLabels}
        />
      )}
    </main>
  );
}
