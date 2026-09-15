<!--
Copyright (c) 2026 Cristian D. Moreno — @Kyonax
Distributed under the terms of GPL-3.0-only — see LICENSE.

This Markdown file is the npm-registry mirror of README.org (npmjs.com renders
Markdown, not Org). README.org is the source of truth; keep this CLI-first.
-->

# @kyonax/org2html

**A CLI that converts Org-mode (`.org`) files into clean, accessible, SEO-ready
HTML (and Vue SFCs).** It is a *converter*, not a site generator — one document
in, one styled document out. Styling, accessibility, SEO metadata, and a
pluggable Style Book are built in.

## Install

```bash
npm i -g @kyonax/org2html
```

## Quick start

```bash
# Build a single file (or a directory tree) to static HTML
org2html build post.org -o site/

# Live-rebuild while you write
org2html watch content/ -o site/

# Pipe one document through (stdin -> stdout)
cat post.org | org2html - > post.html
org2html --stdin --format vue < post.org > Post.vue
```

Every build emits, per document: `index.html`, a Vue `index.vue` SFC,
`metadata.json`, and structured data — plus a `sitemap.json` and `feed.json`
for the set.

## Common flags

| Flag | Effect |
|------|--------|
| `-o, --output <dir>` | Output directory (default `dist`). |
| `-t, --template <file>` / `--template-dir <dir>` | Custom template / template dir. |
| `--theme <light\|dark>` | Force the color theme (`data-theme`). |
| `--css <file>` / `--css-append <file>` / `--link-css <href>` | Bring your own CSS. |
| `--css-var <name=value>` | Override a design token (repeatable). |
| `--no-default-styles` | Emit semantic hooks only, zero engine CSS. |
| `--style-book <ref>` | Swap the whole look (dir / npm / URL). |
| `--components <map.json>` / `--strict` | Component name → import map (+ strict validation). |
| `--plugin <file>` | Load a conversion-time plugin (repeatable). |
| `--no-sanitize` / `--no-highlight` | Disable DOMPurify / Shiki. |
| `--include-root <dir>` | Allow `#+SETUPFILE` / `#+INCLUDE` to read from `<dir>` (repeatable). |
| `--no-resolve-includes` | Leave `#+SETUPFILE` / `#+INCLUDE` / `#+STARTUP` unresolved. |
| `--strict` | Error on an unknown component or an unresolved `#+INCLUDE`/`#+SETUPFILE` instead of warning. |

Run `org2html help <command>` for the full, always-accurate flag list.

## Exit codes

- `0` — success.
- `1` — one or more files failed, an empty input glob, a missing input, an
  unknown component or an unresolved `#+INCLUDE`/`#+SETUPFILE` under `--strict`,
  a `routes.js` or template-asset write that failed, or a bad flag value.

`--quiet` silences progress output only. Warnings and failures go to stderr,
which `--quiet` never suppresses, and a build that could not write something it
links to exits `1` rather than reporting success.

## The output manifest, and what a rebuild deletes

Each build writes `.o2h-manifest.json` at the root of `--output`: the version,
the resolved input directory, and every route it produced. The next build reads
it to find pages whose source is gone and clean them up, so renaming or deleting
an `.org` file does not leave an orphan page behind.

It deletes conservatively, because deleting is the one thing a build does that
building again cannot undo:

- **Only the six files the engine writes** are removed from a stale page —
  `index.html`, `index.vue`, `metadata.json`, `og-metadata.json`,
  `structured-data.json`, `relations.json` — and the directory itself only if
  nothing else is left. A file you put inside a page directory stays, and so
  does a live page nested under a stale page's path.
- **A build with failures prunes nothing** and leaves the manifest untouched.
  The manifest on disk still describes what a redeploy would serve, and the page
  that failed to rebuild is exactly the one that must not disappear.
- **A shared `--output` is refused, not pruned.** Two corpora built into one
  directory would each see the other's pages as stale. The manifest records the
  input it came from; a mismatch prints one line to stderr and removes nothing.
- **Interrupting a build leaves no manifest**, so the next build has nothing to
  prune from and simply rebuilds.

Nothing outside the recorded routes is ever touched: `CNAME`, `assets/` and
anything else you keep in the output directory are not the engine's to remove.

## Dates, robots.txt and the web manifest

Every sidecar a crawler reads — `structured-data.json`, `og-metadata.json`,
`feed.json`, `sitemap.json` — carries an ISO `YYYY-MM-DD` date, or omits the
field when the document declares none. An Org timestamp like `<2026-03-01 Sun>`
is normalised rather than passed through, and nothing is ever filled from the
wall clock, so two builds of the same sources produce the same bytes whatever day
they run. `metadata.json` keeps both `date` (as authored) and `dateIso` by
design; it is data for the host, not a crawler surface.

The built `robots.txt` is `User-agent: *` and `Allow: /`. The engine writes
`sitemap.json` and never `sitemap.xml`, so it does not advertise one — bring your
own through `--template-dir` if you compose a real sitemap.

`manifest.json` is composed, not copied: `theme_color` is the resolved Style Book
token the page head also publishes, and `name` comes from `#+SITE_NAME`.

## Page weight and `--link-styles`

Styles are **inlined by default**, and that is the right default for a page: one
file renders with no second request, and nothing the reader waits on stands
between them and the text.

It stops being the right default for a large corpus. Measured on this engine with
the default Style Book:

| | Per page | Shared | 500 pages |
|---|---|---|---|
| default (inlined) | ~203 KB | — | ~102 MB |
| `--link-styles` | ~3.9 KB | one ~200 KB `styles.css` | ~2.1 MB |

A build of more than 50 pages prints a one-line reminder with those numbers for
the corpus it just built. It is a hint, not a change: the default does not move.

## File-layer keywords

`#+SETUPFILE`, `#+INCLUDE` and `#+STARTUP` are resolved before parsing, so a
document assembled from shared setup files converts exactly as Emacs renders it.
This matters more than it looks: setup files are where `#+MACRO:` definitions
usually live, so a byline built from `{{{person(…)}}}` renders the raw braces if
the setup file is never read.

**A document may only read files inside its own directory.** Otherwise an `.org`
you did not write could say `#+INCLUDE: "/etc/passwd"` and have the contents
published into your HTML. Name a shared directory to allow it:

```bash
org2html build notes/ -o site --include-root ~/org/shared-setup
```

Nothing throws: a missing, refused, cyclic, or too-deep target warns on stderr
and the directive is dropped. See
[docs/includes-and-setupfiles.md](docs/includes-and-setupfiles.md).

## Styling

Output is look-neutral: every construct carries a stable `.org-*` class under an
`.org-root` wrapper, and the stylesheet reads a `--o2h-*` design-token layer
(`var(--host-*, …)`), so a host re-skins with `--css-var`, its own CSS, or a full
**Style Book** swap.

The default book is **kyo-web-online**: dark surface, Geomanist + SpaceMono
(self-hosted, no third-party font requests), one brand yellow `#f9cd26`, 68ch
measure. The previous default — **O2H**, paper/ink with Signal Orange — is
preserved and one flag away:

```bash
org2html build src/ -o out --style-book node_modules/@kyonax/org2html/templates/style-book/o2h
```

See [docs/authoring-style-books.md](docs/authoring-style-books.md).

## Docs

- [Authoring Style Books](docs/authoring-style-books.md) — manifest, hook + token catalog, overrides.
- [Components & Data](docs/components-and-data.md) — component forms, `--components`, image dimensions.
- [Front-matter & SEO](docs/front-matter-and-seo.md) — every config keyword + the head recipes.
- [Includes & setup files](docs/includes-and-setupfiles.md) — `#+SETUPFILE` / `#+INCLUDE` / `#+STARTUP`, precedence, root confinement.

> **The CLI is the product.** Everything documented here is driven through the `org2html`
> command, and that is the interface the docs, the flags and the guarantees describe.
>
> A typed ESM entry is also exported and is covered by the install smoke test —
> `parse`, `renderToHtml`, `applyTemplate`, `org2html` and the plugin/asset helpers, with
> `dist/index.d.ts` shipped alongside. Use it if you are embedding the engine; the CLI is
> still where new surface lands first.

## License

GPL-3.0-only. Files *generated* by org2html are unencumbered — see
[LICENSE-EXCEPTION.txt](LICENSE-EXCEPTION.txt).
