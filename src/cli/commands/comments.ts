/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/commands/comments.ts — pull the X replies to each document's announcement post.
 *
 * A document names the post that announces it with #+POST_URL. The engine records that as
 * DATA and stops there ([P-00], the same split relations already follow): `build` never calls
 * X, because a build that reaches the network is neither offline nor reproducible, and [D-28]
 * says the engine makes no build-time network call at all. THIS IS A SEPARATE SUBCOMMAND for
 * exactly that reason — it is never invoked by `build`, and that is what keeps [D-28] true
 * while the feature still lives in the package. The host reads the result like any other
 * sidecar and prerenders it, so the reader pays NOTHING for comments: no request, no
 * third-party script, no layout shift.
 *
 * WHY IT MERGES INSTEAD OF REPLACING. X's only reply endpoint is search/recent, and its
 * documented window is SEVEN DAYS. A single fetch of an older post returns nothing at all, so
 * one run can never hold the whole thread — each run catches the replies inside their window
 * and adds them to what earlier runs found. Delete the cache and the old replies are gone for
 * good, because they can no longer be fetched. IT IS A RECORD, NOT A MIRROR, and every
 * destructive guard below exists for that one sentence.
 *
 * THIS TOOL IS THE ONLY PLACE A REPLY CAN BE REFUSED BEFORE IT ENTERS GIT. Everything
 * downstream — the JSON-LD, the prerendered HTML, a scheduled commit — treats a cached comment
 * as published fact. So the content policy runs HERE, at ingest, and a rejected reply is never
 * written anywhere at all.
 *
 * WHAT CHANGED IN THE PORT FROM examples/site/scripts/fetch-comments.mjs. The built directory,
 * the cache and the quarantine were three hardcoded constants pointing inside one particular
 * site; all three are now arguments, because a general-purpose converter cannot know a host's
 * layout. That turns the most important invariant in the feature — a held reply must sit
 * somewhere the published glob cannot reach — from an accident of two constants into something
 * that has to be CHECKED, which is what assertQuarantineSeparate does and why it refuses rather
 * than warns. Discovery also walks the tree instead of listing one level, because the engine's
 * own `build` nests output as <folder>/<slug>/ while the showcase's flattener did not.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { isAbsolute, join, relative, resolve } from "node:path"
import chalk from "chalk"

import { isAllowedAvatarUrl, judge, defaultPolicy, loadPolicy } from "../../comments/policy.js"
import { MAX_DEPTH, retainedIds } from "../../comments/thread.js"
import { buildSpriteFor, loadSharp } from "../../comments/sprite.js"
import type { Comment, CompiledPolicy, Thread } from "../../comments/types.js"
import { resolveInside } from "../fs-safe.js"

const API = "https://api.twitter.com/2/tweets/search/recent"
const LOOKUP = "https://api.twitter.com/2/tweets"
const MAX_RESULTS = 100
/* Enough for 1000 replies. A stop is needed: a runaway loop against a paid API is expensive in
 * a way a runaway loop against a filesystem is not. */
const MAX_PAGES = 10
/* An avatar is a small square. Anything larger is not an avatar, and a scheduled job that
 * commits whatever arrives should not be the one to find that out. */
const MAX_AVATAR_BYTES = 512 * 1024
const REQUEST_TIMEOUT = 10_000
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const TWEET_FIELDS = "created_at,referenced_tweets,conversation_id,possibly_sensitive,public_metrics,lang"

/* The same shape the parser accepts for #+POST_URL. Re-checked here because a built
 * metadata.json is a file on disk that this tool did not necessarily write, and postId is used
 * to build a filename. */
const POST_ID = /^\d{5,25}$/

/*
 * The slice of the X API responses this tool actually reads. Typed rather than left as `any`
 * because every field below is a decision — which pointer carries the thread shape, which flag
 * means "sensitive", which counter the page shows — and an untyped payload hides a rename behind
 * a silent undefined. Optional everywhere: the API omits fields it has nothing to say about.
 */
interface XUser {
  id: string
  name: string
  username: string
  profile_image_url?: string
}

interface XTweet {
  id: string
  text: string
  author_id?: string
  created_at?: string
  lang?: string
  possibly_sensitive?: boolean
  /** The thread shape lives here: search returns a FLAT list. */
  referenced_tweets?: Array<{ type: string; id: string }>
  public_metrics?: { like_count?: number; reply_count?: number }
}

interface XPayload {
  data?: XTweet[]
  includes?: { users?: XUser[] }
  meta?: { next_token?: string }
}

export type CommentsAction = "fetch" | "sample" | "clear" | "review" | "rejudge" | "approve"

export const COMMENT_ACTIONS: readonly CommentsAction[] = [
  "fetch",
  "sample",
  "clear",
  "review",
  "rejudge",
  "approve",
]

export interface CommentsOptions {
  cache?: string
  held?: string
  slug?: string
  dryRun?: boolean
  force?: boolean
  blocklist?: string
  quiet?: boolean
}

interface DiscoveredDoc {
  /** The built directory's path relative to the built root — the human-facing name. */
  file: string
  postId: string
  postUrl?: string
  /** The ROUTE, taken from relations.json. The host keys threads by it. */
  url: string
}

/* ── output ──────────────────────────────────────────────────────────────────────────── */
/* chalk directly, like every other command. The showcase's scripts/_lib.mjs is deliberately
 * NOT imported: it carries walk()/readdirSync helpers that would be dragged into the bundle. */
const line = (msg: string) => console.log(chalk.gray(msg))
const ok = (msg: string) => console.log(chalk.green("✓"), msg)
const warn = (msg: string) => console.log(chalk.yellow("!"), msg)
const fail = (msg: string) => console.error(chalk.red("✗"), msg)

/* ── the quarantine boundary ─────────────────────────────────────────────────────────── */
/*
 * THE SINGLE MOST IMPORTANT INVARIANT IN THIS FEATURE.
 *
 * A held reply is one that the policy would not publish unreviewed. The published cache is
 * SERVED — a host globs it and prerenders whatever it finds. So a held file inside the cache is
 * not an untidy layout, it is the tool publishing the exact thing it was asked to withhold, and
 * the cost of one mistake is the thing being held appearing on the page.
 *
 * In the showcase these were two constants on either side of public/ and could not collide. As
 * flags they can, so the collision is refused outright rather than warned about: a warning on a
 * scheduled job is a line nobody reads. Both directions are refused — a cache nested inside the
 * quarantine is equally incoherent — as is naming the same directory twice.
 */
export function assertQuarantineSeparate(cacheDir: string, heldDir: string): void {
  const cache = resolve(cacheDir)
  const held = resolve(heldDir)

  const contains = (parent: string, child: string): boolean => {
    const rel = relative(parent, child)
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
  }

  if (contains(cache, held)) {
    throw new Error(
      `--held (${held}) resolves inside --cache (${cache}). ` +
        "The cache is SERVED, so a held reply placed inside it would be published — which is " +
        "the one thing holding a reply exists to prevent. Point --held somewhere outside --cache.",
    )
  }
  if (contains(held, cache)) {
    throw new Error(
      `--cache (${cache}) resolves inside --held (${held}). ` +
        "The quarantine must not contain the published cache: nothing downstream can then tell " +
        "a withheld reply from a published one. Keep the two directories separate.",
    )
  }
}

/* ── discovery ───────────────────────────────────────────────────────────────────────── */
/*
 * Read the BUILD OUTPUT rather than the .org sources. metadata.json carries #+POST_URL's parsed
 * postId, and its sibling relations.json carries the ROUTE — and the route is the thing that
 * matters, because the host keys threads by it.
 *
 * It has to come from here: the engine composes a route as <folder>/<date>-<slug>, so
 * metadata.slug alone is the BARE slug and misses the date prefix. Keying on that wrote
 * /sanitize-first-… for a page served at /2026-07-02-sanitize-first-…, and the thread simply
 * never matched. The build is the only authority on its own routes.
 *
 * WALKED, not listed. `build` writes <output>/<folder>/<slug>/metadata.json, so a one-level
 * readdir finds the folders and none of the documents.
 */
function walkForMetadata(root: string, rel = "", depth = 0): string[] {
  /* A build tree is shallow. The cap is a cheap stop against a symlink cycle rather than a
   * statement about layout. */
  if (depth > 8) return []
  const out: string[] = []
  let entries
  try {
    entries = readdirSync(join(root, rel), { withFileTypes: true })
  } catch {
    return []
  }
  if (entries.some((e) => e.isFile() && e.name === "metadata.json")) out.push(rel)
  for (const entry of entries) {
    /* Symlinks are not followed: a built tree that points at itself must not hang the run. */
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    out.push(...walkForMetadata(root, join(rel, entry.name), depth + 1))
  }
  return out
}

export function discoverDocs(builtDir: string, slug?: string): DiscoveredDoc[] {
  const docs: DiscoveredDoc[] = []
  for (const rel of walkForMetadata(builtDir)) {
    if (rel === "") continue
    const dir = join(builtDir, rel)
    let meta: { postId?: unknown; postUrl?: unknown }
    try {
      meta = JSON.parse(readFileSync(join(dir, "metadata.json"), "utf8"))
    } catch {
      continue
    }
    const postId = typeof meta.postId === "string" ? meta.postId : null
    if (!postId) continue
    if (!POST_ID.test(postId)) {
      warn(`${rel} — metadata.json carries a postId that is not an X status id; skipped`)
      continue
    }
    /* Either the full relative path or the leaf directory name, so --slug stays usable on a
     * nested build without making the caller spell out the folder. */
    const leaf = rel.split(/[\\/]/).pop() ?? rel
    if (slug && rel !== slug && leaf !== slug) continue

    let url = `/${rel.split(/[\\/]/).join("/")}`
    const relPath = join(dir, "relations.json")
    if (existsSync(relPath)) {
      try {
        const parsed = JSON.parse(readFileSync(relPath, "utf8")) as { url?: string }
        if (typeof parsed.url === "string" && parsed.url) url = parsed.url
      } catch {
        /* An unreadable relations.json is not fatal: the path-derived route is a usable
         * fallback, and failing the whole run over a sidecar would cost the fetch. */
        warn(`${rel} — relations.json is unreadable; falling back to the path route`)
      }
    }
    docs.push({
      file: rel,
      postId,
      postUrl: typeof meta.postUrl === "string" ? meta.postUrl : undefined,
      url,
    })
  }
  return docs.sort((a, b) => (a.file < b.file ? -1 : 1))
}

/* ── the command ─────────────────────────────────────────────────────────────────────── */

export async function commentsCommand(
  action: string,
  builtDir: string,
  id: string | undefined,
  options: CommentsOptions,
): Promise<void> {
  if (options.quiet) console.log = () => {}

  if (!COMMENT_ACTIONS.includes(action as CommentsAction)) {
    throw new Error(
      `unknown comments action '${action}' — expected one of ${COMMENT_ACTIONS.join(" | ")}`,
    )
  }
  const act = action as CommentsAction

  const cacheDir = resolve(options.cache ?? "comments")
  const heldDir = resolve(options.held ?? "comments-held")
  /* Checked before ANY read or write, including on the read-only actions: an operator who has
   * the layout wrong should be told the first time they run the tool, not the first time it
   * holds something. */
  assertQuarantineSeparate(cacheDir, heldDir)

  const policy: CompiledPolicy = options.blocklist ? loadPolicy(options.blocklist) : defaultPolicy()

  console.log(chalk.blue(`Comments: ${act}\n`))

  if (!existsSync(builtDir)) {
    fail(`no build output at ${builtDir} — run \`org2html build\` first`)
    process.exitCode = 2
    return
  }

  const docs = discoverDocs(builtDir, options.slug)
  if (docs.length === 0) {
    ok("no built document carries #+POST_URL — nothing to do")
    return
  }
  line(`${docs.length} document(s) with #+POST_URL`)

  const ctx: Ctx = { cacheDir, heldDir, policy, options, corrupt: [] }

  switch (act) {
    case "clear":
      return runClear(docs, ctx)
    case "review":
      return runReview(docs, ctx)
    case "approve":
      return runApprove(docs, ctx, id)
    case "rejudge":
      return runRejudge(docs, ctx)
    case "sample":
      return runSample(docs, ctx)
    case "fetch":
      return runFetch(docs, ctx)
  }
}

interface Ctx {
  cacheDir: string
  heldDir: string
  policy: CompiledPolicy
  options: CommentsOptions
  corrupt: string[]
}

/* ── the cache on disk ───────────────────────────────────────────────────────────────── */
/*
 * A corrupt cache is SET ASIDE, never treated as empty. An earlier version warned that it was
 * "treating it as empty rather than overwriting" and then overwrote it two hundred lines later
 * with whatever the current seven-day window returned — so one stray byte destroyed every reply
 * older than a week, permanently, with a reassuring message on the way past. The file is renamed
 * and the document is skipped; a human can look at it.
 */
function loadJson<T>(path: string, ctx: Ctx): T | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T
  } catch {
    const kept = `${path}.corrupt-${Date.now()}`
    renameSync(path, kept)
    fail(`${path} is not valid JSON — set aside as ${kept.split(/[\\/]/).pop()}, document skipped`)
    ctx.corrupt.push(path)
    return null
  }
}

const cachePathFor = (ctx: Ctx, postId: string) => resolveInside(ctx.cacheDir, `${postId}.json`)
const heldPathFor = (ctx: Ctx, postId: string) => resolveInside(ctx.heldDir, `${postId}.json`)
const loadCache = (ctx: Ctx, postId: string) => loadJson<Thread>(cachePathFor(ctx, postId), ctx)
const loadHeld = (ctx: Ctx, postId: string) =>
  loadJson<{ comments?: Array<Comment & { rule?: string | null }> }>(heldPathFor(ctx, postId), ctx)

function writeCache(ctx: Ctx, postId: string, thread: unknown): void {
  mkdirSync(ctx.cacheDir, { recursive: true })
  writeFileSync(cachePathFor(ctx, postId), `${JSON.stringify(thread, null, 2)}\n`)
}

/** Report the optional install once, in the one place its absence changes the output. */
async function spriteFor(ctx: Ctx, postId: string, force: boolean): Promise<void> {
  const result = await buildSpriteFor(postId, { cacheDir: ctx.cacheDir, force })
  if (result.skipped === "sharp is not installed") {
    /* PRINTED, never silent ([#42]). A sprite is an optimisation and the page renders without
     * one — but an operator who expected a sheet must be told why there is not one. */
    warn("sharp is not installed — no avatar sprite was built")
    line("  the individual avatars still work; `npm i sharp` enables the single-request sheet")
    return
  }
  if (result.cells) line(`  sprite: ${result.cells} cell(s), ${result.bytes} bytes`)
}

/* ── clear ───────────────────────────────────────────────────────────────────────────── */
/*
 * --clear EXISTS TO REMOVE THE SAMPLE, and it must not be able to do anything else by accident.
 * A real thread is the one thing here that cannot be regenerated — a reply outside the seven-day
 * window is gone the moment its file is — so deleting one is refused unless the operator says
 * --force and means it.
 */
function runClear(docs: DiscoveredDoc[], ctx: Ctx): void {
  let removed = 0
  let spared = 0
  for (const doc of docs) {
    const cachePath = cachePathFor(ctx, doc.postId)
    const real = existsSync(cachePath) && loadJson<Thread>(cachePath, ctx)?.sample !== true
    if (real && !ctx.options.force) {
      spared++
      warn(`${doc.postId}.json holds REAL replies — refusing to delete it (--force to insist)`)
      continue
    }
    for (const p of [cachePath, heldPathFor(ctx, doc.postId)]) {
      if (existsSync(p)) {
        rmSync(p)
        removed++
        line(`removed ${p}`)
      }
    }
  }
  /* Only the GENERATED stand-ins and the sheets built from them. A vendored avatar is a
   * content-hashed file belonging to a real thread that may still be cached. */
  let plates = 0
  const avatarsDir = join(ctx.cacheDir, "avatars")
  if (existsSync(avatarsDir)) {
    for (const f of readdirSync(avatarsDir)) {
      if (f.startsWith("sample-")) {
        rmSync(join(avatarsDir, f))
        plates++
      }
    }
  }
  if (existsSync(ctx.cacheDir) && !readdirSync(ctx.cacheDir).some((f) => f.endsWith(".json"))) {
    for (const f of readdirSync(ctx.cacheDir)) {
      if (f.startsWith("sprite-") && f.endsWith(".webp")) rmSync(join(ctx.cacheDir, f))
    }
  }
  ok(
    `comments — cleared ${removed} file(s), ${plates} sample avatar(s)` +
      (spared ? `, spared ${spared} real thread(s)` : ""),
  )
}

/* ── review ──────────────────────────────────────────────────────────────────────────── */
function runReview(docs: DiscoveredDoc[], ctx: Ctx): void {
  let total = 0
  for (const doc of docs) {
    const held = loadHeld(ctx, doc.postId)
    for (const cmt of held?.comments ?? []) {
      total++
      line(`${cmt.id}  ${chalk.yellow(cmt.rule ?? "held")}  @${cmt.author?.handle}`)
      line(`    ${cmt.text.slice(0, 120).replace(/\s+/g, " ")}`)
    }
  }
  console.log("")
  ok(total ? `${total} reply(ies) held — approve with \`comments approve <dir> <id>\`` : "nothing is held")
}

/* ── approve ─────────────────────────────────────────────────────────────────────────── */
async function runApprove(docs: DiscoveredDoc[], ctx: Ctx, id: string | undefined): Promise<void> {
  if (!id) {
    throw new Error("comments approve needs the id of the held reply: `comments approve <dir> <id>`")
  }
  for (const doc of docs) {
    const held = loadHeld(ctx, doc.postId)
    const found = (held?.comments ?? []).find((cmt) => cmt.id === id)
    if (!found || !held) continue
    const thread = loadCache(ctx, doc.postId)
    if (!thread) {
      fail(`no published cache for ${doc.postId}`)
      process.exitCode = 1
      return
    }
    /* The rule that held it is a note about the decision, not part of the record. */
    const { rule: _rule, ...record } = found
    thread.comments = [...(thread.comments ?? []), record as Comment].sort((a, b) =>
      (a.createdAt ?? "") < (b.createdAt ?? "") ? -1 : 1,
    )
    writeCache(ctx, doc.postId, thread)
    held.comments = (held.comments ?? []).filter((cmt) => cmt.id !== id)
    writeFileSync(heldPathFor(ctx, doc.postId), `${JSON.stringify(held, null, 2)}\n`)
    await spriteFor(ctx, doc.postId, true)
    ok(`approved ${id} into ${doc.postId}`)
    return
  }
  fail(`no held reply with id ${id}`)
  process.exitCode = 1
}

/* ── rejudge ─────────────────────────────────────────────────────────────────────────── */
/*
 * A published comment is NOT re-judged on an ordinary run — its text has not changed, and
 * letting a blocklist edit silently retract a reply that has been on the page for a month
 * would make the cache unreproducible and the moderation invisible. Editing the list is a
 * deliberate act, so seeing its effect is a deliberate act too. THIS REPORTS; IT NEVER WRITES.
 */
function runRejudge(docs: DiscoveredDoc[], ctx: Ctx): void {
  let changed = 0
  for (const doc of docs) {
    for (const cmt of loadCache(ctx, doc.postId)?.comments ?? []) {
      const verdict = judge(cmt, ctx.policy)
      if (verdict.verdict === "publish") continue
      changed++
      line(`${cmt.id}  would become ${chalk.yellow(verdict.verdict)} (${verdict.rule})`)
    }
  }
  console.log("")
  ok(
    changed
      ? `${changed} published reply(ies) would change under policy ${ctx.policy.version}`
      : `every published reply still passes policy ${ctx.policy.version}`,
  )
}

/* ── the sample ──────────────────────────────────────────────────────────────────────── */

/* Stand-in avatars, GENERATED HERE and never fetched. A thread where nobody has a picture does
 * not look like a thread, and empty plates made the sample hard to judge. Each handle hashes to
 * a hue and a 5x5 mirrored grid — the identicon shape GitHub uses for the same reason: obviously
 * synthetic, recognisably distinct from its neighbours, and in no danger of being mistaken for
 * somebody's real face. Drawn locally because the one property of this feature worth protecting
 * is that a reader makes ZERO third-party requests; pulling placeholder faces from an avatar
 * service to review a privacy feature would measure the wrong thing. */
function sampleAvatar(ctx: Ctx, handle: string): string {
  const hash = createHash("sha256").update(handle).digest()
  const hue = ((hash[0] << 8) | hash[1]) % 360
  let cells = ""
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (!(hash[2 + y * 3 + x] & 1)) continue
      cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`
      /* Mirrored, so the grid reads as a face-shaped mark rather than as noise. */
      if (x < 2) cells += `<rect x="${4 - x}" y="${y}" width="1" height="1"/>`
    }
  }
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 5" shape-rendering="crispEdges">' +
    `<rect width="5" height="5" fill="hsl(${hue} 30% 12%)"/>` +
    /* Muted rather than neon: a stand-in should read as a placeholder beside the book's
     * restrained palette, while still being distinct enough to tell two commenters apart. */
    `<g fill="hsl(${hue} 45% 55%)">${cells}</g></svg>\n`
  const name = `sample-${handle}.svg`
  const avatarsDir = join(ctx.cacheDir, "avatars")
  mkdirSync(avatarsDir, { recursive: true })
  writeFileSync(resolveInside(avatarsDir, name), svg)
  return name
}

/* A fixed, obviously invented thread. It exists so the RENDERING can be reviewed — nesting, the
 * orphan rule, long words, the depth cap — without a paid API token. The handles are plainly
 * fictional and the file is marked `sample: true`, because inventing replies and attributing
 * them to somebody's real post would be a fabricated record. A sample also publishes no
 * structured data downstream, for the same reason.
 *
 * It goes through the SAME retention rules as a real fetch, so what it demonstrates is the real
 * behaviour rather than a parallel implementation that happens to look similar. */
async function runSample(docs: DiscoveredDoc[], ctx: Ctx): Promise<void> {
  /* Counted, because the guard below can refuse every document. The original reported
   * "sample written" unconditionally and warned about committing invented data that it had
   * just declined to write — a run that changed nothing read as a run that had. */
  let written = 0
  let spared = 0
  for (const doc of docs) {
    const root = doc.postId
    /* The same protection --clear has, for the same reason. A sample run on a machine holding an
     * accumulated real thread used to overwrite it with five invented replies — the most
     * destructive thing in this file, in the mode most likely to be run casually. */
    const existing = loadJson<Thread>(cachePathFor(ctx, root), ctx)
    if (existing && existing.sample !== true && !ctx.options.force) {
      spared++
      warn(`${root}.json holds REAL replies — refusing to overwrite with a sample`)
      continue
    }
    const drafted: Comment[] = [
      {
        id: "s1",
        replyTo: root,
        createdAt: "2026-07-13T09:12:00.000Z",
        author: { name: "Example Reader", handle: "example_reader", avatar: sampleAvatar(ctx, "example_reader") },
        text: "A first reply at the top level, long enough to wrap onto a second line so the measure and the leading can be judged honestly.",
      },
      {
        id: "s2",
        replyTo: "s1",
        createdAt: "2026-07-16T10:02:00.000Z",
        author: { name: "Sample Author", handle: "sample_author", avatar: sampleAvatar(ctx, "sample_author") },
        text: "@example_reader a nested reply, to show the indent and the hairline that carries it.",
      },
      {
        id: "s3",
        replyTo: "s2",
        createdAt: "2026-07-16T11:40:00.000Z",
        author: { name: "Example Reader", handle: "example_reader", avatar: sampleAvatar(ctx, "example_reader") },
        text: "@sample_author a third level, which is where an indent starts costing real measure on a narrow screen.",
      },
      /* Level four. It is drafted on purpose and must NOT survive — that is the demonstration. */
      {
        id: "s4",
        replyTo: "s3",
        createdAt: "2026-07-16T12:10:00.000Z",
        author: { name: "Too Deep", handle: "depth_case", avatar: sampleAvatar(ctx, "depth_case") },
        text: "THE DEPTH CASE: I am a fourth level, so I am dropped rather than rendered — read me on X.",
      },
      {
        id: "s5",
        replyTo: "MISSING-PARENT",
        createdAt: "2026-08-01T08:00:00.000Z",
        author: { name: "Orphaned Reply", handle: "orphan_case", avatar: sampleAvatar(ctx, "orphan_case") },
        text: "THE ORPHAN CASE: my parent was never fetched — it fell outside a 7-day window — so I am re-parented to the root rather than dropped.",
      },
      {
        id: "s6",
        replyTo: root,
        createdAt: "2026-08-25T14:20:00.000Z",
        author: { name: "Long Word Case", handle: "wrapping_case", avatar: sampleAvatar(ctx, "wrapping_case") },
        text: "An unbroken token to prove overflow-wrap: pneumonoultramicroscopicsilicovolcanoconiosis/and/a/very/long/path/that/cannot/break.",
      },
    ]
    /* The avatar travels on the comment for the sprite builder, which reads comment.avatar. */
    for (const cmt of drafted) {
      ;(cmt as Comment & { avatar?: string }).avatar = cmt.author.avatar
    }
    const keep = retainedIds(drafted)
    const comments = drafted.filter((cmt) => keep.has(cmt.id))

    writeCache(ctx, root, {
      postId: root,
      postUrl: doc.postUrl,
      url: doc.url,
      sample: true,
      post: {
        author: { name: "Sample Announcer", handle: "sample_announcer" },
        createdAt: "2026-07-02T12:00:00.000Z",
        text: "A sample announcement post, invented alongside the replies below it.",
      },
      fetchedAt: null,
      comments,
    })
    line(
      `${doc.file} — ${comments.length} SAMPLE comment(s), ` +
        `${drafted.length - comments.length} dropped past level ${MAX_DEPTH}`,
    )
    await spriteFor(ctx, root, true)
    written++
  }
  if (written) {
    warn("this is invented data for review only — do not commit it (`comments clear`)")
  }
  ok(
    `comments — ${written} sample thread(s) written` +
      (spared ? `, spared ${spared} real thread(s) (--force to overwrite)` : ""),
  )
}

/* ── the API ─────────────────────────────────────────────────────────────────────────── */

async function get<T>(url: string, token: string): Promise<T> {
  /* A scheduled job with no timeout hangs until the runner is killed, and a hung run on a
   * seven-day window is a run whose replies are lost. */
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  })
  if (!res.ok) {
    /* Status AND url in the message, the shape style-book.ts already uses. The token is a
     * header, never a query parameter, so a url is safe to print. */
    throw new Error(`X request failed (${res.status}): ${url}`)
  }
  return res.json() as Promise<T>
}

/*
 * PAGINATION IS NOT OPTIONAL HERE. A single page holds 100 replies; a thread that gets more than
 * that inside the seven-day window would have lost the overflow permanently, because the next
 * run's window has already moved past it. Silent truncation on the one dataset that cannot be
 * re-fetched is the worst shape a bug can take in this tool.
 */
async function searchReplies(postId: string, token: string) {
  const data: XTweet[] = []
  const users = new Map<string, XUser>()
  let next: string | null = null
  let pages = 0

  do {
    const url: string =
      `${API}?query=${encodeURIComponent(`conversation_id:${postId}`)}` +
      `&max_results=${MAX_RESULTS}` +
      `&tweet.fields=${TWEET_FIELDS}` +
      "&expansions=author_id" +
      "&user.fields=name,username,profile_image_url" +
      (next ? `&next_token=${encodeURIComponent(next)}` : "")
    const payload = await get<XPayload>(url, token)
    for (const t of payload.data ?? []) data.push(t)
    for (const u of payload.includes?.users ?? []) users.set(u.id, u)
    next = payload.meta?.next_token ?? null
    pages++
  } while (next && pages < MAX_PAGES)

  if (next) warn(`${postId}: stopped at ${MAX_PAGES} pages — more replies remain`)
  return { data, users, pages }
}

/*
 * The announcing post itself. Its author, date and text belong in the JSON-LD: a
 * DiscussionForumPosting with no author and no date is an incomplete entity, and a crawler that
 * cannot see what the discussion is ABOUT has only a list of replies to nothing.
 */
async function fetchRootPost(postId: string, token: string) {
  const url =
    `${LOOKUP}/${postId}?tweet.fields=created_at,lang,public_metrics` +
    "&expansions=author_id&user.fields=name,username"
  try {
    const payload = await get<XPayload & { data?: XTweet }>(url, token)
    const author = payload.includes?.users?.[0]
    return {
      author: author ? { name: author.name, handle: author.username } : null,
      createdAt: payload.data?.created_at ?? null,
      text: payload.data?.text ?? null,
      lang: payload.data?.lang ?? null,
    }
  } catch {
    /* A deleted or protected root post must not fail the run — the replies are still real. */
    return null
  }
}

/*
 * An avatar is ~2KB. Vendoring it costs a few KB in the repo and buys the reader zero
 * third-party requests — X never learns who reads the page — and survives X rotating the URL,
 * which it does.
 *
 * IT IS ALSO THE ONE PLACE THIS TOOL WRITES REMOTE BYTES TO DISK, and a scheduled job commits
 * whatever it finds there without a human looking. So the response is checked before it is
 * believed: an allowed image type, a size an avatar could plausibly be, and an extension taken
 * from what the server actually sent rather than assumed.
 */
async function vendorAvatar(ctx: Ctx, remoteUrl: string | undefined): Promise<string | null> {
  if (!remoteUrl || !isAllowedAvatarUrl(remoteUrl)) return null
  /* `_normal` is 48px; ask for the 96px variant so it stays sharp on a 2x display. */
  const src = remoteUrl.replace("_normal.", "_bigger.")
  const key = createHash("sha256").update(src).digest("hex").slice(0, 16)
  const avatarsDir = join(ctx.cacheDir, "avatars")

  if (!ctx.options.force && existsSync(avatarsDir)) {
    const cached = readdirSync(avatarsDir).find((f) => f.startsWith(key))
    if (cached) return cached
  }

  let res: Response
  try {
    res = await fetch(src, { signal: AbortSignal.timeout(REQUEST_TIMEOUT) })
  } catch {
    return null
  }
  if (!res.ok) return null /* an avatar is decoration; a 404 must not fail the run */

  if (!AVATAR_TYPES.has((res.headers.get("content-type") ?? "").split(";")[0].trim())) {
    warn(`avatar refused — unexpected content type for ${key}`)
    return null
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  /* content-length is a claim; the body is the fact. */
  if (bytes.length > MAX_AVATAR_BYTES) {
    warn(`avatar refused — ${bytes.length} bytes is not an avatar (${key})`)
    return null
  }

  /*
   * THE BYTES ARE RE-ENCODED, NOT SAVED. This is the only place the tool writes remote content
   * to disk, and a scheduled job commits whatever it finds there without a human looking. Passing
   * it through a decoder means what lands in the repo is pixels this machine produced: no EXIF,
   * no GPS coordinates from somebody's camera, no file that is a valid PNG and a valid something
   * else at the same time, and an extension that describes the actual contents rather than being
   * assumed — X serves PNG as readily as JPEG, and calling every one of them .jpg was wrong.
   */
  const sharp = await loadSharp()
  if (!sharp) {
    warn(`sharp is unavailable — skipping ${key} rather than committing unverified bytes`)
    return null
  }
  const name = `${key}.png`
  if (!ctx.options.dryRun) {
    let normalised: Buffer
    try {
      normalised = await sharp(bytes, { limitInputPixels: 1e8 })
        .resize(96, 96, { fit: "cover" })
        .png()
        .toBuffer()
    } catch {
      warn(`avatar refused — ${key} did not decode as an image`)
      return null
    }
    mkdirSync(avatarsDir, { recursive: true })
    writeFileSync(resolveInside(avatarsDir, name), normalised)
  }
  return name
}

/*
 * REFUSING A REPLY REFUSES ITS DESCENDANTS. This is the counterpart to threadOf's orphan rule:
 * that rule promotes a reply whose parent is missing to the top level, which is right when the
 * parent simply fell outside the window — and catastrophic when the parent was refused on
 * purpose, because the answer to a slur would be lifted to the most prominent position on the
 * page with the slur itself gone. So the refusal is closed transitively before anything else
 * looks at the list.
 */
export function withDescendants(seed: string[], comments: Comment[]): Set<string> {
  const refused = new Set(seed)
  let grew = true
  while (grew) {
    grew = false
    for (const cmt of comments) {
      if (!refused.has(cmt.id) && cmt.replyTo && refused.has(cmt.replyTo)) {
        refused.add(cmt.id)
        grew = true
      }
    }
  }
  return refused
}

/* ── fetch, judge, merge ─────────────────────────────────────────────────────────────── */
async function runFetch(docs: DiscoveredDoc[], ctx: Ctx): Promise<void> {
  const token = process.env.X_BEARER_TOKEN
  if (!token) {
    warn("X_BEARER_TOKEN is not set — skipping the fetch")
    line("the cache is left exactly as it is, and any build is unaffected")
    line("to review the rendering without a token: `comments sample <dir>`")
    return
  }

  const failures: string[] = []
  let added = 0
  let rejected = 0
  let held = 0
  let removed = 0

  for (const doc of docs) {
    let payload
    try {
      payload = await searchReplies(doc.postId, token)
    } catch (err) {
      failures.push(`${doc.file}: ${(err as Error).message}`)
      fail(`${doc.file} — ${(err as Error).message}`)
      continue
    }

    const cachePath = cachePathFor(ctx, doc.postId)
    const hadCache = existsSync(cachePath)
    const prev = loadCache(ctx, doc.postId)
    if (hadCache && !prev) continue /* set aside as corrupt — a human looks before anything writes */
    const known = new Map((prev?.comments ?? []).map((cmt) => [cmt.id, cmt]))

    const candidates: Array<Comment & { avatar?: string; policy?: unknown }> = []
    for (const t of payload.data) {
      if (t.id === doc.postId) continue /* the root post is not a reply to itself */
      /* A tweet whose author the expansion did not return falls through to the "Unknown"
       * branch below rather than being dropped — the reply is still real. */
      const u = t.author_id ? payload.users.get(t.author_id) : undefined
      const parent = (t.referenced_tweets ?? []).find((r) => r.type === "replied_to")
      candidates.push({
        id: t.id,
        text: t.text,
        createdAt: t.created_at,
        /* The search returns a FLAT list; the thread shape lives in this pointer. */
        replyTo: parent ? parent.id : doc.postId,
        lang: t.lang ?? undefined,
        metrics: {
          likes: t.public_metrics?.like_count ?? 0,
          replies: t.public_metrics?.reply_count ?? 0,
        },
        possiblySensitive: t.possibly_sensitive === true,
        author: u
          ? { name: u.name, handle: u.username, avatarUrl: u.profile_image_url }
          : { name: "Unknown", handle: "unknown" },
      } as Comment & { avatar?: string })
    }

    /* Judge only what is NEW. A reply already in the cache keeps the verdict it was published
     * under; see `rejudge` for the deliberate way to revisit that. */
    const verdicts = new Map<string, { verdict: string; rule: string | null }>()
    for (const cmt of candidates) {
      if (known.has(cmt.id)) continue
      verdicts.set(cmt.id, judge(cmt, ctx.policy))
    }
    const refusedSeed = [...verdicts.entries()]
      .filter(([, v]) => v.verdict !== "publish")
      .map(([id]) => id)
    const refused = withDescendants(refusedSeed, candidates)

    const freshHeld: Array<Comment & { rule: string | null }> = []
    const fresh: Array<Comment & { avatar?: string; policy?: unknown }> = []
    for (const cmt of candidates) {
      if (known.has(cmt.id)) continue
      const verdict = verdicts.get(cmt.id) ?? { verdict: "publish", rule: null }
      /* A descendant of a refused reply inherits the refusal, whatever its own text said. */
      const effective = refused.has(cmt.id)
        ? verdict.verdict === "publish"
          ? "hold"
          : verdict.verdict
        : "publish"
      const rule =
        refused.has(cmt.id) && verdict.verdict === "publish" ? "inherited:refused-parent" : verdict.rule

      if (effective === "reject") {
        /* Nothing is written. The id and the rule are logged; the text never is. */
        rejected++
        line(`${cmt.id} — ${chalk.red("rejected")} (${rule})`)
        continue
      }
      delete cmt.possiblySensitive
      if (effective === "hold") {
        held++
        /* Not even in quarantine does a pbs.twimg.com URL get written — the same rule the
         * published cache follows, for the same reason. */
        delete (cmt.author as { avatarUrl?: string }).avatarUrl
        freshHeld.push({ ...cmt, rule })
        line(`${cmt.id} — ${chalk.yellow("held")} (${rule})`)
        continue
      }
      cmt.policy = { version: ctx.policy.version, checkedAt: new Date().toISOString() }
      fresh.push(cmt)
    }

    const byId = new Map(known)
    const before = byId.size
    for (const cmt of fresh) {
      /* Vendor once, then keep whatever an earlier run already stored. */
      const cached = (known.get(cmt.id) as { avatar?: string } | undefined)?.avatar
      cmt.avatar = cached ?? (await vendorAvatar(ctx, (cmt.author as { avatarUrl?: string }).avatarUrl)) ?? undefined
      delete (cmt.author as { avatarUrl?: string }).avatarUrl
      byId.set(cmt.id, cmt)
    }

    /* The depth cap, applied to the MERGED set — a reply can only be judged too deep once its
     * ancestors are known, and an ancestor may have arrived on an earlier run. */
    const ordered = [...byId.values()].sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? -1 : 1))
    const keep = retainedIds(ordered)
    const merged = ordered.filter((cmt) => keep.has(cmt.id))
    const tooDeep = ordered.length - merged.length
    /* Counted separately, because they are different events with different consequences. A net
     * figure would let a run that quietly UNPUBLISHED four replies report "+1" — and the depth cap
     * genuinely can retire something already on the page, once a late-arriving ancestor reveals
     * how deep it really sat. That has to be visible in the log and in the commit, not averaged
     * away. */
    added += fresh.filter((cmt) => keep.has(cmt.id)).length
    removed += [...known.keys()].filter((id) => !keep.has(id)).length

    const out = {
      postId: doc.postId,
      postUrl: doc.postUrl,
      /* The route this thread belongs to, taken from the build. The host keys on it, exactly as
       * a relations consumer keys on rel.url. Taking it from anywhere else — a bare
       * metadata.slug, say — writes a key no route will ever match. */
      url: doc.url,
      post: (await fetchRootPost(doc.postId, token)) ?? prev?.post ?? null,
      fetchedAt: new Date().toISOString(),
      comments: merged,
    }

    line(
      `${doc.file} — ${merged.length} comment(s) over ${payload.pages} page(s)` +
        (merged.length - before > 0 ? chalk.green(` (+${merged.length - before})`) : "") +
        (tooDeep ? chalk.dim(` (${tooDeep} past level ${MAX_DEPTH})`) : ""),
    )

    if (!ctx.options.dryRun) {
      writeCache(ctx, doc.postId, out)
      await spriteFor(ctx, doc.postId, ctx.options.force ?? false)

      if (freshHeld.length) {
        mkdirSync(ctx.heldDir, { recursive: true })
        const existing = loadHeld(ctx, doc.postId)
        const heldById = new Map((existing?.comments ?? []).map((cmt) => [cmt.id, cmt]))
        for (const cmt of freshHeld) heldById.set(cmt.id, cmt)
        writeFileSync(
          heldPathFor(ctx, doc.postId),
          `${JSON.stringify(
            { postId: doc.postId, heldAt: new Date().toISOString(), comments: [...heldById.values()] },
            null,
            2,
          )}\n`,
        )
      }
    }
  }

  console.log("")
  if (removed) warn(`${removed} previously published reply(ies) removed by the depth cap`)
  if (rejected) warn(`${rejected} reply(ies) rejected and not written anywhere`)
  if (held) warn(`${held} reply(ies) held for review — \`comments review <dir>\``)
  if (ctx.corrupt.length) {
    fail(`comments — ${ctx.corrupt.length} cache file(s) set aside as corrupt`)
    process.exitCode = 1
    return
  }
  if (failures.length) {
    fail(`comments — ${failures.length} request(s) refused`)
    process.exitCode = 1
    return
  }
  ok(`comments — ${added} new comment(s)${ctx.options.dryRun ? " (dry run, nothing written)" : ""}`)
}
