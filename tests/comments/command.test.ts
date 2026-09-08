/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * tests/comments/command.test.ts — the `org2html comments` subcommand.
 *
 * The three modules under src/comments/ are proven by data alone; this file proves the part
 * that touches disk and the network boundary. Every assertion here is about a DECISION that
 * cost something to get right, and the names say which:
 *
 *  - the quarantine boundary, which was two hardcoded constants in the showcase and is now
 *    two flags that can be pointed at each other,
 *  - the destructive guards, which exist because X's reply window is seven days and a deleted
 *    cache is unrecoverable,
 *  - discovery, which must read the ROUTE from relations.json rather than the bare slug,
 *  - and the fact that a build never triggers any of it.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import {
  COMMENT_ACTIONS,
  assertQuarantineSeparate,
  commentsCommand,
  discoverDocs,
  withDescendants,
} from "../../src/cli/commands/comments.js"
import { GEOMETRY, buildSpriteFor, cellsFor, sheetName } from "../../src/comments/sprite.js"
import { buildCommand } from "../../src/cli/commands/build.js"
import type { Comment } from "../../src/comments/types.js"

const work = mkdtempSync(join(tmpdir(), "o2h-comments-"))
afterAll(() => rmSync(work, { recursive: true, force: true }))

vi.spyOn(console, "log").mockImplementation(() => {})
vi.spyOn(console, "error").mockImplementation(() => {})

const POST_ID = "1940123456789012345"

let caseNo = 0
/** A throwaway root per case, so one test's cache can never be another's. */
function newCase() {
  const root = join(work, `case-${++caseNo}`)
  mkdirSync(root, { recursive: true })
  return {
    root,
    built: join(root, "built"),
    cache: join(root, "public", "comments"),
    held: join(root, "quarantine"),
  }
}

/** A built document, written directly so discovery is what is under test. */
function writeBuiltDoc(
  builtDir: string,
  relPath: string,
  meta: Record<string, unknown>,
  relations?: Record<string, unknown>,
) {
  const dir = join(builtDir, relPath)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "metadata.json"), JSON.stringify(meta, null, 2))
  if (relations) writeFileSync(join(dir, "relations.json"), JSON.stringify(relations, null, 2))
  return dir
}

const readCache = (cacheDir: string, postId = POST_ID) =>
  JSON.parse(readFileSync(join(cacheDir, `${postId}.json`), "utf8"))

/** process.exitCode is global; a test that sets it must not leak into the next one. */
beforeEach(() => {
  process.exitCode = 0
})
afterAll(() => {
  process.exitCode = 0
})

describe("comments — the quarantine boundary", () => {
  /*
   * THE MOST IMPORTANT ASSERTION IN THE FILE. The published cache is SERVED; a held reply
   * written inside it is published, which is the one thing holding a reply exists to prevent.
   * In the showcase this was guaranteed by two constants on opposite sides of public/. As
   * flags it has to be checked, and it is refused rather than warned about.
   */
  it("refuses --held resolving INSIDE --cache", () => {
    expect(() => assertQuarantineSeparate("/srv/site/comments", "/srv/site/comments/held")).toThrow(
      /--held .* resolves inside --cache/,
    )
  })

  it("refuses --held and --cache naming the SAME directory", () => {
    expect(() => assertQuarantineSeparate("/srv/site/c", "/srv/site/c")).toThrow(/resolves inside/)
  })

  it("refuses --held reached through a traversal that lands back inside --cache", () => {
    expect(() =>
      assertQuarantineSeparate("/srv/site/comments", "/srv/site/comments/../comments/held"),
    ).toThrow(/resolves inside/)
  })

  it("refuses --cache nested inside --held, the incoherent inverse", () => {
    expect(() => assertQuarantineSeparate("/srv/q/inner", "/srv/q")).toThrow(
      /--cache .* resolves inside --held/,
    )
  })

  it("accepts two sibling directories, and a merely SIMILAR prefix", () => {
    expect(() => assertQuarantineSeparate("/srv/public/comments", "/srv/quarantine")).not.toThrow()
    /* "comments-held" starts with "comments" as a STRING but is not inside it as a PATH — a
     * prefix comparison instead of a path relation would reject the shipped default pairing. */
    expect(() => assertQuarantineSeparate("/srv/comments", "/srv/comments-held")).not.toThrow()
  })

  it("is enforced before any action runs, including the read-only ones", async () => {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID })
    /* `review` writes nothing at all, and is still refused: an operator with the layout wrong
     * should learn on their first run, not on the first run that holds something. */
    await expect(
      commentsCommand("review", c.built, undefined, {
        cache: c.cache,
        held: join(c.cache, "held"),
      }),
    ).rejects.toThrow(/resolves inside/)
  })
})

describe("comments — discovery", () => {
  it("takes the ROUTE from relations.json, not the bare slug", () => {
    const c = newCase()
    /* The engine composes a route as <folder>/<date>-<slug>. Keying on metadata.slug wrote
     * /sanitize-first-… for a page served at /2026-07-02-sanitize-first-…, and the thread
     * simply never matched. The build is the only authority on its own routes. */
    writeBuiltDoc(
      c.built,
      "2026-07-02-announced",
      { postId: POST_ID, postUrl: `https://x.com/k/status/${POST_ID}`, slug: "announced" },
      { url: "/blog/2026-07-02-announced" },
    )
    const docs = discoverDocs(c.built)
    expect(docs).toHaveLength(1)
    expect(docs[0].url).toBe("/blog/2026-07-02-announced")
    expect(docs[0].postId).toBe(POST_ID)
  })

  it("WALKS the tree, because build nests output as <folder>/<slug>/", () => {
    const c = newCase()
    writeBuiltDoc(c.built, join("blog", "2026-07-02-nested"), { postId: POST_ID })
    /* A one-level readdir — what the showcase's flattened layout allowed — finds the folder
     * and none of the documents. */
    expect(discoverDocs(c.built)).toHaveLength(1)
  })

  it("ignores a document with no #+POST_URL", () => {
    const c = newCase()
    writeBuiltDoc(c.built, "quiet", { title: "No announcement" })
    expect(discoverDocs(c.built)).toHaveLength(0)
  })

  it("refuses a postId that is not an X status id", () => {
    const c = newCase()
    /* metadata.json is a file on disk this tool did not necessarily write, and postId becomes
     * a FILENAME. A traversal in that field must not reach the filesystem. */
    writeBuiltDoc(c.built, "hostile", { postId: "../../etc/passwd" })
    expect(discoverDocs(c.built)).toHaveLength(0)
  })

  it("survives an unreadable relations.json by falling back to the path route", () => {
    const c = newCase()
    const dir = writeBuiltDoc(c.built, "broken", { postId: POST_ID })
    writeFileSync(join(dir, "relations.json"), "{ not json")
    const docs = discoverDocs(c.built)
    expect(docs).toHaveLength(1)
    expect(docs[0].url).toBe("/broken")
  })

  it("--slug matches either the leaf directory or the full relative path", () => {
    const c = newCase()
    writeBuiltDoc(c.built, join("blog", "wanted"), { postId: POST_ID })
    writeBuiltDoc(c.built, join("blog", "other"), { postId: "1940999999999999999" })
    expect(discoverDocs(c.built, "wanted")).toHaveLength(1)
    expect(discoverDocs(c.built, join("blog", "wanted"))).toHaveLength(1)
    expect(discoverDocs(c.built, "absent")).toHaveLength(0)
  })

  it("finds a document in the output a REAL build produced", async () => {
    /* The layout assertion above is only worth something if it matches what `build` writes,
     * so this one goes through the actual command rather than a hand-written fixture. */
    const c = newCase()
    const src = join(c.root, "src")
    mkdirSync(src, { recursive: true })
    writeFileSync(
      join(src, "announced.org"),
      `#+TITLE: An Announced Document\n#+DATE: 2026-07-02\n#+POST_URL: https://x.com/kyonax_on_tech/status/${POST_ID}\n\n* Heading\n\nBody.\n`,
    )
    await buildCommand(src, { output: c.built, highlight: false, sanitize: true, quiet: true })

    const docs = discoverDocs(c.built)
    expect(docs).toHaveLength(1)
    expect(docs[0].postId).toBe(POST_ID)
    /* The date prefix is present — the exact thing keying on metadata.slug lost. */
    expect(docs[0].url).toContain("2026-07-02")
  })
})

describe("comments — sample", () => {
  async function sampled() {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID, postUrl: `https://x.com/k/status/${POST_ID}` })
    await commentsCommand("sample", c.built, undefined, { cache: c.cache, held: c.held })
    return c
  }

  it("writes an obviously fictional thread, marked as one", async () => {
    const c = await sampled()
    const thread = readCache(c.cache)
    expect(thread.sample).toBe(true)
    /* A sample publishes no structured data downstream precisely because of this flag:
     * invented replies marked up as schema.org entities would be structured-data spam. */
    expect(thread.postId).toBe(POST_ID)
  })

  it("runs the drafted thread through the SAME retention rules as a real fetch", async () => {
    const c = await sampled()
    const ids = readCache(c.cache).comments.map((cmt: Comment) => cmt.id)
    /* s4 is drafted at level four ON PURPOSE and must not survive — that is the demonstration. */
    expect(ids).not.toContain("s4")
    /* s5's parent was never fetched, so the orphan rule re-parents rather than drops it. The
     * pair is decisive: a depth cap that also dropped orphans would pass a laxer test. */
    expect(ids).toContain("s5")
    expect(ids).toEqual(["s1", "s2", "s3", "s5", "s6"])
  })

  it("refuses to overwrite a REAL thread, and says so instead of claiming it wrote one", async () => {
    const c = await sampled()
    const path = join(c.cache, `${POST_ID}.json`)
    const real = JSON.parse(readFileSync(path, "utf8"))
    delete real.sample
    real.comments = [{ id: "irreplaceable", text: "outside the 7-day window", author: { name: "R", handle: "r" } }]
    writeFileSync(path, JSON.stringify(real, null, 2))

    await commentsCommand("sample", c.built, undefined, { cache: c.cache, held: c.held })

    /* The record survives untouched. A reply outside the seven-day window can never be
     * re-fetched, so overwriting one is not an inconvenience, it is data loss. */
    expect(readCache(c.cache).comments[0].id).toBe("irreplaceable")
  })

  it("--force overwrites a real thread when the operator insists", async () => {
    const c = await sampled()
    const path = join(c.cache, `${POST_ID}.json`)
    const real = JSON.parse(readFileSync(path, "utf8"))
    delete real.sample
    writeFileSync(path, JSON.stringify(real, null, 2))

    await commentsCommand("sample", c.built, undefined, { cache: c.cache, held: c.held, force: true })
    expect(readCache(c.cache).sample).toBe(true)
  })
})

describe("comments — the destructive guards", () => {
  it("clear REFUSES a real thread without --force, and spares it", async () => {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID })
    mkdirSync(c.cache, { recursive: true })
    writeFileSync(
      join(c.cache, `${POST_ID}.json`),
      JSON.stringify({ postId: POST_ID, comments: [{ id: "a", text: "real", author: { name: "A", handle: "a" } }] }),
    )

    await commentsCommand("clear", c.built, undefined, { cache: c.cache, held: c.held })
    expect(existsSync(join(c.cache, `${POST_ID}.json`))).toBe(true)
  })

  it("clear removes a SAMPLE without argument, because that is what it is for", async () => {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID })
    mkdirSync(c.cache, { recursive: true })
    writeFileSync(join(c.cache, `${POST_ID}.json`), JSON.stringify({ postId: POST_ID, sample: true, comments: [] }))

    await commentsCommand("clear", c.built, undefined, { cache: c.cache, held: c.held })
    expect(existsSync(join(c.cache, `${POST_ID}.json`))).toBe(false)
  })

  it("clear --force removes a real thread", async () => {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID })
    mkdirSync(c.cache, { recursive: true })
    writeFileSync(join(c.cache, `${POST_ID}.json`), JSON.stringify({ postId: POST_ID, comments: [{ id: "a" }] }))

    await commentsCommand("clear", c.built, undefined, { cache: c.cache, held: c.held, force: true })
    expect(existsSync(join(c.cache, `${POST_ID}.json`))).toBe(false)
  })

  it("sets aside a CORRUPT cache instead of treating it as empty", async () => {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID })
    mkdirSync(c.cache, { recursive: true })
    const path = join(c.cache, `${POST_ID}.json`)
    writeFileSync(path, "{ this is not json")

    /* An earlier version announced it was "treating it as empty rather than overwriting" and
     * then overwrote it with whatever the current window returned — one stray byte destroying
     * every reply older than a week, with a reassuring message on the way past. */
    await commentsCommand("rejudge", c.built, undefined, { cache: c.cache, held: c.held })

    /* The file is RENAMED, not deleted and not silently replaced: a human looks at it. */
    expect(existsSync(path)).toBe(false)
    const setAside = readdirSync(c.cache).filter((f) => f.includes(".json.corrupt-"))
    expect(setAside).toHaveLength(1)
    expect(readFileSync(join(c.cache, setAside[0]), "utf8")).toBe("{ this is not json")
  })

  it("rejudge REPORTS and never writes", async () => {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID })
    mkdirSync(c.cache, { recursive: true })
    const path = join(c.cache, `${POST_ID}.json`)
    /* Shouting trips the structural floor that ships with an empty term list. */
    const thread = {
      postId: POST_ID,
      comments: [{ id: "x", text: "THIS IS ENTIRELY SHOUTED AT THE READER", author: { name: "X", handle: "x" } }],
    }
    writeFileSync(path, JSON.stringify(thread, null, 2))
    const before = readFileSync(path, "utf8")

    await commentsCommand("rejudge", c.built, undefined, { cache: c.cache, held: c.held })

    /* A blocklist edit must not silently retract content that has been indexed for a month.
     * Editing the list is a deliberate act, so seeing its effect is a deliberate act too. */
    expect(readFileSync(path, "utf8")).toBe(before)
  })
})

describe("comments — approve", () => {
  it("moves a held reply into the cache, dropping the rule that held it", async () => {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID })
    mkdirSync(c.cache, { recursive: true })
    mkdirSync(c.held, { recursive: true })
    writeFileSync(
      join(c.cache, `${POST_ID}.json`),
      JSON.stringify({ postId: POST_ID, comments: [{ id: "a", createdAt: "2026-07-01T00:00:00.000Z" }] }),
    )
    writeFileSync(
      join(c.held, `${POST_ID}.json`),
      JSON.stringify({
        postId: POST_ID,
        comments: [
          { id: "h1", createdAt: "2026-07-02T00:00:00.000Z", text: "held", author: { name: "H", handle: "h" }, rule: "structural:shouting" },
        ],
      }),
    )

    await commentsCommand("approve", c.built, "h1", { cache: c.cache, held: c.held })

    const published = readCache(c.cache).comments
    expect(published.map((cmt: Comment) => cmt.id)).toEqual(["a", "h1"])
    /* The rule is a note about the DECISION, not part of the record. */
    expect(published.find((cmt: Comment) => cmt.id === "h1")).not.toHaveProperty("rule")
    /* And it leaves the quarantine, or the next approve would publish it twice. */
    const stillHeld = JSON.parse(readFileSync(join(c.held, `${POST_ID}.json`), "utf8")).comments
    expect(stillHeld).toHaveLength(0)
  })

  it("needs an id", async () => {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID })
    await expect(
      commentsCommand("approve", c.built, undefined, { cache: c.cache, held: c.held }),
    ).rejects.toThrow(/needs the id/)
  })

  it("reports a non-zero exit when the id is not held", async () => {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID })
    await commentsCommand("approve", c.built, "nope", { cache: c.cache, held: c.held })
    expect(process.exitCode).toBe(1)
  })
})

describe("comments — the network boundary", () => {
  it("is a NO-OP without a token, not a failure", async () => {
    const c = newCase()
    writeBuiltDoc(c.built, "doc", { postId: POST_ID })
    const prev = process.env.X_BEARER_TOKEN
    delete process.env.X_BEARER_TOKEN
    const spy = vi.spyOn(globalThis, "fetch")
    try {
      await commentsCommand("fetch", c.built, undefined, { cache: c.cache, held: c.held })
      /* A build must never depend on a secret being set — so an absent token skips, and the
       * committed cache is left exactly as it is. */
      expect(process.exitCode).toBe(0)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      if (prev !== undefined) process.env.X_BEARER_TOKEN = prev
    }
  })

  it("exits 2 when there is no build output to read", async () => {
    const c = newCase()
    await commentsCommand("fetch", join(c.root, "never-built"), undefined, {
      cache: c.cache,
      held: c.held,
    })
    /* Distinct from 1: "you have not built yet" is a different instruction to the operator
     * than "a request was refused". */
    expect(process.exitCode).toBe(2)
  })

  it("rejects an unknown action rather than guessing", async () => {
    const c = newCase()
    await expect(commentsCommand("frobnicate", c.built, undefined, {})).rejects.toThrow(
      /unknown comments action/,
    )
    expect(COMMENT_ACTIONS).toEqual(["fetch", "sample", "clear", "review", "rejudge", "approve"])
  })
})

describe("comments — refusal is transitive", () => {
  /*
   * The counterpart to threadOf's orphan rule. That rule promotes a reply whose parent is
   * missing to the TOP LEVEL — right when the parent fell outside the window, and catastrophic
   * when the parent was refused on purpose, because the answer to a slur would be lifted to the
   * most prominent position on the page with the slur itself gone.
   */
  const chain: Comment[] = [
    { id: "a", text: "", author: { name: "", handle: "" }, replyTo: "root" },
    { id: "b", text: "", author: { name: "", handle: "" }, replyTo: "a" },
    { id: "c", text: "", author: { name: "", handle: "" }, replyTo: "b" },
    { id: "d", text: "", author: { name: "", handle: "" }, replyTo: "root" },
  ]

  it("closes a refusal over the whole subtree, not just the direct children", () => {
    const refused = withDescendants(["a"], chain)
    expect([...refused].sort()).toEqual(["a", "b", "c"])
  })

  it("leaves an unrelated branch alone", () => {
    expect(withDescendants(["a"], chain).has("d")).toBe(false)
  })

  it("terminates on a cycle rather than growing forever", () => {
    const cyclic: Comment[] = [
      { id: "x", text: "", author: { name: "", handle: "" }, replyTo: "y" },
      { id: "y", text: "", author: { name: "", handle: "" }, replyTo: "x" },
    ]
    expect([...withDescendants(["x"], cyclic)].sort()).toEqual(["x", "y"])
  })
})

describe("comments — sprite geometry", () => {
  /*
   * The stylesheet knows NO numbers: every offset the component uses is read back out of the
   * JSON. So the arithmetic is the contract, and it is checked here without an image library —
   * two pixels of disagreement is another person's face.
   */
  it("derives display-space geometry from the stored cell size", () => {
    expect(GEOMETRY.PITCH).toBe(GEOMETRY.CELL + GEOMETRY.GUTTER * 2)
    expect(GEOMETRY.SCALE).toBe(GEOMETRY.DISPLAY / GEOMETRY.CELL)
    expect(GEOMETRY.STEP).toBe(GEOMETRY.PITCH * GEOMETRY.SCALE)
    expect(GEOMETRY.INSET).toBe(GEOMETRY.GUTTER * GEOMETRY.SCALE)
  })

  it("keeps a non-zero gutter, because a fractional scale samples across the seam", () => {
    expect(GEOMETRY.GUTTER).toBeGreaterThan(0)
  })

  it("orders cells deterministically, so the sheet is byte-stable across runs", () => {
    const thread = {
      comments: [
        { id: "1", text: "", author: { name: "", handle: "" }, avatar: "b.png" },
        { id: "2", text: "", author: { name: "", handle: "" }, avatar: "a.png" },
        { id: "3", text: "", author: { name: "", handle: "" }, avatar: "b.png" },
        { id: "4", text: "", author: { name: "", handle: "" } },
      ],
    }
    /* Sorted and de-duplicated: without this a scheduled job commits a new binary every night
     * for a picture nobody can tell apart. */
    expect(cellsFor(thread)).toEqual(["a.png", "b.png"])
  })

  it("reports a MISSING sharp distinguishably, which is what lets the command print it", async () => {
    const c = newCase()
    mkdirSync(c.cache, { recursive: true })
    writeFileSync(
      join(c.cache, `${POST_ID}.json`),
      JSON.stringify({ postId: POST_ID, comments: [{ id: "a", avatar: "x.png" }] }),
    )
    /* sharp left optionalDependencies ([#42]): zero references in either bundle and ~32 MB with
     * @img, so a consumer no longer downloads it for a feature most will never use. The command
     * keys on this EXACT reason string to warn — the degradation must be printed, never silent —
     * so "no cache" and "not installed" have to stay distinguishable. */
    const missing = await buildSpriteFor(POST_ID, { cacheDir: c.cache, sharp: null })
    expect(missing).toEqual({ skipped: "sharp is not installed" })

    const absent = await buildSpriteFor("1940999999999999999", { cacheDir: c.cache, sharp: null })
    expect(absent.skipped).toBe("sharp is not installed")
    /* And with sharp present, a thread that has no cache file is a different skip entirely. */
    const noCache = await buildSpriteFor("1940999999999999999", { cacheDir: c.cache })
    expect(noCache.skipped).toBe("no cache")
  })

  it("drops a stale sheet reference rather than leaving a dangling URL", async () => {
    const c = newCase()
    mkdirSync(c.cache, { recursive: true })
    writeFileSync(
      join(c.cache, `${POST_ID}.json`),
      JSON.stringify({
        postId: POST_ID,
        sprite: { url: "/comments/sprite-deadbeefdeadbeef.webp", cells: 1 },
        comments: [{ id: "a", text: "", author: { name: "", handle: "" } }],
      }),
    )
    /* Nobody has a picture any more. A retained sprite block would point the component at a
     * sheet that is not there. */
    const result = await buildSpriteFor(POST_ID, { cacheDir: c.cache })
    expect(result.cells).toBe(0)
    expect(readCache(c.cache)).not.toHaveProperty("sprite")
  })

  it("names the sheet from the INPUT LIST, so a new comment changes the URL", () => {
    /* A stable name would be served from cache after the thread grew, and the second half of
     * the strip would show the wrong faces — an off-by-one that looks like a privacy bug. */
    expect(sheetName(["a.png"])).not.toBe(sheetName(["a.png", "b.png"]))
    expect(sheetName(["a.png", "b.png"])).toBe(sheetName(["a.png", "b.png"]))
    expect(sheetName(["a.png"])).toMatch(/^sprite-[0-9a-f]{16}\.webp$/)
  })
})
