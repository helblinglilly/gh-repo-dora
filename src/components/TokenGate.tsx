import { useState } from "react";

interface Props {
  onToken: (token: string) => void;
}

const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

export function TokenGate({ onToken }: Props) {
  const [value, setValue] = useState("");

  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) onToken(value.trim());
      }}
    >
      <h2>Connect to GitHub</h2>
      <p>
        This page runs entirely in your browser. It reads your repository
        through GitHub&apos;s API with a token you paste here. The token is sent
        only to <code>api.github.com</code>, is kept in this tab&apos;s session
        storage, and is gone when you close the tab. There is no server and
        nothing is stored.
      </p>
      <p>
        GitHub does not let a browser-only page sign you in with OAuth, so
        create a{" "}
        <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer">
          fine-grained token
        </a>{" "}
        with read-only access to the repositories you want to look at:
      </p>
      <ul>
        <li>
          Repository permissions: <strong>Metadata</strong>,{" "}
          <strong>Pull requests</strong>, <strong>Issues</strong>,{" "}
          <strong>Deployments</strong> and <strong>Contents</strong> (for
          releases), all set to read-only.
        </li>
        <li>
          For organisation repositories, choose the organisation as the resource
          owner.
        </li>
      </ul>
      <label>
        Token
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="github_pat_…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="submit" disabled={!value.trim()}>
        Use token
      </button>
    </form>
  );
}
