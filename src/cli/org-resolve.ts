/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/org-resolve.ts — the CLI file layer.
 *
 * Resolves the three Org keywords that need a filesystem —
 * #+SETUPFILE (import in-buffer settings), #+INCLUDE (splice
 * content), #+STARTUP (in-buffer switches) — into a single
 * self-contained document string, BEFORE parse() ever sees it.
 *
 * parse() takes a string and stays that way: the parser must
 * remain pure and testable, so every path that touches disk
 * lives here ([D-22] keeps the engine a converter, [D-26] keeps
 * it fail-safe). Resolution is bounded by a depth cap, an
 * ancestor stack that makes cycles impossible, a byte cap, and
 * root confinement — an untrusted .org must never be able to
 * read a file the operator did not offer it.
 */

import { readFile, realpath } from "fs/promises"
import { homedir } from "os"
import { dirname, isAbsolute, join, resolve, sep } from "path"

/** How deep a chain of setupfiles/includes may go before we call it pathological. */
const DEFAULT_MAX_DEPTH = 16

/** Largest single file the resolver will splice in (guards against OOM on a stray binary). */
const MAX_FILE_BYTES = 8 * 1024 * 1024

export interface OrgResolveOptions {
  /** Directory the document lives in; relative paths resolve against it. */
  baseDir: string
  /** Extra directories the document may read from (--include-root, repeatable). */
  roots?: string[]
  /** Set false to pass the document through untouched (--no-resolve-includes). */
  enabled?: boolean
  maxDepth?: number
}

export interface OrgResolveResult {
  /** The document with every file keyword resolved. */
  content: string
  /** Every file actually pulled in — `watch` adds these to its watch set. */
  files: string[]
  /** Non-fatal problems: refused paths, missing targets, depth/cycle stops. */
  warnings: string[]
}

interface Ctx {
  roots: string[]
  maxDepth: number
  files: Set<string>
  warnings: string[]
  /** Keyword keys the DOCUMENT defines itself — these always win over an import. */
  documentKeys: Set<string>
}

const BEGIN_BLOCK = /^\s*#\+BEGIN_(\S+)/i
const END_BLOCK = /^\s*#\+END_(\S+)/i
const BEGIN_DYNAMIC = /^\s*#\+BEGIN:\s/i
const END_DYNAMIC = /^\s*#\+END:\s*$/i
const KEYWORD_LINE = /^\s*#\+([A-Za-z_@][A-Za-z0-9_@]*):\s*(.*)$/
const SETUPFILE_LINE = /^\s*#\+SETUPFILE:\s*(.+?)\s*$/i
const INCLUDE_LINE = /^\s*#\+INCLUDE:\s*(.+?)\s*$/i
const STARTUP_LINE = /^\s*#\+STARTUP:\s*(.+?)\s*$/i
const HEADLINE = /^(\*+)\s/

/**
 * Walk lines while tracking whether we are inside a block. Org syntax inside
 * #+BEGIN_SRC / _EXAMPLE / _EXPORT is DATA, not markup: a document explaining
 * how #+INCLUDE works must not have its own example expanded.
 */
function* scanLines(lines: string[]): Generator<{ line: string; index: number; inBlock: boolean }> {
  const stack: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const inBlockBefore = stack.length > 0

    const begin = line.match(BEGIN_BLOCK)
    if (begin) {
      stack.push(begin[1].toLowerCase())
      yield { line, index, inBlock: true }
      continue
    }
    if (BEGIN_DYNAMIC.test(line)) {
      stack.push(":dynamic")
      yield { line, index, inBlock: true }
      continue
    }

    const end = line.match(END_BLOCK)
    if (end && stack.length > 0) {
      const name = end[1].toLowerCase()
      // Type-matched close; a mismatched #+END_X still unwinds one level so a
      // typo cannot swallow the rest of the file ([D-26]).
      const at = stack.lastIndexOf(name)
      if (at >= 0) stack.length = at
      else stack.pop()
      yield { line, index, inBlock: true }
      continue
    }
    if (END_DYNAMIC.test(line) && stack.length > 0) {
      stack.pop()
      yield { line, index, inBlock: true }
      continue
    }

    yield { line, index, inBlock: inBlockBefore }
  }
}

/**
 * Identity of a keyword definition for precedence purposes. #+MACRO and #+LINK
 * may legally appear many times, so their key includes the name they define;
 * everything else is keyed by the keyword alone.
 */
function keywordKey(key: string, value: string): string {
  const upper = key.toUpperCase()
  if (upper === "MACRO" || upper === "LINK") {
    const name = value.trim().split(/\s+/)[0] ?? ""
    return `${upper}:${name.toLowerCase()}`
  }
  return upper
}

/** Keyword keys the document defines for itself, outside any block. */
function collectDocumentKeys(content: string): Set<string> {
  const keys = new Set<string>()
  for (const { line, inBlock } of scanLines(content.split("\n"))) {
    if (inBlock) continue
    const m = line.match(KEYWORD_LINE)
    if (m) keys.add(keywordKey(m[1], m[2]))
  }
  return keys
}

function expandHome(p: string): string {
  if (p === "~") return homedir()
  if (p.startsWith("~/")) return join(homedir(), p.slice(2))
  return p
}

/** True when `target` is `root` or lives underneath it. */
function isInside(root: string, target: string): boolean {
  if (target === root) return true
  return target.startsWith(root.endsWith(sep) ? root : root + sep)
}

/**
 * Resolve a referenced path and prove it is inside a permitted root.
 *
 * Confinement is the whole point: without it any .org handed to the CLI could
 * say `#+INCLUDE: "/etc/passwd"` and have the contents published into rendered
 * HTML. Resolution goes through realpath so a symlink cannot be used to step
 * outside a root that only looks like it contains it.
 */
async function resolveReference(
  rawPath: string,
  fromDir: string,
  ctx: Ctx,
): Promise<{ path: string } | { error: string }> {
  const expanded = expandHome(rawPath.trim().replace(/^["']|["']$/g, ""))
  const candidate = isAbsolute(expanded) ? expanded : resolve(fromDir, expanded)

  let real: string
  try {
    real = await realpath(candidate)
  } catch {
    return { error: `cannot read ${rawPath} (resolved to ${candidate})` }
  }

  if (!ctx.roots.some((root) => isInside(root, real))) {
    return {
      error:
        `refused ${rawPath} — outside every permitted root ` +
        `(${ctx.roots.join(", ")}); pass --include-root to allow it`,
    }
  }
  return { path: real }
}

async function readBounded(path: string): Promise<string | { error: string }> {
  const buf = await readFile(path)
  if (buf.byteLength > MAX_FILE_BYTES) {
    return { error: `refused ${path} — ${Math.round(buf.byteLength / 1024)} KB exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB include cap` }
  }
  return buf.toString("utf-8")
}

/**
 * Harvest in-buffer settings from a setupfile: every top-level #+KEY: line that
 * is not inside a block, anywhere in the file. That is Org's own rule — a
 * setupfile contributes SETTINGS, never content — and it is why the brain's
 * `#+MACRO:` definitions sitting 90 lines down still count.
 *
 * Chained setupfiles resolve depth-first, so the outermost file wins over what
 * it pulls in, and the DOCUMENT wins over all of them.
 */
async function importSettings(
  path: string,
  ancestors: string[],
  depth: number,
  ctx: Ctx,
): Promise<string[]> {
  if (depth > ctx.maxDepth) {
    ctx.warnings.push(`#+SETUPFILE chain deeper than ${ctx.maxDepth} at ${path} — stopped`)
    return []
  }
  if (ancestors.includes(path)) {
    ctx.warnings.push(`#+SETUPFILE cycle at ${path} — stopped`)
    return []
  }

  const read = await readBounded(path)
  if (typeof read !== "string") {
    ctx.warnings.push(read.error)
    return []
  }
  ctx.files.add(path)

  const out: string[] = []
  const dir = dirname(path)
  const seen = new Set<string>()

  for (const { line, inBlock } of scanLines(read.split("\n"))) {
    if (inBlock) continue

    const nested = line.match(SETUPFILE_LINE)
    if (nested) {
      const resolved = await resolveReference(nested[1], dir, ctx)
      if ("error" in resolved) {
        ctx.warnings.push(resolved.error)
        continue
      }
      out.push(...(await importSettings(resolved.path, [...ancestors, path], depth + 1, ctx)))
      continue
    }

    const kw = line.match(KEYWORD_LINE)
    if (!kw) continue

    const key = keywordKey(kw[1], kw[2])
    // The document always wins; within one setupfile the LAST definition wins,
    // matching how the parser harvests #+MACRO / #+LINK.
    if (ctx.documentKeys.has(key)) continue
    if (seen.has(key)) {
      const at = out.findIndex((l) => {
        const m = l.match(KEYWORD_LINE)
        return m ? keywordKey(m[1], m[2]) === key : false
      })
      if (at >= 0) out.splice(at, 1)
    }
    seen.add(key)
    out.push(line.trim())
  }

  return out
}

interface IncludeSpec {
  target: string
  search?: string
  wrap?: { kind: "src"; lang: string } | { kind: "example" } | { kind: "export"; backend: string }
  lines?: { from: number; to: number }
  onlyContents: boolean
  minlevel?: number
}

/** Parse the argument tail of `#+INCLUDE:` into a spec. */
export function parseIncludeSpec(raw: string): IncludeSpec | { error: string } {
  let rest = raw.trim()
  let target = ""

  if (rest.startsWith('"') || rest.startsWith("'")) {
    const quote = rest[0]
    const close = rest.indexOf(quote, 1)
    if (close < 0) return { error: `unterminated quote in #+INCLUDE: ${raw}` }
    target = rest.slice(1, close)
    rest = rest.slice(close + 1).trim()
  } else {
    const space = rest.search(/\s/)
    target = space < 0 ? rest : rest.slice(0, space)
    rest = space < 0 ? "" : rest.slice(space).trim()
  }
  if (!target) return { error: `#+INCLUDE: has no target (${raw})` }

  // "file.org::*Heading" / "file.org::#custom-id" / "file.org::NAME"
  let search: string | undefined
  const marker = target.indexOf("::")
  if (marker >= 0) {
    search = target.slice(marker + 2)
    target = target.slice(0, marker)
  }

  const spec: IncludeSpec = { target, search, onlyContents: false }

  const wrapMatch = rest.match(/^(src|example|export)(?:\s+(\S+))?/i)
  if (wrapMatch) {
    const kind = wrapMatch[1].toLowerCase()
    if (kind === "src") spec.wrap = { kind: "src", lang: wrapMatch[2] ?? "" }
    else if (kind === "example") spec.wrap = { kind: "example" }
    else spec.wrap = { kind: "export", backend: wrapMatch[2] ?? "html" }
    rest = rest.slice(wrapMatch[0].length).trim()
  }

  const linesMatch = rest.match(/:lines\s+"([^"]*)"/i)
  if (linesMatch) {
    const [fromRaw, toRaw] = linesMatch[1].split("-")
    // Org's :lines is 1-based with an EXCLUSIVE end: "5-10" is lines 5..9.
    const from = fromRaw ? Number.parseInt(fromRaw, 10) : 1
    const to = toRaw ? Number.parseInt(toRaw, 10) : Number.POSITIVE_INFINITY
    if (Number.isNaN(from) || Number.isNaN(to)) return { error: `bad :lines range in #+INCLUDE: ${raw}` }
    spec.lines = { from: Math.max(1, from), to }
  }

  if (/:only-contents\s+t\b/i.test(rest)) spec.onlyContents = true

  const minlevelMatch = rest.match(/:minlevel\s+(\d+)/i)
  if (minlevelMatch) spec.minlevel = Number.parseInt(minlevelMatch[1], 10)

  return spec
}

/** Narrow included text to the subtree the `::` search names. */
function selectSearch(text: string, search: string): string | { error: string } {
  const lines = text.split("\n")

  if (search.startsWith("*")) {
    const wanted = search.replace(/^\*+\s*/, "").trim().toLowerCase()
    for (let i = 0; i < lines.length; i++) {
      const h = lines[i].match(HEADLINE)
      if (!h) continue
      const title = lines[i].slice(h[1].length).trim().replace(/\s+:[\w@#%:]+:$/, "").toLowerCase()
      if (title !== wanted) continue
      const level = h[1].length
      let end = lines.length
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].match(HEADLINE)
        if (next && next[1].length <= level) {
          end = j
          break
        }
      }
      return lines.slice(i, end).join("\n")
    }
    return { error: `no headline "${search}" in the included file` }
  }

  if (search.startsWith("#")) {
    const id = search.slice(1).trim().toLowerCase()
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().toLowerCase() !== `:custom_id: ${id}`) continue
      // Walk back to the headline that owns this drawer.
      for (let h = i; h >= 0; h--) {
        const m = lines[h].match(HEADLINE)
        if (!m) continue
        const level = m[1].length
        let end = lines.length
        for (let j = h + 1; j < lines.length; j++) {
          const next = lines[j].match(HEADLINE)
          if (next && next[1].length <= level) {
            end = j
            break
          }
        }
        return lines.slice(h, end).join("\n")
      }
    }
    return { error: `no :CUSTOM_ID: ${id} in the included file` }
  }

  const named = lines.findIndex((l) => l.trim().toLowerCase() === `#+name: ${search.toLowerCase()}`)
  if (named < 0) return { error: `no #+NAME: ${search} in the included file` }
  let end = named + 1
  while (end < lines.length && lines[end].trim() !== "") end++
  return lines.slice(named + 1, end).join("\n")

}

/** Drop the leading headline and its property drawer (`:only-contents t`). */
function stripToContents(text: string): string {
  const lines = text.split("\n")
  let i = 0
  if (lines[i] !== undefined && HEADLINE.test(lines[i])) i++
  while (i < lines.length && lines[i].trim() === "") i++
  if (lines[i]?.trim().toUpperCase() === ":PROPERTIES:") {
    while (i < lines.length && lines[i].trim().toUpperCase() !== ":END:") i++
    i++
  }
  return lines.slice(i).join("\n")
}

/** Shift every headline so the shallowest one sits at `minlevel`. */
function applyMinlevel(text: string, minlevel: number): string {
  const lines = text.split("\n")
  let shallowest = Number.POSITIVE_INFINITY
  for (const { line, inBlock } of scanLines(lines)) {
    if (inBlock) continue
    const m = line.match(HEADLINE)
    if (m) shallowest = Math.min(shallowest, m[1].length)
  }
  if (!Number.isFinite(shallowest) || shallowest === minlevel) return text

  const delta = minlevel - shallowest
  const out: string[] = []
  for (const { line, inBlock } of scanLines(lines)) {
    const m = inBlock ? null : line.match(HEADLINE)
    if (!m) {
      out.push(line)
      continue
    }
    const level = Math.max(1, m[1].length + delta)
    out.push("*".repeat(level) + line.slice(m[1].length))
  }
  return out.join("\n")
}

const ESCAPE_IN_BLOCK = /^([ \t]*)(\*|,\*|#\+)/

/** Comma-escape lines that would otherwise close the wrapper block. */
function escapeForBlock(text: string): string {
  return text
    .split("\n")
    .map((l) => (ESCAPE_IN_BLOCK.test(l) ? l.replace(ESCAPE_IN_BLOCK, "$1,$2") : l))
    .join("\n")
}

/**
 * `#+STARTUP:` carries in-buffer switches. Translate the ones that mean
 * something for an HTML render into their #+OPTIONS equivalents and let the
 * existing options machinery do the work, rather than growing a second,
 * divergent path for the same settings.
 */
export function startupToOptions(values: string[]): string[] {
  const opts: string[] = []
  for (const token of values.flatMap((v) => v.split(/\s+/)).filter(Boolean)) {
    switch (token.toLowerCase()) {
      case "nonum":
        opts.push("num:nil")
        break
      case "num":
        opts.push("num:t")
        break
      case "nolatexpreview":
      case "latexpreview":
        break
      case "entitiespretty":
        opts.push("e:t")
        break
      default:
        // overview / content / showall / indent / logdone and friends are
        // editor-visibility switches with no rendered meaning. Recognized and
        // ignored on purpose — never leaked.
        break
    }
  }
  return opts
}

/**
 * Resolve #+SETUPFILE / #+INCLUDE / #+STARTUP into a self-contained document.
 *
 * Never throws for a bad reference: an unreadable, refused, cyclic, or too-deep
 * target becomes a warning and the directive is dropped, so one bad line can
 * never take down a build or silently swallow the rest of a document ([D-26]).
 */
export async function resolveOrgFileKeywords(
  content: string,
  options: OrgResolveOptions,
): Promise<OrgResolveResult> {
  if (options.enabled === false) return { content, files: [], warnings: [] }

  const roots: string[] = []
  for (const candidate of [options.baseDir, ...(options.roots ?? [])]) {
    try {
      roots.push(await realpath(expandHome(candidate)))
    } catch {
      // A root that does not exist simply grants nothing.
    }
  }

  const ctx: Ctx = {
    roots,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    files: new Set(),
    warnings: [],
    documentKeys: collectDocumentKeys(content),
  }

  const startup: string[] = []
  const body = await expand(content, options.baseDir, [], 0, ctx, startup)

  let out = body
  const derived = startupToOptions(startup)
  if (derived.length > 0) {
    // Prepended, so any #+OPTIONS the document sets later overrides per-key
    // (extractMetadata merges options objects, last write wins).
    out = `#+OPTIONS: ${derived.join(" ")}\n${body}`
  }

  return { content: out, files: [...ctx.files], warnings: ctx.warnings }
}

async function expand(
  text: string,
  dir: string,
  ancestors: string[],
  depth: number,
  ctx: Ctx,
  startup: string[],
): Promise<string> {
  const lines = text.split("\n")
  const out: string[] = []

  for (const { line, inBlock } of scanLines(lines)) {
    if (inBlock) {
      out.push(line)
      continue
    }

    const setup = line.match(SETUPFILE_LINE)
    if (setup) {
      const resolved = await resolveReference(setup[1], dir, ctx)
      if ("error" in resolved) {
        ctx.warnings.push(resolved.error)
        continue
      }
      out.push(...(await importSettings(resolved.path, ancestors, depth + 1, ctx)))
      continue
    }

    const include = line.match(INCLUDE_LINE)
    if (include) {
      out.push(...(await expandInclude(include[1], dir, ancestors, depth, ctx, startup)))
      continue
    }

    const start = line.match(STARTUP_LINE)
    if (start) {
      startup.push(start[1])
      out.push(line)
      continue
    }

    out.push(line)
  }

  return out.join("\n")
}

async function expandInclude(
  raw: string,
  dir: string,
  ancestors: string[],
  depth: number,
  ctx: Ctx,
  startup: string[],
): Promise<string[]> {
  if (depth >= ctx.maxDepth) {
    ctx.warnings.push(`#+INCLUDE chain deeper than ${ctx.maxDepth} — stopped at ${raw}`)
    return []
  }

  const spec = parseIncludeSpec(raw)
  if ("error" in spec) {
    ctx.warnings.push(spec.error)
    return []
  }

  const resolved = await resolveReference(spec.target, dir, ctx)
  if ("error" in resolved) {
    ctx.warnings.push(resolved.error)
    return []
  }
  if (ancestors.includes(resolved.path)) {
    ctx.warnings.push(`#+INCLUDE cycle at ${resolved.path} — stopped`)
    return []
  }

  const read = await readBounded(resolved.path)
  if (typeof read !== "string") {
    ctx.warnings.push(read.error)
    return []
  }
  ctx.files.add(resolved.path)

  let body = read
  if (spec.search) {
    const selected = selectSearch(body, spec.search)
    if (typeof selected !== "string") {
      ctx.warnings.push(`${selected.error} (${spec.target})`)
      return []
    }
    body = selected
  }
  if (spec.lines) {
    const all = body.split("\n")
    const from = Math.min(spec.lines.from - 1, all.length)
    const to = spec.lines.to === Number.POSITIVE_INFINITY ? all.length : Math.min(spec.lines.to - 1, all.length)
    body = all.slice(from, Math.max(from, to)).join("\n")
  }
  if (spec.onlyContents) body = stripToContents(body)

  if (spec.wrap) {
    const escaped = escapeForBlock(body)
    if (spec.wrap.kind === "src") {
      const lang = spec.wrap.lang ? ` ${spec.wrap.lang}` : ""
      return [`#+BEGIN_SRC${lang}`, ...escaped.split("\n"), "#+END_SRC"]
    }
    if (spec.wrap.kind === "example") {
      return ["#+BEGIN_EXAMPLE", ...escaped.split("\n"), "#+END_EXAMPLE"]
    }
    return [`#+BEGIN_EXPORT ${spec.wrap.backend}`, ...body.split("\n"), "#+END_EXPORT"]
  }

  if (spec.minlevel !== undefined) body = applyMinlevel(body, spec.minlevel)

  // Plain Org content is recursively expanded so a nested #+INCLUDE resolves
  // relative to ITS own file, exactly as Org does.
  const nested = await expand(body, dirname(resolved.path), [...ancestors, resolved.path], depth + 1, ctx, startup)
  return nested.split("\n")
}
