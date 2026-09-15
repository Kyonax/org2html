# templates/style-book — the engine's Style Books

The in-repo home of org2html's **styling**. Two books live here and both are complete:

| Book | Files | Status |
|---|---|---|
| **`kwo`** — kyo-web-online | `kwo-tokens.css` + `kwo.css` | **the DEFAULT since v1.1.0** |
| **`o2h`** — the original | `o2h-tokens.css` + [`o2h/`](o2h/) | preserved, selectable via `--style-book` |

A book is a **value layer plus a small construct delta**, never a second copy of the engine's CSS.
Both books share one per-construct implementation (`../styles.css`), which reads `--o2h-*` and
nothing else — so swapping the look is swapping the values. That is the whole point of the
`--o2h-*` / `--host-*` indirection (`[D-08]` / `[D-29]`).

> The `--o2h-` prefix is the ENGINE's token namespace, named after the first book that filled it.
> It is not a claim about which book is loaded.

```bash
# the default (kwo) — nothing to pass
org2html build src/ -o out

# the original O2H look
org2html build src/ -o out --style-book node_modules/@kyonax/org2html/templates/style-book/o2h
```

The numbered O2H matrix below still governs the **hooks**: which `.org-*` class renders which Org
construct is a property of the engine, not of a book. Only the values changed.

## Files

| File | What it is | Use it for |
|---|---|---|
| **`org-style-book-matrix.md`** | **Start here.** The Org ⇄ O2H coverage matrix — every match has a stable id (`TOK-`/`MAP-`/`CMP-`/`DEC-`/`CHR-`/`LAY-`/`ANM-`). 142/142 O2H objects owned. | Looking up which `.org-*` hook / token / component renders a given O2H object — and vice versa. |
| **`reference.html`** | **The living class/component reference.** A hand-authored (not org-converted) catalog: every token, construct, component, decoration, chrome part and interactive behaviour rendered live and labelled with its **name / CSS selector**. Loads the hosted `/styles.css` + `/o2h.js`. | Looking up a class/selector to use in a project; refining a look and seeing it immediately. Serve the build output and open `/reference.html`. |
| **`o2h.js`** *(ships at `templates/o2h.js`)* | The default interactive runtime — dependency-free vanilla JS wiring copy / lightbox / carousel / tabs / modal / toast / toggle / back-to-top / read-progress onto the static hooks. Referenced by default (`--no-scripts` opts out); never engine-run (`[D-28]`). | Interactivity for the shipped components, no framework. |
| **`kwo-tokens.css`** | **The DEFAULT `--o2h-*` token layer** — kyo-web-online values (OKLCH palette, 8×3 type scale, Geomanist + SpaceMono, 68ch measure). Every value is `var(--host-*, <kwo>)`. | The default styling properties. |
| **`kwo.css`** | The default book's construct delta: webfont registrations, `.kyo-prose` tracking, the `.doc-block__title` rule-line, SpaceMono emphasis + links, and the `[data-theme="light"]` inverse. | The four things a token layer cannot carry. |
| **`o2h/`** | The preserved original book (manifest + README). Pairs `o2h-tokens.css` with the same shared `../styles.css`. | `--style-book …/style-book/o2h` restores the pre-1.1.0 look exactly. |
| **`o2h-tokens.css`** | The O2H `--o2h-*` token layer (paper/ink/Signal Orange), unchanged. | The `o2h` book's values. |
| `design-system-guide.md` | The written design spec (five laws, foundations, components, layouts, recipes), verbatim from hand-off. | Briefing a person/agent on the *why* and the rules. |
| `o2h-style-book.html` | The rendered source of truth (626 KB standalone bundle, md5 `3291e058`). | Reading the real markup / exact inline styles in context. |
| `audit-1-org-syntax.md` | Exhaustive Org→HTML construct registry (`ORG-001…076`) + per-construct engine support. | The full anatomy behind every `MAP-`/`CMP-` row. |
| `audit-2-style-book.md` | Exhaustive O2H visual registry (`SB-001…142`) + anatomy + discrepancies. | The full anatomy behind every O2H id. |

## Fonts and licensing

The `kwo` book registers **Geomanist** and **SpaceMono** via `@font-face` pointing at
`/fonts/*.woff2`. Subset copies live in `templates/fonts/` for in-repo builds and the
showcase.

**They are deliberately excluded from the npm tarball** (`package.json` → `files`).
org2html does not redistribute either face: their licensing is the consuming project's
call, not this package's. Nothing breaks without them — every family in
`kwo-tokens.css` declares a full system fallback and `font-display: swap` keeps text
painted, so a published install renders correctly in the fallback stack.

To get the exact design in your own build, drop the four WOFF2 files into your output's
`fonts/` directory (or point `--host-font-editorial` / `--host-font-mono` at faces you
do license):

```
<output>/fonts/GeomanistRegular.woff2
<output>/fonts/GeomanistBold.woff2
<output>/fonts/SpaceMonoNerdFont-Regular.woff2
<output>/fonts/SpaceMonoNerdFont-Bold.woff2
```

The `o2h` book names Space Grotesk / Inter / JetBrains Mono in its token layer and ships
no font files either.

## Provenance

Built 2026-06-28 from a dual audit (full Org syntax surface × full O2H registry). The HTML is
byte-identical to the delivered style book and is mirrored in the brain at
`Styling Org-2-Html — O2H` (`id:9aa7e7f9-6b67-4e99-a7f9-db336a6eef06`); the implementation plan is
`Plan Org-2-Html — Engine` (Phase 3·INT consumes this matrix).

## Status

Whichever book is active is the **default** only. A host overrides any `--o2h-*` token (define
`--host-*`), swaps `--template-dir`, passes `--style-book`, or sets `styleMode:'replace'` /
`injectDefaultStyles:false` to replace it wholesale (`[D-08]`/`[D-10]`/`[R-11]`). The per-construct
rules that consume these tokens live in `templates/styles.css` and are shared by both books.

### Authoring a book

A manifest may name **one** stylesheet or several, concatenated in cascade order — which is how a
book reuses the shared construct sheet and layers only its own delta:

```json
{
  "name": "mybook",
  "themeColor": "#f9cd26",
  "tokens": "mybook-tokens.css",
  "styles": ["../styles.css", "mybook.css"]
}
```

`themeColor` feeds `<meta name="theme-color">`, so swapping the look also swaps the browser chrome
instead of leaving the previous brand's colour in the address bar. A document's `#+THEME_COLOR`
still wins over both.
