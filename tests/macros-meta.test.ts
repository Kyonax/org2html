import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/macros-meta.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("1C macros, link abbreviations + metadata keywords", () => {
  it("extracts #+SUBTITLE / #+EMAIL and normalizes #+DATE to ISO", () => {
    const { metadata } = parse(src)
    expect(metadata.subtitle).toBe("the last 1C construct")
    expect(metadata.email).toBe("kyo@example.com")
    expect(metadata.dateIso).toBe("2026-05-21")
    expect(metadata.date).toBe("May 21, 2026") // raw form preserved
  })

  it("widens the FILETAGS char class to keep @ / # tags", () => {
    const { metadata } = parse(src)
    expect(metadata.tags).toEqual(["@work", "#urgent", "release"])
  })

  it("expands built-in {{{title}}} and a user #+MACRO with positional args", async () => {
    const html = await render(src)
    expect(html).toContain("Macro &amp; Meta Demo") // {{{title}}}
    expect(html).toContain("Hello, Ada and Grace!") // {{{greet(Ada,Grace)}}}
    // No macro braces survive.
    expect(html).not.toContain("{{{")
  })

  it("expands a #+LINK abbreviation via its %s template", async () => {
    const html = await render(src)
    expect(html).toContain('href="https://github.com/Kyonax/org2html"')
  })

  it("consumes an undefined macro to nothing instead of leaking it", async () => {
    const html = await render("* H\n\n{{{nope(1)}}}bare\n")
    expect(html).not.toContain("{{{")
    expect(html).toContain("bare")
  })

  it("caps recursive macro expansion instead of looping", async () => {
    const html = await render("#+MACRO: loop {{{loop}}}\n\n* H\n\n{{{loop}}}done\n")
    expect(html).toContain("done")
    expect(html).not.toContain("{{{")
  })
})
