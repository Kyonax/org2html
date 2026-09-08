import { describe, expect, it } from "vitest"
import { join } from "path"
import { resolveStyleBook, applyTemplate } from "../src/index.js"

const builtIn = join(process.cwd(), "templates", "style-book")
const miniBook = join(__dirname, "fixtures", "mini-book")

describe("Phase 3·SB — Style Book resolver", () => {
  it("resolves the built-in kwo book (dogfood): layered css + template + full coverage", async () => {
    const book = await resolveStyleBook(builtIn, { engineVersion: "1.0.2" })
    expect(book.manifest.name).toBe("kwo")
    expect(book.css).toContain("--o2h-signal-500") // tokens layer read
    expect(book.css).toContain(".org-root") // shared construct layer read
    expect(book.css).toContain("@font-face") // the book's own layer read too
    expect(book.template).toContain("{{content}}") // template read
    expect(book.classPrefix).toBe("org-")
    // declares every known construct → no coverage warning
    expect(book.warnings.filter((w) => w.includes("construct coverage"))).toHaveLength(0)
  })

  it("still resolves the preserved O2H book, unchanged", async () => {
    // O2H was the default through v1.0.x. It stays selectable, and it is a pure
    // VALUE selection: the same shared construct sheet, a different token layer.
    const o2h = join(builtIn, "o2h")
    const book = await resolveStyleBook(o2h, { engineVersion: "1.1.0" })
    expect(book.manifest.name).toBe("o2h")
    expect(book.css).toContain("#FF5114") // Signal Orange, still exactly as signed
    expect(book.css).toContain(".org-root")
    expect(book.css).not.toContain("@font-face") // no kwo layer bleeds in
    expect(book.warnings.filter((w) => w.includes("could not be read"))).toHaveLength(0)
  })

  it("resolves an external book and warns on undeclared construct coverage", async () => {
    const book = await resolveStyleBook(miniBook, { engineVersion: "1.0.2" })
    expect(book.css).toContain("--mini-accent")
    expect(book.css).toContain("Georgia, serif")
    expect(book.componentMap).toEqual({ Callout: "@mini/Callout.vue" })
    expect(book.scripts).toEqual(["/mini-book.js"])
    const coverage = book.warnings.find((w) => w.includes("undeclared construct coverage"))
    expect(coverage).toBeTruthy()
    expect(coverage).toContain("org-table") // an undeclared hook is listed
  })

  it("warns on engineCompat major mismatch (never fatal)", async () => {
    const book = await resolveStyleBook(miniBook, { engineVersion: "2.0.0" })
    expect(book.warnings.some((w) => w.includes("engineCompat"))).toBe(true)
  })

  it("throws a clear error when the book cannot be found", async () => {
    await expect(resolveStyleBook("./no-such-book-dir")).rejects.toThrow(/style book not found/)
  })

  it("full-swap through applyTemplate replaces the default look wholesale", async () => {
    const book = await resolveStyleBook(miniBook, { engineVersion: "1.0.2" })
    const html = await applyTemplate("<p>x</p>", { title: "T" }, undefined, undefined, {
      customCss: book.css,
      styleMode: "replace",
      linkedScripts: book.scripts,
    })
    expect(html).toContain("--mini-accent")
    expect(html).not.toContain("--o2h-signal-500") // O2H default is gone (full swap)
    expect(html).toContain('<script src="/mini-book.js" defer></script>')
  })
})
