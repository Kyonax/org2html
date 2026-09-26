import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { parse, renderToHtml } from "../src/index.js"

const fixture = readFileSync(join(__dirname, "fixtures", "all-constructs.org"), "utf-8")

// Render deterministically: sanitize off (structure-faithful) and codeHighlight
// off (Shiki output is version-dependent — the css-vars theme is covered by
// tests/code-theme.test.ts). The golden gates .org-* hook drift across the
// parser + renderer (Phase 3·INT / Phase 8 gate [D-16]).
async function renderGolden(): Promise<string> {
  const { html } = await renderToHtml(parse(fixture), { sanitize: false, codeHighlight: false })
  return html
}

describe("Phase 3·INT / Phase 8 — golden all-constructs render", () => {
  it("matches the committed golden snapshot (catches hook/structure drift)", async () => {
    expect(await renderGolden()).toMatchSnapshot()
  })

  it("emits every stable .org-* construct hook", async () => {
    const html = await renderGolden()
    const hooks = [
      "org-root",
      "org-section",
      "org-heading outline-1",
      "org-todo",
      "org-priority",
      "org-tag",
      "org-paragraph",
      "org-code",
      "org-verbatim",
      "org-subscript",
      "org-superscript",
      "org-statistics-cookie",
      "org-timestamp",
      "org-link",
      "org-ul",
      "org-ol",
      "org-dl",
      "org-dt",
      "org-dd",
      "org-li--checkbox",
      "org-table",
      "org-quote",
      "org-example",
      "org-verse",
      "org-src",
      "org-src-block",
      "org-src-header",
      "org-src-lights",
      "org-src-copy",
      "org-src--numbered",
      "org-diff",
      "org-results",
      "org-inlinetask",
      "org-drawer--logbook",
      "org-quote--pull",
      "org-figure--bracket",
      "org-callout--note",
      "org-figure",
      "org-image",
      "org-footnotes",
      "org-fnref",
      "org-toc",
    ]
    for (const hook of hooks) {
      expect(html, `missing hook: ${hook}`).toContain(hook)
    }
  })
})
