# Repo DORA

Visualise the four [DORA metrics](https://dora.dev) for any GitHub repository, using only data GitHub itself holds.
Everything runs in the browser: there is no backend and no database.

| Metric                | Measured from                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment frequency  | Successful production **Deployments**, else published **Releases**, else **merged PRs** (chosen automatically, overridable)                     |
| Lead time for changes | First commit → merge, for each PR merged into the default branch                                                                                |
| Change failure rate   | Share of merged PRs that fix a bad change: title starts with `Revert`/`Hotfix`, branch starts with `revert-`/`hotfix/`, or a configurable label |
| Time to restore       | Opened → closed time of issues carrying a configurable label (default `incident`)                                                               |

Every chart has labelled axes and a least-squares trend line, and each summary card shows the previous period beside the
current one. The page shows data only and makes no judgement about it. Exact definitions are in the “How each metric is
measured” section of the page.

## Signing in

GitHub does not allow a browser-only app to complete an OAuth login: its token endpoints send no CORS headers, and the
web flow needs a client secret. So the page asks for a **fine-grained personal access token** instead.

- Create one at <https://github.com/settings/personal-access-tokens/new> with read-only access to the repositories you
  want to inspect: **Metadata, Pull requests, Issues, Deployments, Contents**.
- The token is sent only to `api.github.com` and kept in the tab's `sessionStorage`, so it is gone when the tab closes.
  It is never put in the URL.
- A shareable link looks like `?repo=owner/name&weeks=13`. It carries no credentials; the opener supplies their own token.

## Known limits

- Lead time stops at **merge**, not production. GitHub does not record when a merge reached users.
- Change failure rate counts the _fix_ PRs, which depends on the team's naming and labelling habits.
- Time to restore is empty until issues are labelled as incidents.
- At most 3,000 items per data type are read; the page warns when that cap truncates a range.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the metric maths and repo parsing
npm run typecheck
npm run build
```

Metric maths lives in `src/metrics` as pure functions with no network access; GitHub access lives in `src/github`.

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which typechecks, tests, builds, and publishes `dist/` to GitHub
Pages. In the repository settings, **Pages → Source** must be set to **GitHub Actions**. The build assumes the site is
served from `/gh-repo-dora/` (see `base` in `vite.config.ts`).
