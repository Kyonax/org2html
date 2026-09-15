/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * Ported from examples/site/scripts/test-comments.mjs, assertion names kept verbatim.
 *
 * These exist because NOTHING exercised this code. A sample thread deliberately publishes no
 * structured data, so the only cache the repo ever held was the one that skips the builder —
 * and it shipped with `roots.map(commentNode)`, which hands Array.map's INDEX in as the parent
 * and crashed the build on the first real thread.
 */

import { describe, expect, it } from "vitest"

import { buildForumJsonLd } from "../../src/comments/jsonld.js"
import { flatten, threadOf } from "../../src/comments/thread.js"
import type { Thread } from "../../src/comments/types.js"

const REAL: Thread = {
  postId: "ROOT",
  postUrl: "https://x.com/someone/status/ROOT",
  post: { author: { name: "Someone", handle: "someone" }, createdAt: "2026-01-01", text: "Announcing." },
  comments: [
    { id: "a", replyTo: "ROOT", createdAt: "1", text: "first", author: { name: "A", handle: "a" }, metrics: { likes: 2, replies: 1 } },
    { id: "b", replyTo: "a", createdAt: "2", text: "second", author: { name: "B", handle: "b" } },
    { id: "c", replyTo: "b", createdAt: "3", text: "third", author: { name: "C", handle: "c" } },
    { id: "d", replyTo: "ROOT", createdAt: "4", text: "fourth", author: { name: "D", handle: "d" } },
    { id: "orph", replyTo: "GONE", createdAt: "5", text: "orphan", author: { name: "O", handle: "o" } },
  ],
}

type Node = Record<string, any>
const ld = buildForumJsonLd(REAL, threadOf(REAL)) as Node
const comments = (): Node[] => ld.comment as Node[]

describe("the thread as structured data", () => {
  it("publishes a DiscussionForumPosting", () => expect(ld["@type"]).toBe("DiscussionForumPosting"))
  it("hangs off the post, absolutely", () => expect(ld["@id"]).toBe("https://x.com/someone/status/ROOT"))
  it("carries the root author", () => expect((ld.author as Node).identifier).toBe("@someone"))

  /* THE BUG THIS FILE EXISTS FOR: every root must get the POST as its parent, not its index. */
  it("every root parents to the post, not to its index", () =>
    expect(comments().filter((c) => c.parentItem).map((c) => c.parentItem["@id"])).toEqual([
      "https://x.com/someone/status/ROOT",
      "https://x.com/someone/status/ROOT",
    ]))

  it("an orphan claims no parent it cannot show", () =>
    expect(comments().find((c) => String(c["@id"]).endsWith("/orph"))!.parentItem).toBeUndefined())
  it("nests rather than flattens", () =>
    expect(comments()[0].comment[0].comment[0]["@id"]).toBe("https://x.com/c/status/c"))
  it("a nested node names its real parent", () =>
    expect(comments()[0].comment[0].parentItem["@id"]).toBe("https://x.com/a/status/a"))
  it("commentCount matches the tree", () => expect(ld.commentCount).toBe(flatten(threadOf(REAL)).length))
  it("metrics become interaction counters", () => expect(comments()[0].interactionStatistic.length).toBe(2))
  it("no metrics, no counter", () => expect("interactionStatistic" in comments()[1]).toBe(false))

  const deepest = (nodes: Node[] | undefined, d = 1): number =>
    (nodes ?? []).reduce((m, c) => Math.max(m, c.comment ? deepest(c.comment, d + 1) : d), 0)
  it("never nests past three levels", () => expect(deepest(comments())).toBe(3))

  const everyId = (nodes: Node[]): boolean =>
    nodes.every((c) => String(c["@id"]).startsWith("https://") && everyId(c.comment ?? []))
  it("every id is absolute", () => expect(everyId(comments())).toBe(true))

  it("a sample publishes nothing", () =>
    expect(buildForumJsonLd({ ...REAL, sample: true }, threadOf(REAL))).toBeNull())
  it("a thread with no replies publishes nothing", () => expect(buildForumJsonLd(REAL, [])).toBeNull())
  it("a thread with no post url publishes nothing", () =>
    expect(buildForumJsonLd({ ...REAL, postUrl: undefined }, threadOf(REAL))).toBeNull())
})
