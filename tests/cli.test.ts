import { afterAll, describe, expect, it, vi } from "vitest"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { buildCommand } from "../src/cli/commands/build.js"

const work = mkdtempSync(join(tmpdir(), "o2h-cli-"))
afterAll(() => rmSync(work, { recursive: true, force: true }))

// Silence the command's chalk logging during the test run.
vi.spyOn(console, "log").mockImplementation(() => {})

describe("Phase 8 — build command", () => {
  it("renders an .org file to index.html + index.vue + sidecars", async () => {
    const src = join(work, "post.org")
    writeFileSync(src, "#+TITLE: CLI Test\n#+DATE: 2026-07-01\n\n* Section\n\nBody with a *bold* word.\n")
    const out = join(work, "out")

    await buildCommand(src, { output: out, highlight: false, sanitize: true })

    // Slug is derived from title/date; find the produced page dir.
    const html = findFile(out, "index.html")
    const vue = findFile(out, "index.vue")
    expect(html).toBeTruthy()
    expect(vue).toBeTruthy()

    const htmlText = readFileSync(html!, "utf-8")
    expect(htmlText).toContain('<main id="main">')
    expect(htmlText).toContain('<h1 class="org-heading org-heading--title"')
    expect(htmlText).toContain("--o2h-signal-500") // default styles inlined

    const vueText = readFileSync(vue!, "utf-8")
    expect(vueText).toContain("<template>")
    expect(vueText).toContain("export const seoMeta")

    expect(existsSync(join(out, "sitemap.json"))).toBe(true)
    expect(existsSync(join(out, "feed.json"))).toBe(true)
    expect(existsSync(join(out, "styles.css"))).toBe(true)
  })

  it("sets a non-zero exit code when no .org files match", async () => {
    const prev = process.exitCode
    process.exitCode = 0
    await buildCommand(join(work, "does-not-exist"), { output: join(work, "empty") })
    expect(process.exitCode).toBe(1)
    process.exitCode = prev
  })

  it("S1-2: throws a typed error when --output is an existing file", async () => {
    const asFile = join(work, "is-a-file")
    writeFileSync(asFile, "x")
    const src = join(work, "s1.org")
    writeFileSync(src, "#+TITLE: X\n\nBody.\n")
    await expect(buildCommand(src, { output: asFile })).rejects.toThrow(/not a directory/)
  })

  it("S3-1: --quiet still builds (functional)", async () => {
    const src = join(work, "q.org")
    writeFileSync(src, "#+TITLE: Quiet\n#+DATE: 2026-02-02\n\nBody.\n")
    const out = join(work, "q-out")
    await buildCommand(src, { output: out, highlight: false, quiet: true })
    expect(findFile(out, "index.html")).toBeTruthy()
  })

  it("S3-2: a rebuild prunes the output of a deleted source", async () => {
    const inDir = join(work, "prune-in")
    const out = join(work, "prune-out")
    mkdirSync(inDir, { recursive: true })
    writeFileSync(join(inDir, "keep.org"), "#+TITLE: Keep\n#+DATE: 2026-03-01\n\nk\n")
    const goneSrc = join(inDir, "gone.org")
    writeFileSync(goneSrc, "#+TITLE: Gone\n#+DATE: 2026-03-02\n\ng\n")
    await buildCommand(inDir, { output: out, highlight: false, quiet: true })
    expect(existsSync(join(out, "2026-03-02-gone"))).toBe(true)

    rmSync(goneSrc)
    await buildCommand(inDir, { output: out, highlight: false, quiet: true })
    // the deleted source's output dir is pruned; only "keep" remains
    expect(existsSync(join(out, "2026-03-02-gone"))).toBe(false)
    expect(existsSync(join(out, "2026-03-01-keep"))).toBe(true)
  })

  /*
   * og-metadata.json is a HEAD in sidecar form, so it answers to the same rule: the SITE's
   * name, never the article's, and one resolved theme colour rather than a second literal
   * default that a swapped style book would silently leave behind.
   */
  it("resolves og-metadata.json through the same SEO fields as the head", async () => {
    const src = join(work, "sidecar.org")
    writeFileSync(
      src,
      "#+TITLE: A Post Is Not A Site\n#+SITE_NAME: kyonax.com\n#+DATE: 2026-07-01\n\nBody.\n",
    )
    const out = join(work, "sidecar-out")

    await buildCommand(src, { output: out, highlight: false, quiet: true })

    const og = JSON.parse(readFileSync(findFile(out, "og-metadata.json")!, "utf-8"))
    expect(og.siteName).toBe("kyonax.com")
    expect(og.siteName).not.toBe("A Post Is Not A Site")
    // The default book's accent, not the old hardcoded #0066cc this sidecar used to invent.
    expect(og.themeColor).toBe("#f9cd26")
  })

  it("omits siteName from og-metadata.json when the document names no site", async () => {
    const src = join(work, "anon.org")
    writeFileSync(src, "#+TITLE: Unnamed Site\n#+DATE: 2026-07-01\n\nBody.\n")
    const out = join(work, "anon-out")

    await buildCommand(src, { output: out, highlight: false, quiet: true })

    const og = JSON.parse(readFileSync(findFile(out, "og-metadata.json")!, "utf-8"))
    expect(og.siteName).toBeUndefined()
  })
})

// Recursively find the first file named `name` under `dir`.
function findFile(dir: string, name: string): string | null {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) {
      const found = findFile(p, name)
      if (found) return found
    } else if (entry === name) {
      return p
    }
  }
  return null
}

describe("#+POST_URL — comments are DATA, and reach the sidecar", () => {
  it("writes postUrl and postId into metadata.json, and no comment markup anywhere", async () => {
    // The engine's whole job here is to record the reference. A separate scheduled tool
    // fetches the thread and the host renders it, exactly as relations already work ([P-00]).
    const src = join(work, "announced.org")
    writeFileSync(
      src,
      [
        "#+TITLE: Announced",
        "#+POST_URL: https://x.com/kyonax_on_tech/status/2094691954227400762",
        "",
        "Body.",
      ].join("\n"),
    )
    const out = join(work, "out-posturl")

    await buildCommand(src, { output: out, highlight: false, sanitize: true })

    const meta = JSON.parse(readFileSync(findFile(out, "metadata.json"), "utf-8"))
    expect(meta.postId).toBe("2094691954227400762")
    expect(meta.postUrl).toBe("https://x.com/kyonax_on_tech/status/2094691954227400762")

    // …and the rendered page carries NO COMMENT MARKUP. That is the contract — not that the
    // post goes unmentioned. The URL appears exactly once, as machine-readable discussionUrl
    // in the JSON-LD, which is how a crawler and a reader find the replies to check them.
    // Anything more (a thread, a count, a reply) would be the engine doing the host's job.
    const html = readFileSync(findFile(out, "index.html"), "utf-8")
    expect(html).not.toContain("doc-comments")
    expect(html).not.toContain("org-comment")
    expect(html.split("2094691954227400762").length - 1).toBe(1)
    const ld = html.slice(html.indexOf("application/ld+json"))
    expect(ld).toContain("discussionUrl")
  })
})

/*
 * WARNINGS THAT NEVER REACHED THE EXIT CODE (T1-8) + the large-document hint (T2-5).
 *
 * Every failure below used to print through console.log — which --quiet
 * replaces with a no-op — and leave the exit code at 0. A CI step that asked
 * "did the build work?" got yes, with zero bytes of output.
 */
async function buildCapturingStderr(input: string, options: Record<string, unknown>) {
  const errs: string[] = []
  const spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
    errs.push(a.map(String).join(" "))
  })
  const prev = process.exitCode
  process.exitCode = 0
  try {
    await buildCommand(input, options)
  } finally {
    spy.mockRestore()
  }
  const code = process.exitCode
  process.exitCode = prev
  return { code, stderr: errs.join("\n") }
}

describe("T1-8 — a failed write is a failed build", () => {
  it("fails when routes.js cannot be written, even under --quiet", async () => {
    const src = join(work, "r1.org")
    writeFileSync(src, "#+TITLE: R1\n#+DATE: 2026-04-01\n\nBody.\n")
    const out = join(work, "routes-blocked")
    // A directory where routes.js must go: the write throws EISDIR/ENOTEMPTY.
    mkdirSync(join(out, "routes.js"), { recursive: true })

    const { code, stderr } = await buildCapturingStderr(src, { output: out, highlight: false, quiet: true })
    expect(code).toBe(1)
    expect(stderr).toMatch(/routes\.js/)
  })

  it("fails when a template asset cannot be written, even under --quiet", async () => {
    const src = join(work, "r2.org")
    writeFileSync(src, "#+TITLE: R2\n#+DATE: 2026-04-02\n\nBody.\n")
    const out = join(work, "asset-blocked")
    mkdirSync(join(out, "favicon.svg"), { recursive: true })

    const { code, stderr } = await buildCapturingStderr(src, { output: out, highlight: false, quiet: true })
    expect(code).toBe(1)
    expect(stderr).toMatch(/favicon\.svg/)
  })
})

describe("T1-8 — --strict covers an unresolved include", () => {
  it("warns and succeeds without --strict", async () => {
    const dir = join(work, "inc-ok")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "doc.org"), '#+TITLE: Inc\n#+DATE: 2026-04-03\n\n#+INCLUDE: "missing.org"\n')
    const { code, stderr } = await buildCapturingStderr(dir, {
      output: join(work, "inc-ok-out"),
      highlight: false,
      quiet: true,
    })
    expect(code).toBe(0)
    expect(stderr).toMatch(/missing\.org/)
  })

  it("fails under --strict", async () => {
    const dir = join(work, "inc-strict")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "doc.org"), '#+TITLE: Inc\n#+DATE: 2026-04-04\n\n#+INCLUDE: "missing.org"\n')
    const { code, stderr } = await buildCapturingStderr(dir, {
      output: join(work, "inc-strict-out"),
      highlight: false,
      quiet: true,
      strict: true,
    })
    expect(code).toBe(1)
    expect(stderr).toMatch(/missing\.org/)
  })
})

describe("T1-8 — an engine warning names its document", () => {
  it("names the file in an unknown-component warning", async () => {
    const dir = join(work, "warn-named")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "ghosty.org"), "#+TITLE: Ghosty\n#+DATE: 2026-04-05\n\n{{< Ghost >}}\n")
    const { code, stderr } = await buildCapturingStderr(dir, {
      output: join(work, "warn-named-out"),
      highlight: false,
      quiet: true,
    })
    expect(code).toBe(0)
    expect(stderr).toMatch(/unknown component "Ghost"/)
    expect(stderr).toMatch(/ghosty\.org/)
  })

  it("warns that an undefined macro expanded to nothing", async () => {
    const dir = join(work, "macro-warn")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "m.org"), "#+TITLE: M\n#+DATE: 2026-04-06\n\nA {{{nosuchmacro(a,b)}}} gap.\n")
    const { code, stderr } = await buildCapturingStderr(dir, {
      output: join(work, "macro-warn-out"),
      highlight: false,
      quiet: true,
    })
    expect(code).toBe(0)
    expect(stderr).toMatch(/undefined macro "nosuchmacro"/)
  })
})

describe("T2-5 — the large-document hint", () => {
  const body = (lines: number) => "#+TITLE: Big\n#+DATE: 2026-04-07\n\n" + "word\n".repeat(lines)

  it("says nothing at 9,999 lines", async () => {
    const dir = join(work, "small-doc")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "s.org"), body(9_990))
    const { stderr } = await buildCapturingStderr(dir, {
      output: join(work, "small-doc-out"),
      highlight: false,
      quiet: true,
    })
    expect(stderr).not.toMatch(/large document/)
  })

  it("warns past 10,000 lines and names --no-highlight", async () => {
    const dir = join(work, "big-doc")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "b.org"), body(10_020))
    const { code, stderr } = await buildCapturingStderr(dir, {
      output: join(work, "big-doc-out"),
      highlight: false,
      quiet: true,
    })
    expect(code).toBe(0)
    expect(stderr).toMatch(/large document/)
    expect(stderr).toMatch(/--no-highlight/)
  })
})

/*
 * T3-4 — --verbose was accepted and read by nothing.
 *
 * A flag the parser accepts and the code never consults is worse than no flag:
 * somebody passes it to diagnose a slow or wrong build and learns nothing, and
 * concludes there is nothing to learn.
 */
describe("T3-4 — --verbose reports what the build resolved and what it cost", () => {
  it("prints resolved options and a per-document timing", async () => {
    const dir = join(work, "verbose-in")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "v.org"), "#+TITLE: V\n#+DATE: 2026-05-05\n\nbody\n")
    const lines: string[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      lines.push(a.map(String).join(" "))
    })
    await buildCommand(dir, {
      output: join(work, "verbose-out"),
      highlight: false,
      verbose: true,
    })
    spy.mockRestore()
    const out = lines.join("\n")
    expect(out).toMatch(/resolved options/i)
    expect(out).toMatch(/v\.org/)
    expect(out).toMatch(/\d+(\.\d+)?\s*ms/)
  })

  it("says nothing extra without the flag", async () => {
    const dir = join(work, "quiet-verbose-in")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "q.org"), "#+TITLE: Q\n#+DATE: 2026-05-06\n\nbody\n")
    const lines: string[] = []
    const spy = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      lines.push(a.map(String).join(" "))
    })
    await buildCommand(dir, { output: join(work, "quiet-verbose-out"), highlight: false, quiet: true })
    spy.mockRestore()
    expect(lines.join("\n")).not.toMatch(/resolved options/i)
  })
})
