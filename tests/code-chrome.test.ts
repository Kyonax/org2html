/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

async function render(org: string, sanitize = false): Promise<string> {
  const { html } = await renderToHtml(parse(org), { sanitize })
  return html
}

const SRC = [
  "#+begin_src typescript :tangle src/app.ts",
  "const a = 1",
  "const b = 2",
  "#+end_src",
].join("\n")

describe("Phase SB-2 — code-block chrome (MAP-036 / CHR-009)", () => {
  it("wraps the block in a header bar: traffic-light squares + COPY (SB-069/071)", async () => {
    const html = await render(SRC)
    expect(html).toContain('<div class="org-src-block">')
    expect(html).toContain('<div class="org-src-header">')
    // SB-069 — exactly three decorative traffic-light squares, hidden from AT.
    expect(html).toContain('<span class="org-src-lights" aria-hidden="true">')
    expect(html.match(/<span class="org-src-light"><\/span>/g)).toHaveLength(3)
    // SB-071 — a labelled COPY affordance (host wires the click at hydration).
    expect(html).toContain(
      '<button class="org-src-copy" type="button" aria-label="Copy code to clipboard">COPY</button>',
    )
  })

  it("shows the filename (from :tangle) + language tag and mirrors them as data-* (SB-070)", async () => {
    const html = await render(SRC)
    expect(html).toContain('<span class="org-src-filename">app.ts</span>')
    expect(html).toContain('<span class="org-src-lang">typescript</span>')
    expect(html).toContain('data-lang="typescript"')
    expect(html).toContain('data-filename="app.ts"')
  })

  it("omits the filename when a block has no :tangle target, keeping the lang tag", async () => {
    const html = await render("#+begin_src python\nprint(1)\n#+end_src")
    expect(html).not.toContain("org-src-filename")
    expect(html).toContain('<span class="org-src-lang">python</span>')
    expect(html).not.toContain("data-filename=")
  })

  it("turns the line-number gutter on by default for a code block (SB-072)", async () => {
    const html = await render(SRC)
    expect(html).toMatch(/<pre class="org-src[^"]*\borg-src--numbered\b/)
  })

  it("marks a diff block .org-diff, tints +/- lines, and drops the number gutter (SB-079)", async () => {
    const html = await render(
      ["#+begin_src diff", "@@ -1 +1 @@", "+added", "-removed", " context", "#+end_src"].join("\n"),
    )
    expect(html).toMatch(/<pre class="org-src[^"]*\borg-diff\b/)
    expect(html).not.toContain("org-src--numbered")
    expect(html).toContain('<span class="line org-diff-hunk">')
    expect(html).toContain('<span class="line org-diff-add">')
    expect(html).toContain('<span class="line org-diff-del">')
  })

  it("gives #+RESULTS: output the green-left-border .org-results hook (MAP-038 / SB-076)", async () => {
    // A leading keyword would be swallowed as document metadata, so #+RESULTS:
    // follows body content — the shape a code-execution result actually takes.
    const fixed = await render("Run it.\n\n#+RESULTS:\n: hello\n: 42")
    expect(fixed).toContain('<pre class="org-fixed-width org-results">')

    const example = await render("Run it.\n\n#+RESULTS:\n#+begin_example\nhello\n#+end_example")
    expect(example).toContain('<pre class="org-example org-results">')
  })

  it("does not tag an ordinary block that is not preceded by #+RESULTS:", async () => {
    const html = await render("Intro.\n\n: just a fixed-width line")
    expect(html).toContain('<pre class="org-fixed-width">')
    expect(html).not.toContain("org-results")
  })

  it("keeps the chrome (button + data-* attrs) intact through the sanitizer", async () => {
    const html = await render(SRC, true)
    expect(html).toContain('<button class="org-src-copy"')
    expect(html).toContain('aria-label="Copy code to clipboard"')
    expect(html).toContain('data-lang="typescript"')
    expect(html).toContain('data-filename="app.ts"')
  })
})
