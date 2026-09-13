/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * tests/org-coverage.test.ts — Org interactions surfaced by the 2026-08-24
 * coverage audit: custom TODO sequences, dedicated/radio targets, fuzzy links
 * (target > #+NAME > headline), affiliated NAME anchors + CAPTIONs, table
 * metadata rows, diary sexps, and coderefs.
 */

import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

async function render(src: string): Promise<string> {
  const { html } = await renderToHtml(parse(src), { codeHighlight: false })
  return html
}

describe("custom TODO sequences (#+TODO / #+SEQ_TODO / #+TYP_TODO)", () => {
  it("recognizes custom states and classifies done states after the bar", async () => {
    const html = await render(
      "#+TODO: NEXT WAIT(w) | CANCELLED DONE\n\n* NEXT Move\n\n* CANCELLED Old\n\n* WAIT Hold\n"
    )
    expect(html).toContain('<span class="org-todo">NEXT</span>')
    expect(html).toContain('<span class="org-todo">WAIT</span>')
    expect(html).toContain('<span class="org-todo org-done">CANCELLED</span>')
  })

  it("custom sequences REPLACE the built-in pair, as in Emacs", async () => {
    const html = await render("#+TODO: NEXT | SHIPPED\n\n* TODO Not a state here\n")
    expect(html).not.toContain("org-todo")
    expect(html).toContain("TODO Not a state here")
  })

  it("with no bar the last keyword is the done state", async () => {
    const html = await render("#+TODO: OPEN CLOSED\n\n* CLOSED It\n")
    expect(html).toContain('<span class="org-todo org-done">CLOSED</span>')
  })
})

describe("targets and fuzzy links", () => {
  it("<<target>> renders as an invisible anchor and [[target]] resolves to it", async () => {
    const html = await render("Here <<spot>> is.\n\nGo to [[spot][the spot]].\n")
    expect(html).toContain('class="org-target"')
    expect(html).toContain('id="target-spot"')
    expect(html).toContain('href="#target-spot"')
    expect(html).not.toContain("&lt;&lt;")
  })

  it("<<<radio>>> is consumed and anchors (auto-linking not claimed)", async () => {
    const html = await render("A <<<beacon>>> here.\n\nSee [[beacon]].\n")
    expect(html).toContain('id="target-beacon"')
    expect(html).toContain('href="#target-beacon"')
  })

  it("[[name]] resolves to a #+NAME anchor on the named block", async () => {
    const html = await render(
      "#+NAME: setup-table\n| a |\n| 1 |\n\nSee [[setup-table][the table]].\n"
    )
    // The named block's anchor is on its outermost element — the table's scroll frame.
    expect(html).toContain('<div id="setup-table" class="org-table-scroll">')
    expect(html).toContain('href="#setup-table"')
  })

  it("[[Headline Title]] falls back to the headline anchor", async () => {
    const html = await render("* Deep Dive\n\nBody.\n\n* Other\n\nSee [[Deep Dive]].\n")
    expect(html).toContain('href="#deep-dive"')
  })

  it("a dedicated target outranks a headline with the same name", async () => {
    const html = await render(
      "* Results\n\nThe <<results>> anchor.\n\n* Other\n\nSee [[results]].\n"
    )
    // The heading keeps #results; the fuzzy link prefers the target's own
    // namespaced anchor — ids stay unique AND precedence stays observable.
    expect(html).toContain('id="results"')
    expect(html).toContain('id="target-results"')
    expect(html).toContain('href="#target-results"')
  })

  it("an unresolved fuzzy path passes through untouched", async () => {
    const html = await render("See [[nowhere man]].\n")
    expect(html).toContain('href="nowhere man"')
  })
})

describe("affiliated captions", () => {
  it("#+CAPTION on a table becomes <caption>", async () => {
    const html = await render("#+CAPTION: Build times\n| a |\n| 1 |\n")
    expect(html).toContain('<caption class="org-table-caption">Build times</caption>')
  })

  it("#+CAPTION on an image figure becomes <figcaption>, markup intact", async () => {
    const html = await render("#+CAPTION: The *big* one\n[[file:pic.png]]\n")
    expect(html).toContain('<figcaption class="org-figcaption">The <strong>big</strong> one</figcaption>')
  })
})

describe("table metadata rows", () => {
  it("drops a column-group row (/ <> markers)", async () => {
    const html = await render("| a | b |\n| / | <> |\n| 1 | 2 |\n")
    expect(html).not.toContain("&lt;&gt;")
    expect(html).not.toContain("<td>/</td>")
  })

  it("consumes width cookies (<10>) and aligned widths (<r10>)", async () => {
    const html = await render("| a | b |\n| <10> | <r10> |\n| 1 | 2 |\n")
    expect(html).not.toContain("&lt;10&gt;")
    expect(html).toContain("org-right")
  })
})

describe("diary sexp", () => {
  it("never leaks into the output", async () => {
    const html = await render("%%(diary-anniversary 2 14 2000) Anniversary\n\nAfter.\n")
    expect(html).not.toContain("diary-anniversary")
    expect(html).toContain("After.")
  })
})

describe("coderefs", () => {
  it("strips (ref:name) labels from src blocks and renders [[(name)]] as the line", async () => {
    const html = await render(
      "#+BEGIN_SRC js\nconst a = 1;\nconst b = 2; (ref:two)\n#+END_SRC\n\nSee [[(two)]].\n"
    )
    expect(html).not.toContain("ref:two")
    expect(html).toContain('<code class="org-coderef">line 2</code>')
  })

  it("a described coderef keeps its description", async () => {
    const html = await render(
      "#+BEGIN_SRC js\nlet x; (ref:here)\n#+END_SRC\n\nSee [[(here)][this line]].\n"
    )
    expect(html).toContain('<code class="org-coderef">this line</code>')
  })
})
