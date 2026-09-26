<!--
Copyright (c) 2026 Cristian D. Moreno — @Kyonax
Distributed under the terms of GPL-3.0-only — see LICENSE.
-->

# Authoring Style Books

A **Style Book** is a swappable bundle that gives org2html output a complete
look. The built-in **O2H Style Book** is the default; `--style-book <ref>` swaps
it wholesale. This guide shows how to build a strong book, how the override
surface works, and the stable `.org-*` hook contract a book must cover.

- [1. What a Style Book is](#1-what-a-style-book-is)
- [2. A minimal book in five minutes](#2-a-minimal-book-in-five-minutes)
- [3. The manifest reference](#3-the-manifest-reference-stylebookjson)
- [4. The `.org-*` hook + token contract](#4-the-org--hook--token-contract)
- [5. Components](#5-components)
- [6. Referencing CSS / JS / fonts / assets](#6-referencing-css--js--fonts--assets)
- [7. Publishing: dir / npm / URL](#7-publishing-dir--npm--url)
- [8. Validating and golden-testing a book](#8-validating-and-golden-testing-a-book)
- [9. Overriding without a full book (BYO)](#9-overriding-without-a-full-book-byo)

## 1. What a Style Book is

The engine emits **look-neutral** HTML: every construct carries a stable
`.org-*` class and the whole body is wrapped in `.org-root`. A Style Book
supplies the CSS (and optionally a template + a component map) that styles those
hooks. The **reference-don't-build** contract ([D-28]) governs a book: the
engine reads its files and references its CSS/JS — it never compiles SASS and
never executes a book's JavaScript. Selecting a book is a **full swap** ([D-29]):
it replaces the default wholesale; pieces it omits degrade to bare semantic
output with a validation warning (never a silent fallback to O2H).

## 2. A minimal book in five minutes

```
my-book/
├── stylebook.json
├── tokens.css
└── styles.css
```

`stylebook.json`:

```json
{
  "name": "my-book",
  "version": "0.1.0",
  "engineCompat": "^1",
  "classPrefix": "org-",
  "tokens": "tokens.css",
  "styles": "styles.css",
  "constructs": ["org-root", "org-heading", "org-paragraph", "org-link"]
}
```

`tokens.css` (host-token overrides — see §4):

```css
:root {
  --host-signal-500: #0aa;
  --host-ink: #111;
  --host-font-editorial: Georgia, serif;
}
```

`styles.css` (rules against the hooks):

```css
.org-root { max-width: 60ch; }
.org-root .org-link { color: var(--host-signal-500); }
```

Build with it:

```bash
org2html build post.org -o site --style-book ./my-book
```

## 3. The manifest reference (`stylebook.json`)

| Field         | Type                     | Meaning                                                        |
|---------------|--------------------------|---------------------------------------------------------------|
| `name`        | string (required)        | Book identifier.                                              |
| `version`     | string (required)        | Book version.                                                 |
| `engineCompat`| string                   | Semver range the book targets (e.g. `^1`). Major mismatch → warning. |
| `classPrefix` | string                   | Hook namespace the book styles against (default `org-`).      |
| `themeColor`  | string                   | Accent for `<meta name="theme-color">`, so the browser chrome follows the book. A document's `#+THEME_COLOR` still wins. |
| `tokens`      | path                     | CSS file of custom-property overrides (read + inlined first). |
| `styles`      | path \| path[]           | CSS file(s) of hook rules, inlined after tokens. An ARRAY is concatenated in cascade order — how a book reuses the engine's shared construct sheet and layers only its own delta on top. |
| `template`    | path                     | HTML template with `{{content}}` etc. (optional — default used if omitted). |
| `layouts`     | object                   | Named layout templates (reserved).                            |
| `components`  | object (name → source)   | Component import map for `data-component` placeholders.        |
| `assets`      | string[]                 | Referenced asset paths (favicon, manifest, …).                |
| `scripts`     | string[]                 | Script hrefs emitted as `<script src defer>` (never executed).|
| `constructs`  | string[]                 | Declared `.org-*` coverage — see §4/§8.                       |

Paths are resolved relative to the manifest, so `"../styles.css"` and
subdirectories both work.

### Layering onto the shared construct sheet

Most books do not need to restate every hook rule. The engine's `templates/styles.css`
already implements all of them against `--o2h-*` and reads nothing else, so a book
usually only supplies values plus the handful of things a token cannot carry —
webfont registrations, a family switch, an extra rule-line:

```json
{
  "name": "mybook",
  "version": "1.0.0",
  "engineCompat": "^1",
  "themeColor": "#f9cd26",
  "tokens": "mybook-tokens.css",
  "styles": ["../styles.css", "mybook.css"]
}
```

Both shipped books are built exactly this way — see
[`../templates/style-book/README.md`](../templates/style-book/README.md).

## 4. The `.org-*` hook + token contract

**Tokens.** The default CSS reads a `--o2h-*` token layer where every token is
`var(--host-X, <o2h-default>)`. Redefine `--host-*` to re-skin O2H while keeping
its structure; redefine `--o2h-*` directly to override the resolved value. Key
tokens: palette `--host-signal-500` / `--host-paper` / `--host-ink` /
`--host-line`; type `--host-fs-h1` / `--host-measure` / `--host-lh-body`; fonts
`--host-font-display` / `--host-font-editorial` / `--host-font-mono`; structure
`--host-radius` / `--host-border`; code `--host-code-bg` / `--host-syn-keyword`.

**Hooks.** A strong book covers these stable hooks (the catalog is
machine-checked by `resolveStyleBook` against `KNOWN_CONSTRUCTS`, and the golden
render test asserts they are emitted):

| Hook                       | Wraps                                              |
|----------------------------|---------------------------------------------------|
| `.org-root`                | The whole article body (styling anchor).          |
| `.org-section`             | A heading and the content it owns.                |
| `.org-heading.outline-N`   | `<h1>`–`<h6>` (N = level).                         |
| `.org-paragraph`           | Body paragraphs.                                  |
| `.org-code` / `.org-verbatim` | Inline `~code~` / `=verbatim=`.               |
| `.org-src`                 | Code blocks (`+ .shiki` for the css-vars theme).  |
| `.org-quote`               | `#+BEGIN_QUOTE`.                                   |
| `.org-example` / `.org-verse` / `.org-center` | Verbatim / verse / centered blocks. |
| `.org-ul` / `.org-ol` / `.org-dl` (`.org-dt`/`.org-dd`) | Lists.               |
| `.org-li--checkbox`        | Checkbox list items.                              |
| `.org-table`               | Tables (`thead`/`th[scope]`, aligned cells).      |
| `.org-link` (`.org-link-external`) | Links (external gets a marker).           |
| `.org-figure` / `.org-figcaption` / `.org-image` | Images and figures.         |
| `.org-toc` (`-title`/`-link`) | Table of contents.                            |
| `.org-footnotes` / `.org-fnref` | Footnote section + references.               |
| `.org-hr`                  | Horizontal rules.                                 |
| `.org-drawer` / `.org-dynamic-block` | Drawers / dynamic blocks.               |
| headline meta              | `.org-todo` / `.org-done` / `.org-priority` / `.org-tag` / `.org-timestamp`. |

## 5. Components

A book declares a component map (`name → import source`). When a document uses a
component (`#+BEGIN_COMPONENT` / a shortcode), the engine emits a
`data-component` placeholder; on the Vue path those become imported
`<Component v-bind>` calls resolved through the map. The engine **only emits
placeholders** — the host app wires the runtime and the look ([D-22]).

## 6. Referencing CSS / JS / fonts / assets

- **CSS** — `tokens` + `styles` are read and inlined. To reference an external
  sheet instead of inlining, pass `--link-css <href>` at build time.
- **JS** — `scripts` are emitted as `<script src defer>` before `</body>`.
  The engine never runs them.
- **Fonts** — declare `@font-face`/`<link>` in your template, or set the font
  tokens and let the host page load the font.
- **Assets** — list favicon/manifest/etc. under `assets` and ship them with the
  book directory.

## 7. Publishing: dir / npm / URL

`--style-book` accepts three reference forms:

- **Local directory or path** — `--style-book ./my-book` (or a direct
  `stylebook.json` path).
- **npm package** — `--style-book @scope/book`; the engine reads
  `node_modules/@scope/book/stylebook.json` (files are read, never imported).
- **Remote URL** — `--style-book https://cdn.example/book/` (fetched, then
  content-hash cached under the OS temp dir). Opt-in; pin for reproducible
  builds.

Set `engineCompat` so a consumer on a different engine major gets a warning.

## 8. Validating and golden-testing a book

`resolveStyleBook` validates on load and prints warnings to stderr:

- `engineCompat` major mismatch,
- a `tokens`/`styles`/`template` file that cannot be read,
- **undeclared construct coverage** — every `KNOWN_CONSTRUCTS` hook not present
  in `constructs` is listed.

A missing/unreachable book is a hard error. To golden-test a book, render a
fixture that exercises every construct and snapshot the result (see
`tests/golden.test.ts` for the pattern).

## 9. Overriding without a full book (BYO)

You do not need a whole book to restyle. Smallest-blast-radius first:

1. **Re-skin tokens** — `--css-var "--host-signal-500=#0aa"` (repeatable) and
   `--font "Inter, sans-serif"`. O2H structure intact.
2. **Bring your own CSS** — `--css <file>` (replace the default) or
   `--css-append <file>` (keep O2H, layer on top), or `--link-css <href>`
   (reference an external sheet).
3. **Ship zero engine CSS** — `--no-default-styles` emits only the semantic
   `.org-*` hooks; pair with `--link-css` for a fully host-owned look.
4. **Full swap** — author a book (§2–§7) and pass `--style-book`.
5. **Re-namespace** — `--class-prefix mysite-` renames every hook when `org-`
   would clash with the host.

Granular flags **override** an active `--style-book`, so you can swap a book and
still tweak one token or stylesheet on top.
