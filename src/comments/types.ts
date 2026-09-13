/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/comments/types.ts — the shape of a fetched conversation.
 *
 * These types describe DATA, not markup. The engine renders no comment markup at all ([P-00]):
 * it reads `#+POST_URL` into metadata, and a thread fetched by `org2html comments` is written
 * as JSON for a host to render however its own design demands. Everything in this directory
 * therefore takes a thread in and gives data back — a tree, a verdict, a structured-data node.
 */

export interface CommentAuthor {
  name: string
  handle: string
  avatar?: string
}

export interface CommentMetrics {
  likes?: number
  replies?: number
}

export interface Comment {
  id: string
  text: string
  author: CommentAuthor
  /** The id this reply answers — the post's own id for a direct reply. */
  replyTo?: string | null
  createdAt?: string
  lang?: string
  metrics?: CommentMetrics
  possiblySensitive?: boolean
  /** Set by threadOf: a reply whose parent pointer resolves to nothing anyone can see. */
  orphan?: boolean
}

/** A comment with its children resolved — what threadOf returns. */
export interface CommentNode extends Comment {
  children: CommentNode[]
}

export interface Thread {
  postId?: string
  postUrl?: string
  /** True for an obviously fictional thread written by `comments sample`. */
  sample?: boolean
  post?: {
    author?: CommentAuthor
    text?: string
    createdAt?: string
    lang?: string
  }
  comments?: Comment[]
}

export type Verdict = "publish" | "hold" | "reject"

export interface PolicyLimits {
  maxLength: number
  maxLinks: number
  maxMentions: number
  capsRatio: number
  capsMinLength: number
}

export interface PolicyTerm {
  term: string
  severity: Exclude<Verdict, "publish">
}

/** The on-disk shape a `--blocklist` file must have. */
export interface RawPolicy {
  version: string
  limits?: Partial<PolicyLimits>
  terms?: PolicyTerm[]
}

export interface CompiledPolicy {
  version: string
  limits: PolicyLimits
  terms: Array<{ severity: Exclude<Verdict, "publish">; pattern: RegExp }>
}

export interface Judgement {
  verdict: Verdict
  rule: string | null
}
