import { afterAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { buildCommand } from "../src/cli/commands/build.js"

/*
 * tests/prune.test.ts — the slug → prune path.
 *
 * Three defects share one blast radius, so they share one file: a title that
 * slugifies to NOTHING resolves to the output ROOT (T1-1), the prune is
 * recursive and unkeyed so it takes live pages and other corpora with it
 * (T1-3), and a FAILING build still prunes the page it failed to rebuild
 * (T2-3). Every one of them exits 0 while doing it — a silent wrong answer.
 */

const work = mkdtempSync(join(tmpdir(), "o2h-prune-"))
afterAll(() => rmSync(work, { recursive: true, force: true }))

vi.spyOn(console, "log").mockImplementation(() => {})

const build = (input: string, out: string, extra: Record<string, unknown> = {}) =>
  buildCommand(input, { output: out, highlight: false, quiet: true, ...extra })

function manifestPages(out: string): string[] {
  const raw = JSON.parse(readFileSync(join(out, ".o2h-manifest.json"), "utf-8"))
  return Array.isArray(raw) ? raw : raw.pages
}

/** Isolate a build that is expected to fail so it cannot leak exitCode 1 into the run. */
async function buildExpectingFailure(input: string, out: string, extra: Record<string, unknown> = {}) {
  const prev = process.exitCode
  process.exitCode = 0
  await build(input, out, extra)
  const code = process.exitCode
  process.exitCode = prev
  return code
}

describe("T1-1 — a slug that collapses to nothing", () => {
  it("never writes a page to the output root", async () => {
    const inDir = join(work, "cjk-in")
    const out = join(work, "cjk-out")
    mkdirSync(inDir, { recursive: true })
    // slugify(strict) drops every one of these to "" — CJK, punctuation, an em
    // dash and an emoji. With no #+DATE there is no prefix to save the path.
    writeFileSync(join(inDir, "japanese.org"), "#+TITLE: 日本語のタイトル\n\nBody.\n")

    await build(inDir, out)

    expect(existsSync(join(out, "index.html"))).toBe(false)
    const pages = manifestPages(out)
    expect(pages).toHaveLength(1)
    expect(pages[0]).not.toBe("")
    expect(existsSync(join(out, pages[0], "index.html"))).toBe(true)
  })

  it("gives the same document the same route on a second build", async () => {
    const inDir = join(work, "cjk-stable-in")
    const out1 = join(work, "cjk-stable-out1")
    const out2 = join(work, "cjk-stable-out2")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "emoji-post.org"), "#+TITLE: 🎉\n\nBody.\n")

    await build(inDir, out1)
    await build(inDir, out2)

    expect(manifestPages(out1)).toEqual(manifestPages(out2))
    expect(manifestPages(out1)[0]).not.toBe("")
  })

  it("does not prune the output ROOT when a stale entry is the empty path", async () => {
    const inDir = join(work, "wipe-in")
    const out = join(work, "wipe-out")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "japanese.org"), "#+TITLE: 日本語のタイトル\n\nBody.\n")
    await build(inDir, out)

    // Operator files a host puts in the output directory. They are not ours and
    // must survive every rebuild.
    writeFileSync(join(out, "CNAME"), "example.com\n")
    mkdirSync(join(out, "assets"), { recursive: true })
    writeFileSync(join(out, "assets", "logo.png"), "png")

    rmSync(join(inDir, "japanese.org"))
    writeFileSync(join(inDir, "latin.org"), "#+TITLE: Latin\n\nBody.\n")
    await build(inDir, out)

    expect(existsSync(join(out, "CNAME"))).toBe(true)
    expect(existsSync(join(out, "assets", "logo.png"))).toBe(true)
    expect(existsSync(join(out, "styles.css"))).toBe(true)
    expect(existsSync(join(out, "2026-01-01-latin", "index.html")) || existsSync(join(out, "latin", "index.html"))).toBe(true)
  })
})

describe("T1-3 — the prune is recursive and unkeyed", () => {
  it("does not take a live child page down with its stale parent", async () => {
    const inDir = join(work, "nest-in")
    const out = join(work, "nest-out")
    mkdirSync(join(inDir, "docs", "guide"), { recursive: true })
    writeFileSync(join(inDir, "docs", "guide.org"), "#+TITLE: Guide\n\ng\n")
    writeFileSync(join(inDir, "docs", "guide", "intro.org"), "#+TITLE: Intro\n\ni\n")

    await build(inDir, out)
    expect(existsSync(join(out, "docs", "guide", "index.html"))).toBe(true)
    expect(existsSync(join(out, "docs", "guide", "intro", "index.html"))).toBe(true)

    rmSync(join(inDir, "docs", "guide.org"))
    await build(inDir, out)

    // The stale page goes…
    expect(existsSync(join(out, "docs", "guide", "index.html"))).toBe(false)
    // …and the CURRENT page nested under its path stays.
    expect(existsSync(join(out, "docs", "guide", "intro", "index.html"))).toBe(true)
    expect(manifestPages(out)).toContain("docs/guide/intro")
  })

  it("does not prune another corpus that shares --output", async () => {
    const blogDir = join(work, "blog-in")
    const docsDir = join(work, "docs-in")
    const out = join(work, "shared-out")
    mkdirSync(blogDir, { recursive: true })
    mkdirSync(docsDir, { recursive: true })
    writeFileSync(join(blogDir, "post.org"), "#+TITLE: Post\n\np\n")
    writeFileSync(join(docsDir, "page.org"), "#+TITLE: Page\n\nq\n")

    await build(blogDir, out)
    expect(existsSync(join(out, "post", "index.html"))).toBe(true)

    const errs: string[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      errs.push(a.map(String).join(" "))
    })
    await build(docsDir, out)
    spy.mockRestore()

    expect(existsSync(join(out, "page", "index.html"))).toBe(true)
    // The first corpus is NOT ours to delete — refuse, and say so.
    expect(existsSync(join(out, "post", "index.html"))).toBe(true)
    expect(errs.join("\n")).toMatch(/not pruning/)
  })

  it("removes only the engine's own artefacts from a pruned page", async () => {
    const inDir = join(work, "artefact-in")
    const out = join(work, "artefact-out")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "keep.org"), "#+TITLE: Keep\n\nk\n")
    writeFileSync(join(inDir, "gone.org"), "#+TITLE: Gone\n\ng\n")
    await build(inDir, out)
    expect(existsSync(join(out, "gone", "index.html"))).toBe(true)

    // A file the operator dropped inside a page directory.
    writeFileSync(join(out, "gone", "hand-written.txt"), "mine\n")

    rmSync(join(inDir, "gone.org"))
    await build(inDir, out)

    expect(existsSync(join(out, "gone", "index.html"))).toBe(false)
    expect(existsSync(join(out, "gone", "metadata.json"))).toBe(false)
    expect(existsSync(join(out, "gone", "hand-written.txt"))).toBe(true)
  })
})

describe("T2-3 — a failing build still prunes", () => {
  it("prunes nothing when the build reports a failure", async () => {
    const inDir = join(work, "fail-in")
    const out = join(work, "fail-out")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "good.org"), "#+TITLE: Good\n\ng\n")
    writeFileSync(join(inDir, "bad.org"), "#+TITLE: Bad\n\nb\n")

    await build(inDir, out)
    expect(existsSync(join(out, "good", "index.html"))).toBe(true)
    expect(existsSync(join(out, "bad", "index.html"))).toBe(true)
    const before = manifestPages(out).slice().sort()

    // Break the second document. Under --strict an unknown component throws, so
    // the file fails to render and never reaches usedPaths.
    writeFileSync(join(inDir, "bad.org"), "#+TITLE: Bad\n\n{{< Nope >}}\n")
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const code = await buildExpectingFailure(inDir, out, { strict: true })
    spy.mockRestore()

    expect(code).toBe(1)
    // The last good page a redeploy would serve is still on disk…
    expect(existsSync(join(out, "bad", "index.html"))).toBe(true)
    // …and the manifest still describes it.
    expect(manifestPages(out).slice().sort()).toEqual(before)
  })
})
