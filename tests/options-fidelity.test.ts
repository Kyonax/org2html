/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * tests/options-fidelity.test.ts — the #+OPTIONS matrix, ox.el semantics.
 *
 * Every explicitly-set item must behave exactly as Emacs's exporter treats it.
 * Four defaults deviate on purpose and are locked here by name: toc (author-
 * driven, see toc-policy.test.ts), num (nil), ^ ({} — braces required), and
 * H (6 — all levels stay headings unless demoted). Everything else keeps the
 * ox.el default: -:t, e:t, f:t, |:t, ::t, <:t, *:t, d:t, todo:t, tags:t,
 * stat:t, inline:t, tasks:t, title:t, author:t, date:t, tex:t — and pri:nil,
 * email:nil, ':nil, \n:nil.
 */

import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

async function render(src: string): Promise<string> {
  const { html } = await renderToHtml(parse(src), { codeHighlight: false })
  return html
}

const HEADER = "#+TITLE: T\n#+AUTHOR: Ada\n#+EMAIL: ada@example.org\n#+DATE: 2026-01-02\n"

describe("title / author / email / date", () => {
  it("title:nil drops the article header but keeps body headings", async () => {
    const html = await render(`${HEADER}#+OPTIONS: title:nil\n\n* One\n`)
    expect(html).not.toContain("org-article-header")
    expect(html).not.toContain("org-heading--title")
    // Offset returns to 0: the first org headline becomes the page h1.
    expect(html).toContain('<h1 class="org-heading outline-1"')
  })

  it("author:nil hides the author, date:nil the date; both show by default", async () => {
    const on = await render(`${HEADER}\nBody.\n`)
    expect(on).toContain("org-article-author")
    expect(on).toContain("org-article-date")
    const off = await render(`${HEADER}#+OPTIONS: author:nil date:nil\n\nBody.\n`)
    expect(off).not.toContain("org-article-author")
    expect(off).not.toContain("org-article-date")
  })

  it("email is hidden by default and shown by email:t as a mailto link", async () => {
    const off = await render(`${HEADER}\nBody.\n`)
    expect(off).not.toContain("org-article-email")
    const on = await render(`${HEADER}#+OPTIONS: email:t\n\nBody.\n`)
    expect(on).toContain('class="org-article-email" href="mailto:ada@example.org"')
  })
})

describe("headline decorations", () => {
  const TASK = "* TODO [#A] Ship it :work:\nBody.\n"

  it("todo keywords show by default; todo:nil hides them", async () => {
    expect(await render(`#+TITLE: T\n\n${TASK}`)).toContain('class="org-todo"')
    expect(await render(`#+TITLE: T\n#+OPTIONS: todo:nil\n\n${TASK}`)).not.toContain("org-todo")
  })

  it("priority cookies are HIDDEN by default (Emacs pri:nil) and shown by pri:t", async () => {
    expect(await render(`#+TITLE: T\n\n${TASK}`)).not.toContain("org-priority")
    expect(await render(`#+TITLE: T\n#+OPTIONS: pri:t\n\n${TASK}`)).toContain("[#A]")
  })

  it("tags show by default; tags:nil hides the chips", async () => {
    expect(await render(`#+TITLE: T\n\n${TASK}`)).toContain('class="org-tag"')
    expect(await render(`#+TITLE: T\n#+OPTIONS: tags:nil\n\n${TASK}`)).not.toContain("org-tag")
  })
})

describe("tasks: filter", () => {
  const DOC = "* TODO Open task\n\n* DONE Closed task\n\n* Plain section\n"

  it("tasks:nil drops every task headline, keeps plain sections", async () => {
    const html = await render(`#+TITLE: T\n#+OPTIONS: tasks:nil\n\n${DOC}`)
    expect(html).not.toContain("Open task")
    expect(html).not.toContain("Closed task")
    expect(html).toContain("Plain section")
  })

  it("tasks:todo keeps only open tasks; tasks:done only closed ones", async () => {
    const todo = await render(`#+TITLE: T\n#+OPTIONS: tasks:todo\n\n${DOC}`)
    expect(todo).toContain("Open task")
    expect(todo).not.toContain("Closed task")
    const done = await render(`#+TITLE: T\n#+OPTIONS: tasks:done\n\n${DOC}`)
    expect(done).not.toContain("Open task")
    expect(done).toContain("Closed task")
  })
})

describe("archived trees (arch:)", () => {
  const DOC = "* Kept\n\nAlive.\n\n* Old effort :ARCHIVE:\n\nBuried body.\n"

  it("default (headline): the bare headline survives, its contents do not", async () => {
    const html = await render(`#+TITLE: T\n\n${DOC}`)
    expect(html).toContain("Old effort")
    expect(html).not.toContain("Buried body")
  })

  it("arch:nil drops the subtree entirely; arch:t exports it fully", async () => {
    const off = await render(`#+TITLE: T\n#+OPTIONS: arch:nil\n\n${DOC}`)
    expect(off).not.toContain("Old effort")
    const on = await render(`#+TITLE: T\n#+OPTIONS: arch:t\n\n${DOC}`)
    expect(on).toContain("Buried body")
  })
})

describe("H: headline depth", () => {
  const DEEP = "* One\n\n** Two\n\n*** Three\n\n**** Four\n\nDeep body.\n"

  it("default keeps every level a real heading (web deviation, H:6)", async () => {
    const html = await render(`#+TITLE: T\n\n${DEEP}`)
    expect(html).toContain('outline-4')
    expect(html).not.toContain("org-low-level")
  })

  it("H:3 demotes level 4 to a list item that keeps its body and skips the TOC", async () => {
    const html = await render(`#+TITLE: T\n#+OPTIONS: H:3 toc:t\n\n${DEEP}`)
    expect(html).not.toContain("outline-4")
    expect(html).toContain('class="org-ul org-low-level"')
    expect(html).toContain("Deep body.")
    const toc = html.slice(html.indexOf('class="org-toc"'), html.indexOf("</nav>"))
    expect(toc).not.toContain("Four")
  })
})

describe("inline objects", () => {
  it("<:nil removes timestamps (default keeps them)", async () => {
    const doc = "#+TITLE: T\n\nMeet on <2026-03-04 Wed>.\n"
    expect(await render(doc)).toContain("org-timestamp")
    expect(await render(doc.replace("\n\n", "\n#+OPTIONS: <:nil\n\n"))).not.toContain("org-timestamp")
  })

  it("stat:nil removes statistics cookies (default keeps them)", async () => {
    const doc = "#+TITLE: T\n\nProgress [1/2] and [50%].\n"
    expect(await render(doc)).toContain("org-statistics-cookie")
    expect(await render(doc.replace("\n\n", "\n#+OPTIONS: stat:nil\n\n"))).not.toContain("org-statistics-cookie")
  })

  it("f:nil removes footnote references AND the footnotes section", async () => {
    const doc = "#+TITLE: T\n\nClaim.[fn:1]\n\n[fn:1] Proof.\n"
    expect(await render(doc)).toContain("org-footnotes")
    const off = await render(doc.replace("\n\nClaim", "\n#+OPTIONS: f:nil\n\nClaim"))
    expect(off).not.toContain("org-fnref")
    expect(off).not.toContain("org-footnotes")
  })

  it("*:nil switches emphasis off but keeps code/verbatim objects", async () => {
    const doc = "#+TITLE: T\n#+OPTIONS: *:nil\n\nStay *plain* but keep ~code~.\n"
    const html = await render(doc)
    expect(html).not.toContain("<strong>")
    expect(html).toContain("*plain*")
    expect(html).toContain('class="org-code"')
  })

  it("e:nil leaves entities as their \\name text (default converts)", async () => {
    const doc = "#+TITLE: T\n\nAlpha: \\alpha done.\n"
    expect(await render(doc)).toContain("α")
    expect(await render(doc.replace("\n\n", "\n#+OPTIONS: e:nil\n\n"))).toContain("\\alpha")
  })

  it("tex:nil drops math fragments; tex:verbatim shows the raw source", async () => {
    const doc = "#+TITLE: T\n\nEnergy \\(E=mc^2\\) here.\n"
    expect(await render(doc)).toContain("org-math")
    const off = await render(doc.replace("\n\nEnergy", "\n#+OPTIONS: tex:nil\n\nEnergy"))
    expect(off).not.toContain("org-math")
    expect(off).not.toContain("mc^2")
    const verb = await render(doc.replace("\n\nEnergy", "\n#+OPTIONS: tex:verbatim\n\nEnergy"))
    expect(verb).not.toContain("org-math")
    expect(verb).toContain("mc^2")
  })
})

describe("sub/superscripts (^:)", () => {
  it("default is braces-only: a_{b} works, snake_case survives", async () => {
    const html = await render("#+TITLE: T\n\nH_{2}O and snake_case.\n")
    expect(html).toContain("org-subscript")
    expect(html).toContain("snake_case")
  })

  it("^:nil switches both forms off entirely", async () => {
    const html = await render("#+TITLE: T\n#+OPTIONS: ^:nil\n\nH_{2}O and E=mc^{2}.\n")
    expect(html).not.toContain("org-subscript")
    expect(html).not.toContain("org-superscript")
  })

  it("^:t enables the bare form — snake_case subscripts, exactly as Emacs", async () => {
    const html = await render("#+TITLE: T\n#+OPTIONS: ^:t\n\nx_2 rises and snake_case mangles.\n")
    expect(html).toContain('x<sub class="org-subscript">2</sub>')
    expect(html).toContain('snake<sub class="org-subscript">case</sub>')
  })
})

describe("blocks", () => {
  it("|:nil drops tables", async () => {
    const doc = "#+TITLE: T\n\n| a | b |\n| 1 | 2 |\n"
    expect(await render(doc)).toContain("org-table")
    expect(await render(doc.replace("\n\n|", "\n#+OPTIONS: |:nil\n\n|"))).not.toContain("org-table")
  })

  it("::nil drops fixed-width sections (and the :: token parses at all)", async () => {
    const doc = "#+TITLE: T\n\nIntro.\n\n: fixed line\n"
    expect(await render(doc)).toContain("org-fixed-width")
    expect(await render(doc.replace("#+TITLE: T", "#+TITLE: T\n#+OPTIONS: ::nil"))).not.toContain("org-fixed-width")
  })

  it("d:nil drops drawers", async () => {
    const doc = "#+TITLE: T\n\n* S\n:NOTES:\nhidden note\n:END:\n"
    expect(await render(doc)).toContain("org-drawer")
    expect(await render(doc.replace("#+TITLE: T", "#+TITLE: T\n#+OPTIONS: d:nil"))).not.toContain("org-drawer")
  })
})

describe("prose transforms", () => {
  it("special strings convert by default (Emacs -:t): -- — ... and stay put in code", async () => {
    const html = await render("#+TITLE: T\n\npages 3--7 --- see more... in ~a --flag~ and =b --opt=.\n")
    expect(html).toContain("3–7")
    expect(html).toContain("—")
    expect(html).toContain("more…")
    expect(html).toContain("--flag")
    expect(html).toContain("--opt")
  })

  it("-:nil leaves the raw sequences alone", async () => {
    const html = await render("#+TITLE: T\n#+OPTIONS: -:nil\n\npages 3--7 end...\n")
    expect(html).toContain("3--7")
    expect(html).toContain("end...")
  })

  it("':t applies English smart quotes; default leaves straight quotes", async () => {
    const doc = `#+TITLE: T\n\nShe said "hello" and it's fine.\n`
    expect(await render(doc)).toContain(`"hello"`)
    const on = await render(doc.replace("\n\nShe", "\n#+OPTIONS: ':t\n\nShe"))
    expect(on).toContain("“hello”")
    expect(on).toContain("it’s")
  })

  it("\\n:t preserves in-paragraph line breaks as <br>", async () => {
    const doc = "#+TITLE: T\n#+OPTIONS: \\n:t\n\nline one\nline two\n"
    expect(await render(doc)).toContain("line one<br>")
    const off = await render("#+TITLE: T\n\nline one\nline two\n")
    expect(off).not.toContain("<br>")
  })
})

describe("inlinetasks (inline:)", () => {
  const DOC = "#+TITLE: T\n\n*************** TODO Check this\n"

  it("render by default; inline:nil drops them", async () => {
    expect(await render(DOC)).toContain("org-inlinetask")
    expect(await render(DOC.replace("\n\n*", "\n#+OPTIONS: inline:nil\n\n*"))).not.toContain("org-inlinetask")
  })
})
