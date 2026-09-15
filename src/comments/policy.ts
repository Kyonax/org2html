/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/comments/policy.ts — decide whether a fetched reply may be published.
 *
 * THE PROBLEM THIS SOLVES. Nothing between the platform's API and a published page looks at
 * what a reply SAYS. `src/renderer/sanitizer.ts` is HTML safety — it answers "can this markup
 * execute" — and it does not apply to comments at all, which are data and are escaped by
 * whatever renders them. A reply can therefore be perfectly safe markup and still be a slur,
 * printed under an article with the author's name on it.
 *
 * WHY THE RULES ARE LOCAL AND DETERMINISTIC. A moderation API would judge nuance better, but it
 * would put a network call and a second secret in the middle of a pipeline whose whole design
 * is that it reproduces offline — and a verdict that depends on a remote service is a verdict
 * nobody can test. Here the same text always yields the same verdict, so every rule in this
 * file is covered by an assertion.
 *
 * THE VERDICT IS THREE-WAY, AND THE THIRD ONE IS THE POINT:
 *   publish  nothing fired
 *   hold     uncertain — quarantined outside the served cache, waiting for a human
 *   reject   a hard rule fired — NOTHING is written, anywhere, ever
 *
 * A binary allow/deny forces a bad trade: reject too eagerly and a platform's short retention
 * window destroys a legitimate reply before anyone can look at it, because it can never be
 * re-fetched. `hold` is what makes it safe to be strict.
 *
 * WHAT SHIPS AND WHAT DOES NOT. The structural rules and the matcher ship; a TERM LIST does
 * not. A wordlist is a file of slurs, it is culture- and language-specific, and every project's
 * is different — so the default policy carries limits and no terms, and a project supplies its
 * own through `--blocklist`. The engine brings the mechanism, not somebody else's judgement.
 */

import { readFileSync } from "node:fs"

import type { CompiledPolicy, Comment, Judgement, PolicyLimits, RawPolicy } from "./types.js"

/*
 * Fold text down to a form a blocklist can match, WITHOUT changing what a reader sees — this
 * copy exists only to be compared against, and is thrown away.
 *
 * Three transforms, each earning its place:
 *   · accents      `pendejó` and `pendejo` are the same word
 *   · leetspeak    `@ss` costs an attacker one keystroke; ignoring it makes a list decorative
 *   · long runs    `baaaad` likewise. Every run collapses to one character — and because the
 *                  TERMS fold through the same function, `class` folding to `clas` costs
 *                  nothing: the boundary check still refuses to match `as` inside it.
 */
const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", $: "s", "@": "a", "!": "i",
}

export function fold(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[0134578$@!]/g, (ch) => LEET[ch] ?? ch)
    .replace(/(.)\1+/g, "$1")
}

/*
 * WORD BOUNDARIES, NOT SUBSTRINGS. This is the difference between a moderation list and the
 * Scunthorpe problem: a substring match bans an English town, a Spanish surname and half of
 * `classic` along with the word it was aiming at. A term containing a space matches as a
 * phrase, with the boundary at each end.
 *
 * The class is `[^\p{L}\p{N}]` and NOT `\b`, which is ASCII-only and would not fire on `ñ` at
 * all. Terms are escaped first, so one stray parenthesis in a file meant to be safe to edit
 * cannot break the run.
 */
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const termPattern = (term: string): RegExp =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(fold(term))}(?:[^\\p{L}\\p{N}]|$)`, "u")

/*
 * The defaults a project gets without supplying anything. Limits only — see the header on why
 * no terms ship.
 */
export const DEFAULT_LIMITS: PolicyLimits = {
  maxLength: 1200,
  maxLinks: 2,
  maxMentions: 6,
  capsRatio: 0.7,
  capsMinLength: 40,
}

/*
 * Structural signals. None is proof of anything on its own, which is exactly why they all
 * resolve to HOLD rather than reject — they describe a shape that is usually spam, and
 * "usually" is not a standard on which to destroy somebody's reply.
 */
function structural(text: string, limits: PolicyLimits): string | null {
  const trimmed = text.trim()
  if (!trimmed) return "empty"
  if (trimmed.length > limits.maxLength) return "too-long"

  const links = (trimmed.match(/https?:\/\/\S+/g) ?? []).length
  if (links > limits.maxLinks) return "link-spam"

  const mentions = (trimmed.match(/(?:^|\s)@\w{1,15}\b/g) ?? []).length
  if (mentions > limits.maxMentions) return "mention-farming"

  /*
   * Shouting, measured only on replies long enough for the ratio to mean something. A short
   * "YES!" is enthusiasm; four lines of capitals is not, and it wrecks the page besides.
   */
  const letters = trimmed.replace(/[^\p{L}]/gu, "")
  if (letters.length >= limits.capsMinLength) {
    const upper = trimmed.replace(/[^\p{Lu}]/gu, "").length
    if (upper / letters.length > limits.capsRatio) return "shouting"
  }
  return null
}

/*
 * The verdict. Order matters: the cheapest and most certain signals run first, so a reply the
 * platform has already flagged never reaches the wordlist, and a reject always wins over a hold.
 */
export function judge(comment: Partial<Comment> | null | undefined, policy: CompiledPolicy): Judgement {
  const text = comment?.text ?? ""

  /* The platform's own classification. It is conservative and it is free — if the service
   * hosting the reply says it may be sensitive, that is enough for a personal blog. */
  if (comment?.possiblySensitive === true) {
    return { verdict: "reject", rule: "platform:possibly-sensitive" }
  }

  const folded = fold(text)
  for (const entry of policy.terms) {
    if (entry.pattern.test(folded)) {
      return { verdict: entry.severity, rule: `term:${entry.severity}` }
    }
  }

  const shape = structural(text, policy.limits)
  if (shape) return { verdict: "hold", rule: `shape:${shape}` }

  return { verdict: "publish", rule: null }
}

/*
 * Compile the list ONCE. `terms` is sorted reject-first so the loop above can return on the
 * first hit and still guarantee a reject outranks a hold — the alternative is scanning the
 * whole list for every reply to find the worst match, which is the same answer at more cost.
 *
 * The regexes are NOT serialised into the version: two lists with the same terms in a different
 * order must produce the same version, or every reorder would look like a policy change and
 * trigger a re-judge that changes nothing.
 */
export function compilePolicy(raw: RawPolicy): CompiledPolicy {
  const terms = [...(raw.terms ?? [])]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "reject" ? -1 : 1))
    .map((entry) => ({ severity: entry.severity, pattern: termPattern(entry.term) }))
  return {
    version: raw.version,
    limits: { ...DEFAULT_LIMITS, ...(raw.limits ?? {}) },
    terms,
  }
}

/** The policy a project gets when it supplies no `--blocklist`: the shape rules, and no terms. */
export function defaultPolicy(): CompiledPolicy {
  return compilePolicy({ version: "default", limits: DEFAULT_LIMITS, terms: [] })
}

/*
 * An avatar comes from exactly one host. This lives here rather than in the fetcher because the
 * fetcher is a COMMAND — importing it to test one predicate would run the whole tool.
 */
const AVATAR_HOST = "pbs.twimg.com"

export function isAllowedAvatarUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === "https:" && u.hostname === AVATAR_HOST
  } catch {
    return false
  }
}

export function loadPolicy(path: string): CompiledPolicy {
  return compilePolicy(JSON.parse(readFileSync(path, "utf8")) as RawPolicy)
}
