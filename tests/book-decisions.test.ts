/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * tests/book-decisions.test.ts — the owner's ten calls on the default book
 * (proposals page, 2026-08-24). Eight were accepted; the two that were not
 * (D-03 math stays raw, D-08 contents stays a flat indent) are locked here too,
 * so a later "improvement" cannot quietly re-open a decision that was made.
 */

import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

const BOOK = readFileSync(join(__dirname, "..", "templates", "style-book", "kwo.css"), "utf-8")
const RUNTIME = readFileSync(join(__dirname, "..", "templates", "o2h.js"), "utf-8")

async function render(src: string): Promise<string> {
  const { html } = await renderToHtml(parse(src), { codeHighlight: false })
  return html
}

describe("D-01 / D-02 — the document colour law", () => {
  it("paints no ambient HUD marks on a document page", () => {
    expect(BOOK).toMatch(/\.org-root::before,\s*\n\.org-root::after \{ content: none; \}/)
  })

  it("leaves the masthead flush with the prose", () => {
    expect(BOOK).not.toContain("margin-inline: calc(-1 * var(--o2h-space-5))")
  })
})

describe("D-03 / D-08 — the two calls that were DECLINED", () => {
  it("does not FRAME display math — the part of D-03 that still stands", async () => {
    // D-03 declined putting display math in a bordered well. It is typeset to MathML now
    // (a later, explicit request — "real Math equations"), which changes what the block
    // CONTAINS but not how it is dressed: no border, no plate, no rail.
    const html = await render("Inline \\(E = mc^{2}\\) and a block:\n\n\\[ x = y \\]\n")
    expect(html).toContain("org-math")
    const block = BOOK.slice(BOOK.indexOf(".org-math-display {"))
    const rule = block.slice(0, block.indexOf("}"))
    expect(rule).not.toContain("border")
    expect(rule).not.toContain("background")
  })

  it("keeps the contents a flat indent, with no row seams", () => {
    expect(BOOK).not.toContain(".org-toc-item { border-bottom")
  })
})

describe("D-04 — a clock entry is a measurement", () => {
  it("splits the line into a label, its stamps and the duration", async () => {
    const html = await render(
      "#+OPTIONS: c:t\n\n* Head\nCLOCK: [2026-08-24 Mon 14:00]--[2026-08-24 Mon 16:15] =>  2:15\n",
    )
    expect(html).toContain('<span class="org-clock-label">CLOCK</span>')
    expect(html).toContain('<span class="org-clock-duration">2:15</span>')
    expect(html).toContain("org-timestamp--inactive")
  })

  it("prints an unrecognised clock line verbatim rather than dropping it", async () => {
    const html = await render("#+OPTIONS: c:t\n\n* Head\nCLOCK: something else entirely\n")
    expect(html).toContain("something else entirely")
  })
})

describe("D-05 — the embed is a facade with its source named below it", () => {
  it("ships no frame, and mounts one only from the runtime", async () => {
    const html = await render('{{< youtube id="dQw4w9WgXcQ" >}}')
    expect(html).not.toContain("<iframe")
    expect(html).toContain('class="org-embed-facade"')
    expect(RUNTIME).toContain("initEmbeds")
    // The runtime re-checks the URL itself rather than trusting the attribute.
    expect(RUNTIME).toContain("youtube-nocookie")
  })

  it("identifies the platform by a MARK, never by a colour swatch", () => {
    expect(BOOK).toContain("mask: var(--o2h-icon-youtube)")
    expect(BOOK).toContain("background-color: currentColor")
  })

  it("puts an off-site mark on external links, painted by currentColor", () => {
    expect(BOOK).toContain("mask: var(--o2h-icon-external)")
  })
})

describe("D-06 / D-07 — marks that carry their meaning", () => {
  it("gives the tick rule real end caps", () => {
    expect(BOOK).toContain(".org-hr--tick::before")
    expect(BOOK).toContain(".org-hr--tick::after")
  })

  it("makes the ribbon a hairline mark rather than a flat fill", () => {
    expect(BOOK).toMatch(/\.org-deco-ribbon \{[^}]*border: 1px solid var\(--o2h-accent\)/)
  })
})

describe("D-09 — media carries the class hook every construct has", () => {
  it("tags a bare <video> and <audio> from an export block", async () => {
    const html = await render(
      "#+BEGIN_EXPORT html\n<video controls></video>\n<audio controls></audio>\n#+END_EXPORT\n",
    )
    expect(html).toContain('<video class="org-video"')
    expect(html).toContain('<audio class="org-audio"')
  })

  it("keeps a class the author already wrote, and never double-tags", async () => {
    const html = await render('#+BEGIN_EXPORT html\n<video class="hero" controls></video>\n#+END_EXPORT\n')
    expect(html).toContain("org-video hero")
    expect(html.match(/org-video/g)).toHaveLength(1)
  })
})

describe("D-10 — the long-form entity names", () => {
  it("expands the names Emacs ships instead of printing the backslash word", async () => {
    const html = await render("Latency \\rightarrow 40ms \\dots done, \\middot \\sect\n")
    expect(html).toContain("→")
    expect(html).toContain("…")
    expect(html).not.toContain("\\rightarrow")
    expect(html).not.toContain("\\dots")
  })
})

describe("the checkbox marks — drawn, and read from the item's own state", () => {
  it("draws the tick and the partial bar rather than typesetting a glyph", () => {
    expect(BOOK).toContain('[data-checkbox="checked"] > input::before')
    expect(BOOK).toContain('[data-checkbox="partial"] > input::before')
    expect(BOOK).not.toContain('content: "\\2713"')
  })

  it("suppresses the list marker with a selector that outranks it", () => {
    expect(BOOK).toContain(".org-root .org-ul > li.org-li--checkbox::before")
  })

  it("emits the state the book keys on", async () => {
    const html = await render("- [ ] open\n- [-] half\n- [X] done\n")
    expect(html).toContain('data-checkbox="unchecked"')
    expect(html).toContain('data-checkbox="partial"')
    expect(html).toContain('data-checkbox="checked"')
  })
})
