export interface RepoRef {
  owner: string;
  name: string;
}

/** Accepts `owner/name` or any github.com URL pointing into a repository. */
export function parseRepo(input: string): RepoRef | null {
  const trimmed = input.trim();
  const match =
    /^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+?)(?:\.git)?(?:[/?#].*)?$/.exec(
      trimmed,
    );
  if (!match) return null;
  const [, owner, name] = match as unknown as [string, string, string];
  if (name === "." || name === "..") return null;
  return { owner, name };
}
