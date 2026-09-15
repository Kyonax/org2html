import { describe, expect, it } from "vitest"
import { parse as parseOrg } from "../src/index.js"
import { readFileSync } from "fs"
import { join } from "path"
import { parse, renderToHtml } from "../src/index.js"

const render = (org: string) =>
  renderToHtml(parse(org), { sanitize: false, codeHighlight: false }).then((r) => r.html)

describe("S0-1 — inline-markup recursion is bounded (no stack overflow)", () => {
  it("renders the stress fixture without throwing", async () => {
    const fixture = readFileSync(join(__dirname, "fixtures", "stress-emphasis.org"), "utf-8")
    const html = await render(fixture)
    expect(html).toContain('class="org-root"')
    // normal emphasis on the first line still resolves
    expect(html).toContain("<strong>bold</strong>")
  })

  it("degrades an extreme emphasis run to text instead of crashing", async () => {
    const t0 = Date.now()
    const html = await render("*".repeat(10000) + "\n")
    const ms = Date.now() - t0
    expect(html).toBeTypeOf("string")
    expect(ms).toBeLessThan(2000) // O(n²) rescan also tamed by the depth cap
  })

  it("still parses genuinely nested emphasis within the cap", async () => {
    const html = await render("*a /b _c_ b/ a*\n")
    expect(html).toContain("<strong>")
    expect(html).toContain("<em>")
    expect(html).toContain("<u>")
  })
})

/*
 * T2-1 — the scan memo may not change what is parsed.
 *
 * parseInlineMarkup memoises forward scans that FAILED, so an opener whose
 * closer is not in the text is not searched for again. That is sound only
 * because every scanner runs forward to the end of the text and a position's
 * validity as a closer never depends on where the scan began.
 *
 * The risk the memo introduces is a FALSE "already known to fail" — either
 * leaking between different closers, or outliving the text it was measured on.
 * These pin both. Greedy matching itself is unchanged and not under test here:
 * `*x *y and *closed*` has always produced one <strong> spanning the line,
 * because the first opener finds the last marker, and it still does.
 */
describe("T2-1 — memoised scans leave the parse unchanged", () => {
  it("does not let one kind's failed scan suppress another kind", async () => {
    // The $ scan fails (no closing $ anywhere) and the [[ scan fails; the
    // emphasis that follows must still be found.
    const html = await render("$a $b and [[c [[d then *bold* here\n")
    expect(html).toContain("<strong>bold</strong>")
  })

  it("does not let a failed scan in one paragraph affect the next", async () => {
    // Each paragraph is its own parseInlineMarkup call and its own memo. A memo
    // that outlived its text — a module-level Map, say — would remember that the
    // first paragraph has no closing $ and refuse to parse the second one's math.
    const html = await render("$a $b with no closer\n\nThen $x + y$ is math.\n")
    expect(html).toContain('<span class="org-math"')
    expect(html).toContain("<mi>x</mi>")
    // …and the genuinely unclosed one stays literal.
    expect(html).toContain("$a $b with no closer")
  })

  it("still recognises every closed construct after a long unclosed run", async () => {
    const html = await render("{{{a {{{b ".repeat(100) + "and [[https://example.com][ok]] here\n")
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain(">ok<")
  })

  it("leaves an unclosed opener as literal text rather than eating the line", async () => {
    const html = await render("A lone [[ bracket and a {{{ brace.\n")
    expect(html).toContain("[[")
    expect(html).toContain("{{{")
  })
})

/*
 * T3-5 — pathological depth and repetition get a sentence, not a stack trace.
 */
describe("T3-5 — nested dynamic blocks fail by name", () => {
  const nest = (depth: number) =>
    "#+BEGIN: b\n".repeat(depth) + "x\n" + "#+END:\n".repeat(depth)

  it("parses a reasonable nesting", () => {
    expect(() => parseOrg(nest(10))).not.toThrow()
  })

  it("names the limit instead of exhausting the stack", () => {
    // Before the cap this recursed through the tokenizer until V8 gave up with a
    // bare "Maximum call stack size exceeded" at about 4000 levels.
    expect(() => parseOrg(nest(200))).toThrow(/dynamic blocks nested deeper than/)
    expect(() => parseOrg(nest(200))).not.toThrow(/call stack/)
  })
})

describe("T3-5 — repeated headings keep unique ids without quadratic cost", () => {
  it("numbers identical titles in order", async () => {
    const html = await render("* Same\n".repeat(5))
    for (const id of ["same", "same-2", "same-3", "same-4", "same-5"]) {
      expect(html).toContain(`id="${id}"`)
    }
  })

  it("gives every one of a thousand identical titles a distinct id", async () => {
    const html = await render("* Same\n".repeat(1000))
    const ids = [...html.matchAll(/id="(same[^"]*)"/g)].map((m) => m[1])
    expect(ids).toHaveLength(1000)
    expect(new Set(ids).size).toBe(1000)
  })

  it("still respects an explicit CUSTOM_ID that collides with the counter", async () => {
    const org = "* Same\n* Taken\n:PROPERTIES:\n:CUSTOM_ID: same-2\n:END:\n* Same\n"
    const html = await render(org)
    const ids = [...html.matchAll(/id="(same[^"]*)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })
})
