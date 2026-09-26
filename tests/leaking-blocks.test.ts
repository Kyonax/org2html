import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { parse, renderToHtml } from "../src/index.js"

function fixture(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf-8")
}

const src = fixture("./fixtures/leaking-blocks.org")

async function render(org: string): Promise<string> {
  const { html } = await renderToHtml(parse(org), {
    sanitize: false,
    codeHighlight: false,
  })
  return html
}

describe("leaking block constructs", () => {
  it("collapses consecutive ': ' lines into one fixed-width block", () => {
    const ast = parse(src)
    const fw = ast.children.find((n) => n.type === "fixedWidth")!
    expect(fw).toBeDefined()
    expect(fw.children?.[0]?.value).toBe("fixed line one\nfixed line two")
  })

  it("renders fixed-width as a verbatim <pre>", async () => {
    const html = await render(src)
    expect(html).toContain('<pre class="org-fixed-width">fixed line one\nfixed line two</pre>')
  })

  it("passes an HTML export block through and drops a non-HTML backend", async () => {
    const html = await render(src)
    expect(html).toContain('<div class="raw-widget">passthrough</div>')
    // The latex export block emits nothing.
    expect(html).not.toContain("dropped")
    expect(html).not.toContain("emph")
  })

  it("re-parses a dynamic block body into real block nodes", async () => {
    const ast = parse(src)
    const dyn = ast.children.find((n) => n.type === "dynamicBlock")!
    expect(dyn).toBeDefined()
    expect(dyn.properties?.name).toContain("generated")
    // Body became a real list, not leaked text.
    expect(dyn.children?.[0]?.type).toBe("list")

    const html = await render(src)
    expect(html).toContain('<div class="org-dynamic-block">')
    expect(html).toContain("<li>item alpha</li>")
    // The #+BEGIN:/#+END: delimiters never leak as text.
    expect(html).not.toContain("#+BEGIN")
    expect(html).not.toContain("#+END")
  })

  it("S1-3: a mismatched #+END closes a greater block + drops the orphan closer", async () => {
    const html = await render("#+BEGIN_QUOTE\nquoted line\n#+END_SRC\nafter paragraph\n")
    expect(html).toContain("quoted line")
    expect(html).toContain("after paragraph") // content after survives
    expect(html).not.toContain("#+END_SRC") // orphan closer never leaks
  })

  it("S1-3: a VERBATIM block keeps an inner #+END_<other> as literal content", async () => {
    const html = await render("#+BEGIN_SRC text\ncode\n#+END_EXAMPLE\nstill in block\n#+END_SRC\n")
    expect(html).toContain("#+END_EXAMPLE") // literal inside the code block
    expect(html).toContain("still in block")
  })
})

/*
 * T3-6 — a document that STARTS with #+BEGIN: lost its dynamic block.
 *
 * Front-matter extraction scans `#+KEY: value` lines from the top of the file,
 * and `#+BEGIN: columnview …` matches that shape exactly. So the opener and its
 * `#+END:` were consumed as document keywords named BEGIN and END, and the block
 * they delimited was never parsed. The same construct one line further down —
 * after any body text — worked, which is what made it hard to see.
 */
describe("T3-6 — #+BEGIN: at the very top of a document", () => {
  const BLOCK = "#+BEGIN: columnview :hlines 1\n| a |\n#+END:\n\nBody text.\n"

  it("parses a dynamic block that opens the file", async () => {
    const { html } = await renderToHtml(parse(BLOCK), { sanitize: false, codeHighlight: false })
    expect(html).toContain("org-dynamic-block")
  })

  it("parses one after body text, as it always did", async () => {
    const { html } = await renderToHtml(parse("Intro.\n\n" + BLOCK), {
      sanitize: false,
      codeHighlight: false,
    })
    expect(html).toContain("org-dynamic-block")
  })

  it("still reads real front matter that follows one", async () => {
    const { html } = await renderToHtml(parse("#+TITLE: Real\n" + BLOCK), {
      sanitize: false,
      codeHighlight: false,
    })
    expect(html).toContain("org-dynamic-block")
    expect(html).toContain("Real")
  })
})
