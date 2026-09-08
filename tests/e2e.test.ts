import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { org2html, parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

describe("e2e: real example documents", () => {
  it("renders the comprehensive template.org into a full document", async () => {
    const result = await org2html(fixture("./fixtures/complete-template.org"), {
      sanitize: true,
      codeHighlight: false,
    })
    expect(result.html).toContain("<title>")
    expect(result.metadata.title).toContain("Org2HTML")
  })

  it("template.org exercises the major block constructs", async () => {
    const { html } = await renderToHtml(parse(fixture("./fixtures/complete-template.org")), {
      sanitize: false,
      codeHighlight: false,
    })
    expect(html).toContain("<h2")
    expect(html).toContain("<ul")
    expect(html).toContain("<ol")
    expect(html).toContain("<table")
    expect(html).toContain("<pre")
    expect(html).toContain("<blockquote")
  })

  /*
   * A CV-SHAPED DOCUMENT: continued #+AUTHOR lines, a #+SETUPFILE that does not resolve, and
   * raw LaTeX spacing macros through the body. It exercises the awkward end of real-world Org
   * — none of it is an Org construct, and all of it must survive rather than crash the parser.
   *
   * The fixture is FICTIONAL on purpose. It replaces a real person's CV that lived in a
   * gitignored nodes/ directory while this suite read from it, so a fresh clone could not run
   * the tests at all; moving that file in would have committed a phone number and a personal
   * email to a public repository that publishes to npm.
   */
  it("renders a CV-shaped document without throwing", async () => {
    const { html, metadata } = await renderToHtml(parse(fixture("./fixtures/cv-document.org")), {
      sanitize: false,
      codeHighlight: false,
    })
    expect(typeof html).toBe("string")
    expect(html.length).toBeGreaterThan(100)
    expect(metadata.title).toContain("Alex Doe")
  })
})
