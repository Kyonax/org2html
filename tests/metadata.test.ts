import { describe, expect, it } from "vitest"
import { extractMetadata, parseOptions } from "../src/parser/metadata.js"

describe("metadata", () => {
  it("parses core front-matter keywords", () => {
    const { metadata } = extractMetadata(["#+TITLE: Hello", "#+AUTHOR: Me", ""])
    expect(metadata.title).toBe("Hello")
    expect(metadata.author).toBe("Me")
  })

  it("ends the metadata region at a top-of-document block delimiter", () => {
    const lines = ["#+TITLE: T", "", "#+BEGIN_SRC js", "const x = 1", "#+END_SRC"]
    const { metadata, contentStartLine } = extractMetadata(lines)
    expect(metadata.title).toBe("T")
    expect(lines[contentStartLine].startsWith("#+BEGIN_SRC")).toBe(true)
  })

  it("skips a header comment and keeps parsing metadata after it", () => {
    const lines = ["#+TITLE: T", "# a note", "#+CANONICAL: https://example.com/x", "", "body"]
    const { metadata, contentStartLine } = extractMetadata(lines)
    expect(metadata.title).toBe("T")
    expect(metadata.canonical).toBe("https://example.com/x")
    expect(lines[contentStartLine]).toBe("body")
  })

  it("parses #+OPTIONS into an object", () => {
    expect(parseOptions("toc:nil num:nil")).toBeTypeOf("object")
  })

  it("extracts the post id from #+POST_URL, in every form X hands out", () => {
    for (const form of [
      "https://x.com/kyonax_on_tech/status/2094691954227400762",
      "https://x.com/kyonax_on_tech/status/2094691954227400762/video/1",
      "https://twitter.com/someone/status/2094691954227400762",
      "https://mobile.twitter.com/someone/statuses/2094691954227400762",
      "2094691954227400762",
    ]) {
      const { metadata } = extractMetadata([`#+TITLE: T`, `#+POST_URL: ${form}`, "", "body"])
      expect(metadata.postId, form).toBe("2094691954227400762")
      expect(metadata.postUrl, form).toBe(form)
    }
  })

  it("ignores a #+POST_URL on another host rather than failing the build", () => {
    // The host is anchored, so a status path hosted elsewhere is not an X post. A malformed
    // announcement URL leaves the field unset — the policy #+HTML_LAYOUT uses for an unknown
    // slug — because it must never fail a build.
    for (const bad of [
      "https://evil.example/x.com/u/status/2094691954227400762",
      "https://x.com/kyonax_on_tech/photo/2094691954227400762",
      "not a url",
      "",
    ]) {
      const { metadata } = extractMetadata(["#+TITLE: T", `#+POST_URL: ${bad}`, "", "body"])
      expect(metadata.postId, bad).toBeUndefined()
      expect(metadata.postUrl, bad).toBeUndefined()
    }
  })

  it("records #+POST_URL as DATA — the engine never fetches or renders a thread", async () => {
    // Comments follow relations ([P-00]): the engine writes the reference, a separate tool
    // fetches, the host renders. If the engine ever grew a fetch here, this would catch it.
    const { parse, renderToHtml } = await import("../src/index.js")
    const org = [
      "#+TITLE: T",
      "#+POST_URL: https://x.com/kyonax_on_tech/status/2094691954227400762",
      "",
      "Body.",
    ].join("\n")
    const ast = parse(org)
    expect(ast.metadata.postId).toBe("2094691954227400762")
    const { html } = await renderToHtml(ast, { sanitize: true })
    // The announcement URL is metadata, not markup: nothing about it reaches the body.
    expect(html).not.toContain("2094691954227400762")
    expect(html).not.toContain("POST_URL")
    expect(html).not.toContain("doc-comments")
  })
})
