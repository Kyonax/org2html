/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * tests/affiliated-stacking.test.ts — the 2026-08-24 style-audit findings.
 *
 * Three defects the kitchen-sink audit document surfaced, each locked here:
 *   1. affiliated keywords cleared each other, so `#+ATTR_HTML` + `#+CAPTION`
 *      (or `#+NAME` + `#+CAPTION`) silently lost whichever came first —
 *      including authored caption TEXT;
 *   2. `<hr>` shipped with no class, leaving `.org-hr` and its variants
 *      unreachable from Org;
 *   3. the heading level was clamped to 6 BEFORE the `H:` depth test, so the
 *      engine's default `H:6` could never demote a deeper headline.
 */

import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

async function render(src: string): Promise<string> {
  const { html } = await renderToHtml(parse(src), { codeHighlight: false })
  return html
}

describe("affiliated keywords stack in any order", () => {
  it("keeps the ATTR_HTML class when a CAPTION follows it", async () => {
    const html = await render(
      "#+ATTR_HTML: :class org-figure--hatch\n#+CAPTION: attr then caption\n[[/p.svg]]\n"
    )
    expect(html).toContain('class="org-figure org-figure--hatch"')
    expect(html).toContain('<figcaption class="org-figcaption">attr then caption</figcaption>')
  })

  it("keeps the CAPTION when an ATTR_HTML follows it", async () => {
    const html = await render(
      "#+CAPTION: caption then attr\n#+ATTR_HTML: :class org-figure--bracket\n[[/p.svg]]\n"
    )
    expect(html).toContain('class="org-figure org-figure--bracket"')
    expect(html).toContain('<figcaption class="org-figcaption">caption then attr</figcaption>')
  })

  it("keeps both the NAME anchor and the CAPTION on a table, either order", async () => {
    const first = await render("#+CAPTION: budget\n#+NAME: t-a\n| a | b |\n|---+---|\n| 1 | 2 |\n")
    // The anchor rides the OUTERMOST box of the named block, which is the table's scroll
    // frame — so `[[t-a]]` lands on the whole table rather than inside its own scroller.
    expect(first).toContain('<div id="t-a" class="org-table-scroll">')
    expect(first).toContain('<table class="org-table">')
    expect(first).toContain('<caption class="org-table-caption">budget</caption>')

    const second = await render("#+NAME: t-b\n#+CAPTION: budget\n| a | b |\n|---+---|\n| 1 | 2 |\n")
    expect(second).toContain('<div id="t-b" class="org-table-scroll">')
    expect(second).toContain('<table class="org-table">')
    expect(second).toContain('<caption class="org-table-caption">budget</caption>')
  })

  it("still carries a RESULTS tag across a stacked NAME", async () => {
    const html = await render("#+RESULTS:\n#+NAME: out\n: 4 documents parsed\n")
    expect(html).toContain("org-results")
  })

  it("clears the pendings once the block below has consumed them", async () => {
    const html = await render(
      "#+ATTR_HTML: :class org-figure--hatch\n[[/one.svg]]\n\n[[/two.svg]]\n"
    )
    expect(html.match(/org-figure--hatch/g)).toHaveLength(1)
  })
})

describe("horizontal rules carry their hook", () => {
  it("emits .org-hr by default", async () => {
    expect(await render("para\n\n-----\n")).toContain('<hr class="org-hr">')
  })

  it("appends the ATTR_HTML variant", async () => {
    const html = await render("#+ATTR_HTML: :class org-hr--dashed\n-----\n")
    expect(html).toContain('<hr class="org-hr org-hr--dashed">')
  })
})

describe("H: depth demotion tests the Org level, not the clamped tag level", () => {
  it("demotes a level-7 headline under the default H:6", async () => {
    const html = await render("* One\n\n******* Seven\n")
    expect(html).toContain('<ul class="org-ul org-low-level">')
    expect(html).toContain('<span class="org-low-level-title">Seven</span>')
    expect(html).not.toContain("outline-7")
  })

  it("keeps a level-6 headline as a real heading", async () => {
    const html = await render("* One\n\n****** Six\n")
    expect(html).toContain('class="org-heading outline-6"')
    expect(html).not.toContain("org-low-level")
  })

  it("still honours an explicit lower depth", async () => {
    const html = await render("#+OPTIONS: H:2\n\n* One\n\n** Two\n\n*** Three\n")
    expect(html).toContain('class="org-heading outline-2"')
    expect(html).toContain('<ul class="org-ul org-low-level">')
  })
})

describe("plain lists survive continuation lines, blanks and de-dents", () => {
  it("folds a wrapped item's continuation line into the item", async () => {
    const html = await render("- one\n- two, which wraps\n  onto a second line\n")
    expect(html).toContain("onto a second line")
    expect(html.match(/<ul class="org-ul">/g)).toHaveLength(1)
    expect(html).not.toContain('<p class="org-paragraph">onto a second line')
  })

  it("keeps a sibling item that follows a nested one", async () => {
    const html = await render("- one\n- two\n  continued\n  - nested\n- three\n")
    expect(html).toContain("three")
    expect(html).toContain("nested")
  })

  it("keeps a loose list (one blank between items) as ONE list", async () => {
    const html = await render("- one\n\n- two\n\n- three\n")
    expect(html.match(/<ul class="org-ul">/g)).toHaveLength(1)
    expect(html.match(/<li>/g)).toHaveLength(3)
  })

  it("starts a new list when the bullet kind changes across a blank", async () => {
    const html = await render("- one\n\n1. two\n\n- term :: definition\n")
    expect(html).toContain('<ul class="org-ul">')
    expect(html).toContain('<ol class="org-ol">')
    expect(html).toContain('<dl class="org-dl">')
  })

  it("ends the list at two blank lines", async () => {
    const html = await render("- one\n\n\n- two\n")
    expect(html.match(/<ul class="org-ul">/g)).toHaveLength(2)
  })

  it("keeps a description item that wraps onto a continuation line", async () => {
    const html = await render("- Term one :: a definition that wraps\n  onto a second line\n- Term two :: short\n")
    expect(html).toContain('<dl class="org-dl">')
    expect(html).toContain('<dt class="org-dt">Term one</dt>')
    expect(html).toContain("onto a second line")
    expect(html).toContain('<dt class="org-dt">Term two</dt>')
  })

  it("does not swallow the paragraph that follows a list", async () => {
    const html = await render("- one\n- two\n\nA following paragraph.\n")
    expect(html).toContain('<p class="org-paragraph">A following paragraph.</p>')
  })
})

describe("inline component calls", () => {
  it("renders EVERY call on a line, not just the first", async () => {
    const html = await render('{{< kbd label="Ctrl" >}} {{< kbd label="K" >}}\n')
    expect(html.match(/data-component="kbd"/g)).toHaveLength(2)
  })

  it("renders a call inside running prose and keeps the prose", async () => {
    const html = await render('Press {{< badge count="3" >}} to continue.\n')
    expect(html).toContain('data-component="badge"')
    expect(html).toContain("Press")
    expect(html).toContain("to continue.")
    expect(html).not.toContain("{{&lt;")
  })

  it("emits a <span> inline and a <div> on its own line", async () => {
    const inline = await render('Press {{< kbd label="K" >}} now.\n')
    expect(inline).toContain('<span data-component="kbd"')

    const block = await render('{{< button label="Ship" >}}\n')
    expect(block).toContain('<div data-component="button"')
  })
})
