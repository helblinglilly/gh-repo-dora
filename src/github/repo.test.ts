import { describe, expect, it } from "vitest";
import { parseRepo } from "./repo";

describe("parseRepo", () => {
  it("parses owner/name", () => {
    expect(parseRepo("facebook/react")).toEqual({
      owner: "facebook",
      name: "react",
    });
  });

  it("parses URLs, including trailing paths and .git", () => {
    expect(parseRepo("https://github.com/facebook/react")).toEqual({
      owner: "facebook",
      name: "react",
    });
    expect(parseRepo("https://github.com/facebook/react.git")).toEqual({
      owner: "facebook",
      name: "react",
    });
    expect(parseRepo("https://github.com/facebook/react/pull/1?x=1")).toEqual({
      owner: "facebook",
      name: "react",
    });
  });

  it("keeps dots in repo names", () => {
    expect(parseRepo("vercel/next.js")).toEqual({
      owner: "vercel",
      name: "next.js",
    });
  });

  it("rejects anything else", () => {
    expect(parseRepo("")).toBeNull();
    expect(parseRepo("react")).toBeNull();
    expect(parseRepo("https://gitlab.com/a/b")).toBeNull();
    expect(parseRepo("a/..")).toBeNull();
  });
});
