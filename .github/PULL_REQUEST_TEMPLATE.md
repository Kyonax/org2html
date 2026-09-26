<!--
  Copyright (c) 2026 Cristian D. Moreno — @Kyonax
  Distributed under the terms of GPL-3.0-only — see LICENSE.
-->

<!--
   ________ ______  ___  __   __  _________  ___  _____  ________
  /_  __/ // / __/ / _ )/ /  / / / / __/ _ \/ _ \/  _/ |/ /_  __/
   / / / _  / _/  / _  / /__/ /_/ / _// ___/ , _// //    / / /
  /_/ /_//_/___/ /____/____/\____/___/_/  /_/|_/___/_/|_/ /_/

  PULL_REQUEST_TEMPLATE.md — Default PR body
  2026-05-21

  Auto-loaded on any PR. Sections: Summary, Changes, Technical
  Details, Test Plan, Special Deployment, Documentation.

  Guidelines:
    Title under 70 chars — detail goes in the body
    Reference tickets / issues inline: (#42), (NPM-7)
    No emojis, no arrows, no private-file references
    Absolute URLs only; ***Label:*** for inline colon labels
-->

## Summary

<!-- One to three sentences. Why this change exists, what it unlocks. -->

## Changes

<!--
  Flat list with ticket / issue references in parens, or themed
  ### subsections with [NEW] / [MOD] / [DEL] / [MOV] tags.

  Example flat form:

  - **Renderer:** sanitize-first pipeline now wired through `applyTemplate` (#42)
  - **CLI:** version flag now reads from package.json at build time
-->

## Technical Details

<!--
  Bullets — one per non-obvious decision. Each item names the
  file(s) and the why.

  Example:
  - `src/renderer/sanitizer.ts` switches from DOMPurify default config
    to a curated allowlist of inline-image attributes (`width`, `height`,
    `loading`, `decoding`, `fetchpriority`) so the LCP preload hint
    survives sanitization downstream.
-->

## Test Plan

<!--
  Bulleted markdown checklist.
  Include both the golden path and edge cases.
-->

- [ ] `npm run lint` reports 0 errors
- [ ] `npm test` passes (vitest)
- [ ] `npm run build` succeeds
- [ ] `node scripts/precheck.mjs` reports all green
- [ ] CLI: `node dist/cli/index.mjs build <fixture>.org -o /tmp/out`
- [ ] Library: `import { org2html } from '@kyonax/org2html'` round-trips a fixture

## Special Deployment

<!--
  Anything reviewers / merger MUST know before merging.

  Severities (highest first):
  - **BLOCKING** — do not merge without coordinator approval.
  - **REQUIRED** — must run a one-shot action after merge.
  - **NOTABLE** — heads-up; merge proceeds normally.
  - **NONE** — nothing special.

  Examples:
  - **REQUIRED:** bump `package.json` version + create a `vX.Y.Z` tag
    after merge to trigger `.github/workflows/publish.yml`.
  - **NOTABLE:** changes `RenderOptions.fetchRemoteAssets` default
    behavior. Downstream consumers should re-test their pipelines.
-->

**NONE**

## Documentation

<!--
  Per-media checklist of doc changes shipped with this PR. Skip
  rows that don't apply.

  - **README:** updated `FILE STRUCTURE` block to reflect new paths.
  - **CHANGELOG:** added entry under `[Unreleased]`.
  - **Session file:** added Activity Log row dated YYYY-MM-DD HH:MM.
  - **Roam node:** ticked off the relevant TODO checkbox.
  - **Plan node decisions:** logged DECISION-NN with rationale.
  - **External:** none.
-->

- **README:**
- **CHANGELOG:**
- **Session file:**
- **Roam node:**
- **External:**
