import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { parse, renderToHtml } from "../src/index.js"

const fixture = readFileSync(join(__dirname, "fixtures", "code-theme.org"), "utf-8")

describe("Phase 3(a) — Shiki css-variables code theme", () => {
  it("defaults to the css-variables theme (colors deferred to --shiki-* vars)", async () => {
    const { html } = await renderToHtml(parse(fixture), { sanitize: false })
    // css-variables theme emits var(--shiki-*) instead of baked hex, so the
    // O2H --o2h-syn-* mapping can re-theme the block.
    expect(html).toContain("var(--shiki-token-keyword)")
    expect(html).toContain("var(--shiki-color-background)")
    // no baked github-dark hex leaked into the default output
    expect(html).not.toContain("#24292e")
  })

  it("adds the stable .org-src hook to the highlighted block", async () => {
    const { html } = await renderToHtml(parse(fixture), { sanitize: false })
    expect(html).toContain('<pre class="org-src shiki')
  })

  it("honors a codeTheme override (github-dark → baked hex, no --shiki-* vars)", async () => {
    const { html } = await renderToHtml(parse(fixture), {
      sanitize: false,
      codeTheme: "github-dark",
    })
    expect(html).toContain("#24292e") // github-dark background
    expect(html).not.toContain("var(--shiki-")
  })

  it("keeps the .org-src hook when highlighting is disabled", async () => {
    const { html } = await renderToHtml(parse(fixture), {
      sanitize: false,
      codeHighlight: false,
    })
    // codeHighlight:false takes the escaped-plain path (no Shiki), but styling
    // still needs the hook — the renderer emits .org-src + a language class,
    // wrapped in the SAME header-bar chrome as the highlighted path (MAP-036).
    expect(html).toContain('<pre class="org-src org-src--numbered"')
    expect(html).toContain("language-javascript")
    expect(html).toContain('<div class="org-src-block">')
  })
})

/*
 * T3-1 — an unhighlighted block says WHY.
 *
 * shiki 0.14 ships 173 grammars and emacs-lisp and org are not among them, so
 * an Org-to-HTML converter cannot highlight the two languages its own
 * documentation is most likely to contain. It degraded to a plain block in
 * silence, which reads exactly like a highlighter that is broken.
 */
describe("T3-1 — the plain-block fallback is legible", () => {
  it("marks a block whose language has no grammar", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { html } = await renderToHtml(
      parse("#+BEGIN_SRC emacs-lisp\n(message \"hi\")\n#+END_SRC\n"),
      { sanitize: false, codeHighlight: true },
    )
    spy.mockRestore()
    expect(html).toContain('data-lang="emacs-lisp"')
    expect(html).toContain("org-src--plain")
  })

  it("does not mark a block that really was highlighted", async () => {
    const { html } = await renderToHtml(
      parse("#+BEGIN_SRC javascript\nconst a = 1\n#+END_SRC\n"),
      { sanitize: false, codeHighlight: true },
    )
    expect(html).toContain("shiki")
    expect(html).not.toContain("org-src--plain")
  })
})
