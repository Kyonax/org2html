<!--
Copyright (c) 2026 Cristian D. Moreno — @Kyonax
Distributed under the terms of GPL-3.0-only — see LICENSE.
-->

# org2html docs

The master index of copy-paste-ready `.org` usage guides. Every example here is
backed by a fixture under [`../tests/fixtures/`](../tests/fixtures) and exercised
by the Vitest harness, so the docs cannot drift from the engine.

| Guide | Covers |
|-------|--------|
| [front-matter-and-seo.md](front-matter-and-seo.md) | Every `#+KEYWORD`, the social-image / JSON-LD / `#+HTML_HEAD` recipes, and the resulting `<head>`. |
| [authoring-style-books.md](authoring-style-books.md) | Building a Style Book, the `stylebook.json` manifest, the `.org-*` hook + `--o2h-*` token catalog, and the bring-your-own-styling override surface. |
| [includes-and-setupfiles.md](includes-and-setupfiles.md) | `#+SETUPFILE` / `#+INCLUDE` / `#+STARTUP` resolution, every `#+INCLUDE` parameter, the precedence rule, and the root-confinement security model. |
| [components-and-data.md](components-and-data.md) | Component invocation forms (inline `{{< … >}}`, block `#+BEGIN_COMPONENT`, JSON props), the `--components` map, and image dimensions. |
| [shiki-migration.md](shiki-migration.md) | Why `shiki` is pinned at `0.14`, what that costs (no `emacs-lisp` or `org` grammar), and the two routes off it. |

For the CLI surface, flags, and exit codes, see the project
[README.org](../README.org) (or [README.md](../README.md) on npm).
