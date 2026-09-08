import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createServer, type Server } from "http"
import { mkdirSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { resolveStyleBook } from "../src/index.js"

// A tiny local server that serves a Style Book (manifest + referenced files) so
// the remote-URL resolver path (fetch + content-hash cache) is exercised
// without touching the network. [Stabilization S3-3]
let server: Server
let base: string
const FILES: Record<string, [string, string]> = {
  "/stylebook.json": [
    "application/json",
    JSON.stringify({
      name: "remote",
      version: "1.0.0",
      engineCompat: "^1",
      tokens: "tokens.css",
      styles: "book.css",
      constructs: ["org-root"],
    }),
  ],
  "/tokens.css": ["text/css", ":root{--remote-accent:#0aa}"],
  "/book.css": ["text/css", ".org-root{font-family:Georgia}"],
}

beforeAll(async () => {
  server = createServer((req, res) => {
    // strip the unique per-run prefix so /run-XXX/stylebook.json → /stylebook.json
    const path = (req.url ?? "").replace(/^\/run-[^/]+/, "")
    const hit = FILES[path]
    if (hit) {
      res.writeHead(200, { "content-type": hit[0] })
      res.end(hit[1])
    } else {
      res.writeHead(404)
      res.end("not found")
    }
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  const addr = server.address()
  const port = typeof addr === "object" && addr ? addr.port : 0
  base = `http://127.0.0.1:${port}`
})

afterAll(() => server.close())

describe("S3-3 — Style Book remote (URL) resolver", () => {
  it("fetches + resolves a book over HTTP", async () => {
    // unique path so the content-hash disk cache does not mask the first fetch
    const book = await resolveStyleBook(`${base}/run-${Date.now()}/`, { engineVersion: "1.0.0" })
    expect(book.manifest.name).toBe("remote")
    expect(book.css).toContain("--remote-accent")
    expect(book.css).toContain("Georgia")
    expect(book.warnings.some((w) => w.includes("construct coverage"))).toBe(true)
  })

  it("serves a second resolve from the content-hash cache", async () => {
    const url = `${base}/run-cache-${Date.now()}/`
    const a = await resolveStyleBook(url, { engineVersion: "1.0.0" })
    const b = await resolveStyleBook(url, { engineVersion: "1.0.0" }) // cache hit path
    expect(b.css).toBe(a.css)
  })

  it("throws a clear error when the remote book 404s", async () => {
    await expect(resolveStyleBook(`${base}/missing-${Date.now()}/stylebook.json`)).rejects.toThrow(
      /fetch failed/,
    )
  })
})

describe("S3-3 — Style Book npm-package resolver", () => {
  const pkgDir = join(process.cwd(), "node_modules", "@o2htest", "book")
  beforeAll(() => {
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, "tokens.css"), ":root{--npm-x:1}")
    writeFileSync(
      join(pkgDir, "stylebook.json"),
      JSON.stringify({ name: "npmbook", version: "1.0.0", tokens: "tokens.css", constructs: ["org-root"] }),
    )
  })
  afterAll(() => rmSync(join(process.cwd(), "node_modules", "@o2htest"), { recursive: true, force: true }))

  it("reads a book from node_modules by package name (never imported)", async () => {
    const book = await resolveStyleBook("@o2htest/book", { engineVersion: "1.0.0" })
    expect(book.manifest.name).toBe("npmbook")
    expect(book.css).toContain("--npm-x")
  })
})
