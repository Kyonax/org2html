/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * Ported from examples/site/scripts/test-comments.mjs, assertion names kept verbatim.
 *
 * THE RULESET HERE IS INLINE AND ALWAYS WILL BE. This file contains no slurs, and editing any
 * project's real term list cannot break the tests that prove the matcher works. That property
 * was deliberate in the original and it is the reason the engine ships a matcher and limits
 * but no word list: a blocklist is a per-project, per-language judgement, and a published one
 * is also a published target that tells an evader exactly what to fold around.
 */

import { describe, expect, it } from "vitest"

import { compilePolicy, defaultPolicy, fold, isAllowedAvatarUrl, judge } from "../../src/comments/policy.js"

const RULES = compilePolicy({
  version: "test",
  limits: { maxLength: 100, maxLinks: 2, maxMentions: 3, capsRatio: 0.7, capsMinLength: 20 },
  terms: [
    { term: "badword", severity: "reject" },
    { term: "iffy", severity: "hold" },
    { term: "niño", severity: "reject" },
  ],
})
const verdict = (text: string, extra = {}) => judge({ text, ...extra }, RULES).verdict
const rule = (text: string, extra = {}) => judge({ text, ...extra }, RULES).rule

describe("the content policy", () => {
  it("a clean reply publishes", () => expect(verdict("A thoughtful reply about the parser.")).toBe("publish"))
  it("a rejected term rejects", () => expect(verdict("you are a badword")).toBe("reject"))
  it("a held term holds", () => expect(verdict("this is a bit iffy honestly")).toBe("hold"))

  /*
   * THE SCUNTHORPE CASE. A substring matcher bans an English town, and it is the single most
   * common way a moderation list becomes a joke. The boundary must hold in both directions.
   */
  it("a clean word CONTAINING a blocked term still publishes", () => expect(verdict("badwordsmith")).toBe("publish"))
  it("a blocked term at the start of a word publishes", () => expect(verdict("badwording")).toBe("publish"))
  it("a blocked term as its own word is caught", () => expect(verdict("that is a badword.")).toBe("reject"))

  it("accents do not evade", () => expect(verdict("bádwórd")).toBe("reject"))
  it("leetspeak does not evade", () => expect(verdict("b4dw0rd")).toBe("reject"))
  it("stretched letters do not evade", () => expect(verdict("baaaadwooord")).toBe("reject"))
  it("capitals do not evade", () => expect(verdict("BADWORD")).toBe("reject"))

  /* Spanish is half some corpora, and \b is ASCII-only — it would not fire on ñ at all. */
  it("a non-ascii term is matched", () => expect(verdict("ese niño")).toBe("reject"))
  it("a non-ascii term respects boundaries", () => expect(verdict("niñosdelbarrio")).toBe("publish"))

  it("fold normalises accents, case and runs", () => expect(fold("Pendejóóó")).toBe("pendejo"))

  /* The platform's own flag. Only an explicit true counts: the field is often absent, and
   * absent is not a statement that the reply is safe. */
  it("the platform marks it sensitive", () => expect(verdict("anything", { possiblySensitive: true })).toBe("reject"))
  it("an absent sensitivity flag is not a verdict", () => expect(verdict("anything")).toBe("publish"))
  it("a false sensitivity flag is not a verdict", () =>
    expect(verdict("anything", { possiblySensitive: false })).toBe("publish"))

  it("link spam holds", () =>
    expect(verdict("a https://a.example b https://b.example c https://c.example")).toBe("hold"))
  it("two links are fine", () => expect(verdict("see https://a.example and https://b.example")).toBe("publish"))
  it("mention farming holds", () => expect(verdict("@a @b @c @d look at this")).toBe("hold"))
  it("shouting holds", () => expect(verdict("THIS IS ENTIRELY IN CAPITAL LETTERS AND GOES ON")).toBe("hold"))
  it("a short exclamation is not shouting", () => expect(verdict("YES!")).toBe("publish"))
  it("an empty reply holds", () => expect(verdict("   ")).toBe("hold"))
  it("an over-long reply holds", () => expect(verdict("x".repeat(101))).toBe("hold"))
  it("the rule names the shape", () => expect(rule("   ")).toBe("shape:empty"))

  const META = compilePolicy({ version: "test", limits: RULES.limits, terms: [{ term: "c++", severity: "hold" }] })
  it("a metacharacter term is escaped, not compiled", () =>
    expect(judge({ text: "I like cxx" }, META).verdict).toBe("publish"))
  it("a metacharacter term still matches itself", () =>
    expect(judge({ text: "I like c++ a lot" }, META).verdict).toBe("hold"))
})

describe("the default policy — mechanism without somebody else's judgement", () => {
  /*
   * No term list ships. What DOES ship still has to work: the structural shapes and the
   * platform flag are the floor a project gets before it writes a single rule of its own.
   */
  const d = defaultPolicy()
  it("ships no terms", () => expect(d.terms).toEqual([]))
  it("still refuses what the platform flagged", () =>
    expect(judge({ text: "hello", possiblySensitive: true }, d).verdict).toBe("reject"))
  it("still holds an empty reply", () => expect(judge({ text: "  " }, d).verdict).toBe("hold"))
  it("still holds link spam", () =>
    expect(judge({ text: "a https://a.e b https://b.e c https://c.e" }, d).verdict).toBe("hold"))
  it("publishes ordinary prose", () =>
    expect(judge({ text: "A perfectly ordinary reply." }, d).verdict).toBe("publish"))
})

describe("the avatar host allowlist", () => {
  it("an X avatar host is allowed", () =>
    expect(isAllowedAvatarUrl("https://pbs.twimg.com/profile_images/1_normal.jpg")).toBe(true))
  it("http is refused", () => expect(isAllowedAvatarUrl("http://pbs.twimg.com/a.jpg")).toBe(false))
  it("another host is refused", () => expect(isAllowedAvatarUrl("https://evil.example/pbs.twimg.com/a.jpg")).toBe(false))
  it("a subdomain trick is refused", () => expect(isAllowedAvatarUrl("https://pbs.twimg.com.evil.example/a.jpg")).toBe(false))
  it("nonsense is refused", () => expect(isAllowedAvatarUrl("not a url")).toBe(false))
})
