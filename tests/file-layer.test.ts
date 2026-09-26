import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  parse,
  parseIncludeSpec,
  renderToHtml,
  resolveOrgFileKeywords,
  startupToOptions,
} from "../src/index.js"

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures")
const BASE = join(FIXTURES, "file-layer")

/** Resolve against the file-layer fixture dir, which is the only root by default. */
async function resolveIn(org: string, extra: Partial<Parameters<typeof resolveOrgFileKeywords>[1]> = {}) {
  return resolveOrgFileKeywords(org, { baseDir: BASE, ...extra })
}

async function render(org: string): Promise<string> {
  const { content } = await resolveIn(org)
  const { html } = await renderToHtml(parse(content), { sanitize: false, codeHighlight: false })
  return html
}

describe("#+SETUPFILE — in-buffer settings import", () => {
  it("imports #+MACRO, #+LINK and #+OPTIONS definitions", async () => {
    const html = await render(
      `#+TITLE: Setup\n#+SETUPFILE: setup-base.org\n\n{{{greet(Ada,Grace)}}} {{{brand}}}\n\nSee [[gh:kyonax/org2html][repo]].\n`,
    )
    expect(html).toContain("Hello, Ada and Grace!")
    expect(html).toContain('<b class="brand">ZERONET</b>')
    expect(html).toContain('href="https://github.com/kyonax/org2html"')
  })

  it("lets the DOCUMENT win over an imported definition", async () => {
    const { content } = await resolveIn(
      `#+TITLE: Setup\n#+MACRO: greet Overridden for $1.\n#+SETUPFILE: setup-base.org\n`,
    )
    const macros = content.split("\n").filter((l) => l.startsWith("#+MACRO: greet"))
    expect(macros).toEqual(["#+MACRO: greet Overridden for $1."])
  })

  it("follows a chained setupfile, with the nearer file winning", async () => {
    const html = await render(
      `#+TITLE: Chain\n#+SETUPFILE: setup-chain.org\n\n{{{greet(Ada,Grace)}}} {{{signoff(Kyo)}}} {{{brand}}}\n`,
    )
    // setup-chain overrides greet, adds signoff, and still inherits brand.
    expect(html).toContain("Salutations, Ada and Grace!")
    expect(html).toContain("Filed by Kyo.")
    expect(html).toContain('<b class="brand">ZERONET</b>')
    expect(html).not.toContain("Hello, Ada and Grace!")
  })

  it("ignores keyword lines buried inside a block", async () => {
    const { content } = await resolveIn(`#+TITLE: Blocked\n#+SETUPFILE: setup-blocked.org\n`)
    expect(content).toContain("#+MACRO: live defined-outside-a-block")
    expect(content).not.toContain("buried")
  })

  it("stops on a cycle instead of hanging", async () => {
    const { content, warnings } = await resolveIn(`#+TITLE: Cycle\n#+SETUPFILE: cycle-a.org\n`)
    expect(warnings.some((w) => w.includes("cycle"))).toBe(true)
    // Both files still contribute what they could before the loop closed.
    expect(content).toContain("#+MACRO: froma A")
  })

  it("warns and drops the directive when the target cannot be read", async () => {
    const { content, warnings } = await resolveIn(`#+TITLE: Missing\n#+SETUPFILE: no-such-file.org\n`)
    expect(warnings.some((w) => w.includes("cannot read"))).toBe(true)
    expect(content).not.toContain("#+SETUPFILE:")
  })

  it("leaves a #+SETUPFILE that is itself inside a block alone", async () => {
    const org = `#+TITLE: Sample\n\n#+BEGIN_SRC org\n#+SETUPFILE: setup-base.org\n#+END_SRC\n`
    const { content, warnings } = await resolveIn(org)
    expect(warnings).toEqual([])
    expect(content).toContain("#+SETUPFILE: setup-base.org")
  })
})

describe("#+INCLUDE — content splice", () => {
  it("splices a whole file in place", async () => {
    const { content } = await resolveIn(`#+TITLE: Inc\n\n#+INCLUDE: "included.org"\n`)
    expect(content).toContain("line one")
    expect(content).toContain("line four")
    expect(content).not.toContain("#+INCLUDE:")
  })

  it("honors :lines with Org's exclusive end", async () => {
    const { content } = await resolveIn(`#+TITLE: Inc\n\n#+INCLUDE: "included.org" :lines "2-4"\n`)
    expect(content).toContain("line two")
    expect(content).toContain("line three")
    expect(content).not.toContain("line one")
    expect(content).not.toContain("line four")
  })

  it("wraps as src and comma-escapes lines that would close the block", async () => {
    const { content } = await resolveIn(`#+TITLE: Inc\n\n#+INCLUDE: "included-tree.org" src org\n`)
    expect(content).toContain("#+BEGIN_SRC org")
    expect(content).toContain("#+END_SRC")
    expect(content).toContain(",* Alpha")
  })

  it("selects a subtree by ::*Heading", async () => {
    const { content } = await resolveIn(`#+TITLE: Inc\n\n#+INCLUDE: "included-tree.org::*Beta"\n`)
    expect(content).toContain("Beta body.")
    expect(content).not.toContain("Alpha body.")
  })

  it("selects a subtree by ::#custom-id", async () => {
    const { content } = await resolveIn(`#+TITLE: Inc\n\n#+INCLUDE: "included-tree.org::#alpha-id"\n`)
    expect(content).toContain("Alpha body.")
    expect(content).not.toContain("Beta body.")
  })

  it("drops the headline and its drawer under :only-contents t", async () => {
    const { content } = await resolveIn(
      `#+TITLE: Inc\n\n#+INCLUDE: "included-tree.org::*Alpha" :only-contents t\n`,
    )
    expect(content).toContain("Alpha body.")
    expect(content).not.toContain("* Alpha\n")
    expect(content).not.toContain(":CUSTOM_ID:")
  })

  it("shifts headings with :minlevel", async () => {
    const { content } = await resolveIn(`#+TITLE: Inc\n\n#+INCLUDE: "included-tree.org" :minlevel 3\n`)
    expect(content).toContain("*** Alpha")
    expect(content).toContain("**** Alpha child")
  })

  it("resolves a nested include relative to ITS own file", async () => {
    const { content, warnings } = await resolveIn(`#+TITLE: Nest\n\n#+INCLUDE: "nested/outer.org"\n`)
    expect(warnings).toEqual([])
    expect(content).toContain("Inner content")
    expect(content).toContain("Before.")
    expect(content).toContain("After.")
  })

  it("reports a missing ::*Heading rather than emitting the whole file", async () => {
    const { content, warnings } = await resolveIn(
      `#+TITLE: Inc\n\n#+INCLUDE: "included-tree.org::*Nope"\n`,
    )
    expect(warnings.some((w) => w.includes("no headline"))).toBe(true)
    expect(content).not.toContain("Alpha body.")
  })
})

describe("root confinement", () => {
  const outside = `#+TITLE: Escape\n\n#+INCLUDE: "../file-layer-outside.org"\n`

  it("refuses a target outside every permitted root", async () => {
    const { content, warnings } = await resolveIn(outside)
    expect(warnings.some((w) => w.includes("outside every permitted root"))).toBe(true)
    expect(content).not.toContain("SECRET-SENTINEL-CONTENT")
  })

  it("allows it once --include-root names the directory", async () => {
    const { content, warnings } = await resolveIn(outside, { roots: [FIXTURES] })
    expect(warnings).toEqual([])
    expect(content).toContain("SECRET-SENTINEL-CONTENT")
  })

  it("refuses an absolute path to an unrelated file", async () => {
    const { content, warnings } = await resolveIn(`#+TITLE: X\n\n#+INCLUDE: "/etc/hostname"\n`)
    expect(warnings.length).toBeGreaterThan(0)
    expect(content).not.toContain("#+INCLUDE:")
    // Nothing from the refused file may reach the document.
    expect(content.split("\n").filter((l) => l.trim()).length).toBe(1)
  })
})

describe("#+STARTUP — in-buffer switches", () => {
  it("maps the switches that have a rendered meaning onto #+OPTIONS", () => {
    expect(startupToOptions(["nonum"])).toEqual(["num:nil"])
    expect(startupToOptions(["num"])).toEqual(["num:t"])
    // Editor-visibility switches are recognized and produce nothing.
    expect(startupToOptions(["overview indent logdone"])).toEqual([])
  })

  it("prepends the derived options so the document still wins", async () => {
    const { content } = await resolveIn(`#+TITLE: S\n#+STARTUP: nonum\n#+OPTIONS: num:t\n`)
    const first = content.split("\n")[0]
    expect(first).toBe("#+OPTIONS: num:nil")
    // The document's own line comes later, and last write wins on merge.
    const { metadata } = parse(content)
    expect(metadata.options?.num).toBe(true)
  })

  it("applies the derived option when the document sets nothing", async () => {
    const { content } = await resolveIn(`#+TITLE: S\n#+STARTUP: nonum\n`)
    const { metadata } = parse(content)
    expect(metadata.options?.num).toBe(false)
  })
})

describe("macro expansion in header keywords", () => {
  it("expands {{{macro}}} inside #+AUTHOR and drops non-html export snippets", async () => {
    const org =
      `#+TITLE: Byline\n` +
      `#+MACRO: person @@latex:$1 \\\\ $2@@\n` +
      `#+MACRO: web @@html:<span>$1</span>@@\n` +
      `#+AUTHOR: {{{person(Ada Lovelace,Analytical Engines)}}}\n` +
      `#+SUBTITLE: {{{web(Live)}}}\n\nBody.\n`
    const { metadata } = parse((await resolveIn(org)).content)
    // A latex-only macro carries nothing for HTML: the correct author is empty.
    expect(metadata.author).toBe("")
    expect(metadata.subtitle).toBe("<span>Live</span>")
  })

  it("never leaves raw braces in the rendered byline", async () => {
    const html = await render(
      `#+TITLE: Byline\n#+SETUPFILE: setup-base.org\n#+AUTHOR: {{{greet(Ada,Grace)}}}\n\nBody.\n`,
    )
    expect(html).not.toContain("{{{")
    expect(html).toContain("Hello, Ada and Grace!")
  })

  it("leaves a #+MACRO definition's own braces untouched", async () => {
    const { content } = await resolveIn(
      `#+TITLE: T\n#+MACRO: outer {{{inner($1)}}}\n#+MACRO: inner [$1]\n\n{{{outer(x)}}}\n`,
    )
    expect(content).toContain("#+MACRO: outer {{{inner($1)}}}")
  })
})

describe("parseIncludeSpec", () => {
  it("parses a quoted target with a wrap and parameters", () => {
    const spec = parseIncludeSpec('"a b.org" src python :lines "3-9" :minlevel 2')
    expect(spec).toMatchObject({
      target: "a b.org",
      wrap: { kind: "src", lang: "python" },
      lines: { from: 3, to: 9 },
      minlevel: 2,
    })
  })

  it("parses an unquoted target and a ::search suffix", () => {
    expect(parseIncludeSpec("notes.org::*Setup")).toMatchObject({
      target: "notes.org",
      search: "*Setup",
    })
  })

  it("rejects an empty target and an unterminated quote", () => {
    expect(parseIncludeSpec("")).toHaveProperty("error")
    expect(parseIncludeSpec('"unclosed.org')).toHaveProperty("error")
  })
})

describe("opting out", () => {
  it("passes the document through untouched when disabled", async () => {
    const org = `#+TITLE: Off\n#+SETUPFILE: setup-base.org\n\n{{{brand}}}\n`
    const { content, files, warnings } = await resolveIn(org, { enabled: false })
    expect(content).toBe(org)
    expect(files).toEqual([])
    expect(warnings).toEqual([])
  })
})
