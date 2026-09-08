/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/comments/jsonld.ts — the thread, as structured data.
 *
 * `DiscussionForumPosting` with NESTED `comment` arrays is the shape Google's Discussion Forum
 * documentation uses, so the markup is eligible for their treatment rather than merely valid.
 * It pairs with the `discussionUrl` the engine already puts on the article, giving a crawler a
 * path from article to discussion to replies without guessing.
 *
 * Nesting is only safe because the tree is BOUNDED and WELL-FORMED before it arrives: threadOf
 * caps the depth at three and drops whole subtrees rather than promoting them, and an orphan is
 * a root.
 *
 * Every @id is ABSOLUTE, which is not a coincidence. The SEO resolver refuses to publish a
 * relative @id on the grounds that it "names nothing a crawler can resolve, and publishing one
 * is worse than leaving the field out". A build without --base-url gives the PAGE no absolute
 * identity to offer — but the post and each reply have one, and those are the entities being
 * described. The thread hangs off the post, not off the page.
 */

import type { CommentAuthor, CommentMetrics, CommentNode, Thread } from "./types.js"

const permalink = (c: { id: string; author: CommentAuthor }): string =>
  `https://x.com/${c.author.handle}/status/${c.id}`

const person = (who: CommentAuthor): Record<string, unknown> => ({
  "@type": "Person",
  name: who.name,
  identifier: `@${who.handle}`,
  url: `https://x.com/${who.handle}`,
})

function interactions(metrics: CommentMetrics | undefined): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  if (metrics?.likes) {
    out.push({
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/LikeAction",
      userInteractionCount: metrics.likes,
    })
  }
  if (metrics?.replies) {
    out.push({
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/ReplyAction",
      userInteractionCount: metrics.replies,
    })
  }
  return out
}

/*
 * `parentItem` is kept ALONGSIDE the nesting, and the reason is the orphan.
 *
 * Nesting states a parent by POSITION. An orphan — a reply whose parent fell outside the fetch
 * window — is placed at the top level because there is nowhere else to put it, and position
 * alone would then assert that it answered the announcement post. It did not. So a node carries
 * an explicit parentItem when its parent is genuinely known, and an orphan carries none: a
 * reader following the nesting over-reads slightly, a reader following parentItem gets the
 * truth, and nothing false is stated outright.
 */
function commentNode(node: CommentNode, parentId: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = {
    "@type": "Comment",
    "@id": permalink(node),
    url: permalink(node),
    text: node.text,
    author: person(node.author),
  }
  if (node.createdAt) out.datePublished = node.createdAt
  if (node.lang) out.inLanguage = node.lang
  const stats = interactions(node.metrics)
  if (stats.length) out.interactionStatistic = stats
  if (parentId) out.parentItem = { "@id": parentId }
  if (node.children?.length) {
    /* A named arrow, not a bare reference: Array.map hands the callback an INDEX second, and a
     * bare `map(commentNode)` passed 1, 2, 3 as parent ids — which crashed the first real
     * thread this ever saw, because a sample publishes nothing and so exercised none of it. */
    out.comment = node.children.map((kid) => commentNode(kid, permalink(node)))
  }
  return out
}

/*
 * Returns null when there is nothing honest to publish.
 *
 * NOTHING IS PUBLISHED FOR A SAMPLE. Invented replies attributed to a real post, marked up as
 * schema.org Comment entities with dates and authors, is structured-data spam — a
 * machine-readable assertion that people said things nobody said. A sample exists to review a
 * layout; it does not get to make claims.
 */
export function buildForumJsonLd(
  thread: Thread | null | undefined,
  roots: CommentNode[] | null | undefined,
): Record<string, unknown> | null {
  if (!thread || thread.sample === true || !thread.postUrl || !roots?.length) return null

  const post = thread.post
  const out: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": thread.postUrl,
    url: thread.postUrl,
  }
  /* A discussion with no author and no date is an incomplete entity, and a crawler that cannot
   * see what the discussion is ABOUT has only a list of replies to nothing. */
  if (post?.author) out.author = person(post.author)
  if (post?.createdAt) out.datePublished = post.createdAt
  if (post?.text) out.text = post.text
  if (post?.lang) out.inLanguage = post.lang

  const count = (nodes: CommentNode[]): number =>
    nodes.reduce((n, node) => n + 1 + count(node.children ?? []), 0)
  out.commentCount = count(roots)
  /* A top-level reply answered the post; an orphan answered something nobody can see. */
  out.comment = roots.map((node) => commentNode(node, node.orphan ? null : (thread.postUrl as string)))
  return out
}
