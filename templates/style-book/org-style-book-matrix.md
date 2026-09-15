# Org ⇄ O2H Coverage Matrix — `@kyonax/org2html`

**The single source of truth that ties every Org-mode construct to its O2H visual.**
Built 2026-06-28 from a dual audit: the full Org→HTML construct surface (`ORG-001…076`) and the full
O2H visual registry (`SB-001…142`, from `o2h-style-book.html` md5 `3291e058`, verified byte-identical).

> **Why this file exists.** It guarantees that **every** O2H object — token, decoration, component,
> layout, animation, state — has a counterpart that can be authored in a `.org` file (natively, via a
> component plugin, or via theme/template chrome). Each match has a **stable number**. Future styling work
> never re-derives the mapping: it references the number. Change a look by editing the `--o2h-*` token
> (`o2h-tokens.css`) or the `.org-*` rule keyed by these ids — the parser, the CSS, and the component
> plugins all read the **same hook name written once here** (the `[D-16]` no-drift rule).

## How to reference

| Prefix | Registry | What it identifies | Reference like |
|---|---|---|---|
| `TOK-` | A. Tokens | a default styling property (`--o2h-*`) | "set TOK-001 to the host palette" |
| `MAP-` | B. Native constructs | an Org construct that renders O2H **natively** | "MAP-042 emits `.org-table`" |
| `CMP-` | C. Component plugins | a O2H object with **no** native Org form (authored via `#+BEGIN_COMPONENT` / `{{< … >}}`) | "CMP-009 = diagrams" |
| `DEC-` | D. Decorations | one of the 18 O2H marks + where it attaches | "add DEC-003 to MAP-002" |
| `CHR-` / `LAY-` | E. Chrome & layouts | page/template-level structure (not authored inline) | "LAY-006 = single-article template" |
| `ANM-` | F. Animations | a `@keyframes` (reduced-motion gated) | "ANM-005 = shimmer" |

**Source registries (full anatomy/values):** `audit-1-org-syntax.md` (Org) and `audit-2-style-book.md` (O2H),
preserved in the brain styling node assets. **Default values:** `o2h-tokens.css`. **Rendered truth:** `o2h-style-book.html`.

---

## Registry A — TOKENS (default styling properties)

The `--o2h-*` layer. Defined in `o2h-tokens.css` with `var(--host-*, <o2h>)` fallbacks so a host
overrides any token (`[D-08]`/`[R-11]`). Implemented as defaults in Plan **Phase 3** (token indirection).

| ID | Token group | `--o2h-*` | O2H | Default(s) |
|---|---|---|---|---|
| TOK-001 | Signal Orange scale | `--o2h-signal-50…700` | SB-015 | `#FFEDE6 #FFD2C0 #FF8B5C #FF5114 #E8410A #BC3406` |
| TOK-002 | Paper & Ink neutrals | `--o2h-paper/card/line/line-soft/mute/slate/ink` | SB-016 | `#E9E9E6 #FFFFFF #C9C9C4 #EFEFEA #7A7A76 #3A3A37 #0B0B0B` |
| TOK-003 | Functional / status | `--o2h-go/hold/stop` | SB-017 | `#2E9E5B #D9A300 #D23B2B` |
| TOK-004 | Font families | `--o2h-font-display/editorial/mono` | SB-019 | Chakra Petch / Archivo / JetBrains Mono |
| TOK-005 | Type scale (1.25) | `--o2h-fs-display…caption` + `--o2h-lh-body` `--o2h-measure` | SB-020 | 72/48/36/24/16/12px · 1.65 · 70ch |
| TOK-006 | Mono label primitive | `--o2h-label-size/track/transform` | SB-021 | 11px · .14em · uppercase |
| TOK-007 | Spacing scale (4px) | `--o2h-space-1…6` | SB-023 | 4·8·16·24·44·64 |
| TOK-008 | Radius (sharp) | `--o2h-radius` `--o2h-radius-full` | SB-024 | 0 (dots/avatars 50%) |
| TOK-009 | Borders + hairline seam | `--o2h-border/-emphasis/-dashed/--o2h-seam-gap` | SB-025/026 | 1px line / 1px ink / 1px dashed / gap 1px |
| TOK-010 | O2H grid field | `--o2h-grid-module/-line` | SB-006/033 | 44px · rgba(11,11,11,.035) |
| TOK-011 | Shiki "o2h" syntax + inline code | `--o2h-syn-*` `--o2h-code-*` | SB-073/074 | kw `#FF8B5C` plain `#EDEDEA` punct `#7A7A74` comment `#6E6E68` str `#C7C7C2` on `#0B0B0B`; inline `#F0EFEB`/`#D7D7D3`/`#BC3406` |
| TOK-012 | Document chrome defaults | `--o2h-selection-*` `--o2h-theme-color` | SB-007 | selection `#FF5114`/white · theme-color `#FF5114` |
| TOK-013 | Semantic aliases | `--o2h-bg/fg/surface/accent/accent-fg/link` | (derived) | paper/ink/card/signal-500/ink/signal-700 |

---

## Registry B — NATIVE constructs (write Org, get O2H)

Each row locks the **stable `.org-*` hook** emitted by the parser/renderer and styled by the default CSS.
"Org src" cites the audit-1 id(s). "Deco/Tok" cite the marks/tokens applied. "Phase" ties to the plan.

| ID | `.org-*` hook → element | Org src | O2H | Deco / Tok | Phase |
|---|---|---|---|---|---|
| MAP-001 | `.org-root` → `<article>` | document | SB-006 field | DEC-007, TOK-010, DEC-001 ambient | 3 |
| MAP-002 | `.org-heading.outline-N` → `<h1>`–`<h6>` (+ mono section-ref) | ORG-001 | SB-008; H1⇐`#+TITLE` = SB-012 | DEC-003 (H1 only), TOK-004/005 | 1A·3 |
| MAP-003 | `.org-article-header` → header block | ORG-054 (`#+TITLE/#+SUBTITLE/#+AUTHOR/#+DATE`) | SB-106 | TOK-004/005/006 | 2·3 |
| MAP-004 | `.org-paragraph` → `<p>` | ORG-024 | (body type) | TOK-005/013 | 3 |
| MAP-005 | `.org-bold` → `<strong>` | ORG-026 | (emphasis) | TOK-013 | 0·3 |
| MAP-006 | `.org-italic` → `<em>` | ORG-027 | (emphasis) | — | 0·3 |
| MAP-007 | `.org-underline` → `<u>` | ORG-028 | orange underline | `--o2h-signal-700` | 0·3 |
| MAP-008 | `.org-strike` → `<del>` | ORG-029 | mute | `--o2h-mute` | 0·3 |
| MAP-009 | `.org-verbatim` → `<code>` | ORG-030 | SB-039 coordinate tag | DEC-013 | 3 |
| MAP-010 | `.org-code` → `<code>` | ORG-031 | SB-074 inline code | TOK-011 | 3 |
| MAP-011 | `.org-subscript` → `<sub>` | ORG-032 | baseline (no deco) | — | 1B |
| MAP-012 | `.org-superscript` → `<sup>` | ORG-033 | baseline (no deco) | — | 1B |
| MAP-013 | `<br>` line break | ORG-034 | — | — | 0 |
| MAP-014 | `.org-link` → `<a>` (bracket/plain/angle/internal/radio) | ORG-035–039 | orange link + `↗` external; SB-107 TOC-active | `--o2h-link`, DEC | 1B·3 |
| MAP-015 | `.org-figure`/`.org-figcaption` → `<figure>` | ORG-040, ORG-061, ORG-062 | SB-109/134/135/136 | DEC-002 crop, DEC-006 bracket-frame, DEC-008 hatch | 1B·3 |
| MAP-016 | `.org-fnref` / `.org-footnotes` | ORG-041, ORG-011 | coordinate-tag refs | DEC-013 | 1B |
| MAP-017 | `.org-cite` → `<span>` | ORG-042 | SB-039 (orange) | DEC-013 | 1B |
| MAP-018 | `.org-timestamp` → `<span>` | ORG-050 | SB-039 (mono, mute) | DEC-013 | 1B |
| MAP-019 | `.org-math` (inline) / `.org-math-display` | ORG-051, ORG-020 | host KaTeX/MathJax or mono ink (never orange) | TOK-004 mono | 1B |
| MAP-020 | entities / special symbols → inline text | ORG-052 | — | — | 1B |
| MAP-021 | `.org-statistics-cookie` → `<span>` | ORG-049 | SB-043 index counter; → SB-124 progress | DEC-017 | 1C |
| MAP-022 | `.org-inline-src` → `<code>` | ORG-043 | SB-074 inline-code skin | TOK-011 | 1B |
| MAP-023 | export snippet `@@html:…@@` → raw passthrough | ORG-045 | (no hook) | — | 1B |
| MAP-024 | macro `{{{…}}}` → expanded inline | ORG-046 | (no hook) | — | 1C |
| MAP-025 | `.org-target` → `<span id>` (target/radio) | ORG-047, ORG-048 | (anchor) | — | 1B |
| MAP-026 | `.org-ul` / `.org-ol` → `<ul>`/`<ol>` | ORG-004, ORG-005 | list styling | TOK-007 | 1A·3 |
| MAP-027 | `.org-dl` → `<dl><dt><dd>` (descriptive) | ORG-005 | — | TOK-006 | 1A·3 |
| MAP-028 | `.org-li--checkbox` → `<li>` | ORG-005 | SB-095 square orange `✓` | `--o2h-signal-500` | 1A·3 |
| MAP-029 | counter `[@n]` → `<li value>` | ORG-005 | — | — | 1A |
| MAP-030 | `.org-quote` → `<blockquote>` | ORG-006 | SB-057 note default; SB-108 pull-quote variant | DEC-003 (pull-quote) | 3 |
| MAP-031 | `.org-verse` → `<pre>` (line-break-safe) | ORG-007 | — | TOK-004 | 1A·3 |
| MAP-032 | `.org-center` → `<div>` | ORG-008 | — | — | 3 |
| MAP-033 | `.org-example` → `<pre>` (literal) | ORG-014 | bordered mono | TOK-009/011 | 1A·3 |
| MAP-034 | `.org-example` ← fixed-width `: text` | ORG-018 | (as MAP-033) | — | 1A·3 |
| MAP-035 | `.org-callout--{note,tip,warning,danger,important,abstract}` → `<div>` | ORG-009 | SB-057/058/059/060 | TOK-003 | 1A·3 |
| MAP-036 | `pre.org-src` + header bar | ORG-013 | SB-068 block · SB-069 lights (CHR-009) · SB-070 filename/lang · SB-071 copy · SB-072 gutter | TOK-011 | 3 |
| MAP-037 | `pre.org-src.org-diff` | ORG-013 (`diff`) | SB-079 | TOK-003 | 3 |
| MAP-038 | `.org-results` → output block | ORG-064, ORG-013 (`:results`) | SB-076 green left-border | `--o2h-go` | 1C·3 |
| MAP-039 | export block `#+BEGIN_EXPORT html` → raw passthrough | ORG-015 | — | — | 1A |
| MAP-040 | comments (`#`/`#+BEGIN_COMMENT`) → dropped | ORG-016, ORG-017 | — | — | 0·1A |
| MAP-041 | `.org-hr` → `<hr>` | ORG-019 | SB-038 rule variants; SB-031 boxed-X divider | DEC-012, DEC-005 | 1A·3 |
| MAP-042 | `.org-table` → `<table>` (thead/th-scope/tbody/caption/colgroup) | ORG-012, ORG-053, ORG-071–075 | SB-066 spec table; SB-081 API/props variant | TOK-002/009 | 0·3 |
| MAP-043 | `<caption>` | ORG-061 | (table caption) | — | 1A |
| MAP-044 | `.org-drawer` → `<div>` (bordered + mono header) | ORG-066 | — | TOK-009 | 1A·3 |
| MAP-045 | property drawer → optional `.org-properties` table | ORG-067, ORG-023 | — | — | 1C |
| MAP-046 | `.org-drawer` `:LOGBOOK:` → `<details>` accordion | ORG-068 | SB-103 accordion (shares CMP-022) | DEC | 1C·6 |
| MAP-047 | headline metadata (TODO/priority/tags/cookies/timestamps) | ORG-001 | SB-055 status badge · SB-054 tag chip · SB-056 meta/clearance · SB-043 cookie | DEC-018, DEC-017 | 1A·3 |
| MAP-048 | `nav.org-toc` (sticky rail, active orange left-border) | ORG-055 (`toc:`) | SB-107 | `--o2h-signal-500` | 3·4 |
| MAP-049 | `.org-planning` → `<p>` (SCHEDULED/DEADLINE/CLOSED) | ORG-069 | coordinate tags | DEC-013 | 1C |
| MAP-050 | clock entries → logbook | ORG-070 | — | — | 1C |
| MAP-051 | `.org-inlinetask` → `<div>` | ORG-003 | (boxed callout) | DEC-003 | 1A |
| MAP-052 | `.org-section` → `<section>` | ORG-002 | — | — | 1A |

---

## Registry C — COMPONENT plugins (no native Org form)

Authored as a **block** `#+BEGIN_COMPONENT <Name> :prop val` … `#+END_COMPONENT` or **inline**
`{{< Name prop="val" >}}` (ORG-076), emitting `<… data-component="name" data-props="{…}">` (sanitizer already
whitelists `data-component`/`data-props`/`data-src`). The host supplies the runtime; the **default look** is the
named O2H object. Built in Plan **Phase 5** (plugin API) + **Phase 6** (the components) + **Phase 7** (hydration).

| ID | `data-component` (+variants) | O2H | Notes |
|---|---|---|---|
| CMP-001 | `button` · variant=primary/outline/ink/ghost/bracketed/icon · size=sm/md/lg · state=disabled/loading | SB-046–053 | one primary per view (Law 1) |
| CMP-002 | `card` · variant=blog/project/feature/compact | SB-062–065 | hover `border-color:ink` |
| CMP-003 | `stat-grid` | SB-067 (+SB-063 inner) | display numerals + orange unit + mono label |
| CMP-004 | `callout` variant=restricted (`#+BEGIN_RESTRICTED`) | SB-061 | inverted + orange brackets; pair w/ CMP-001 |
| CMP-005 | `kbd` (`{{< kbd >}}`) | SB-075 | 3px bottom border |
| CMP-006 | `command` (copyable) | SB-077 | orange `$` + copy |
| CMP-007 | `terminal` | SB-078 | prompt + blinking cursor (ANM-001) |
| CMP-008 | `file-tree` | SB-080 | orange folders, mono connectors |
| CMP-009 | `diagram` · type=architecture/flowchart/uml/sequence/er/schematic/pipeline | SB-082–088 | carries `data-om-raster` (CHR-007) |
| CMP-010 | `input` | SB-090 | focus → orange border |
| CMP-011 | `search` | SB-091 | icon + borderless input |
| CMP-012 | `input` state=error | SB-092 | red border + `#FCEEEC` |
| CMP-013 | `select` | SB-093 | custom `▾` |
| CMP-014 | `textarea` | SB-094 | resize-vertical |
| CMP-015 | `toggle` | SB-096 | square knob |
| CMP-016 | `tabs` (filter) | SB-097 | active = ink fill |
| CMP-017 | `newsletter` | SB-098 | dark band, underline email |
| CMP-018 | `modal` | SB-099 | orange registration brackets, ANM-004 |
| CMP-019 | `modal` variant=alert | SB-100 | red title + red primary |
| CMP-020 | `toast` | SB-101 | bottom-right, ANM-003, auto-dismiss |
| CMP-021 | `tooltip` (inline) | SB-102 | dashed underline trigger |
| CMP-022 | `accordion` | SB-103 | `+`→`×`, animated max-height; also MAP-046 |
| CMP-023 | `pagination` | SB-110 | hairline-seam mono buttons |
| CMP-024 | `skeleton` variant=card/list/scanline | SB-119–121 | ANM-005 / ANM-002 |
| CMP-025 | `spinner` variant=square/dots | SB-122/123 | ANM-006 / ANM-008 |
| CMP-026 | `progress` variant=determinate/indeterminate | SB-124/125 | ANM-007 (indet) |
| CMP-027 | `empty` | SB-126 | bordered glyph + action |
| CMP-028 | `error` code=404 | SB-127 | inverted + big orange numeral |
| CMP-029 | `error` variant=offline | SB-128 | red pulse (ANM-008) |
| CMP-030 | `avatar-group` | SB-130 | overlapped + `+N` orange |
| CMP-031 | `badge` (notification) | SB-131 | orange count bubble |
| CMP-032 | `back-to-top` (FAB) | SB-132 | 44px hit target |
| CMP-033 | `read-progress` (ring) | SB-133 | clip-path arc |
| CMP-034 | `gallery` | SB-137 | tiles → lightbox |
| CMP-035 | `carousel` | SB-138 | translateX track, dot nav, thumb rail |
| CMP-036 | `lightbox` | SB-139 | auto on figure click; zoom toggle; ANM-004 |
| CMP-037 | `reticle` (target) | SB-030 | focus marker (also DEC-004) |
| CMP-038 | `connector` | SB-042 | diagram leader primitive (also DEC-016) |

---

## Registry D — DECORATIONS (the 18 marks + attach points)

The "add decorations" surface. Each is pure CSS (pseudo-elements / gradients), ≤ 2 per surface (Law 5),
gated by `prefers-reduced-motion` where animated. "Attaches to" = the hook(s) that wear it by default.

| ID | Decoration | O2H | Mechanism | Attaches to (default) |
|---|---|---|---|---|
| DEC-001 | Crosshair node | SB-027 | mono `+` glyphs, grey ambient / orange focal | `.org-root` corners (MAP-001) |
| DEC-002 | Crop marks | SB-028 | 8 corner L spans / `::before`+`::after` | `.org-figure` (MAP-015) |
| DEC-003 | Registration brackets | SB-029 | 4 orange corner bars, offset -3px | `.org-heading--title` (H1, MAP-002); pull-quote (MAP-030) |
| DEC-004 | Target reticle | SB-030 | circle + cross + orange dot | carousel center (CMP-037) |
| DEC-005 | Boxed X | SB-031 | 46×46 ink-border box + `×` | `.org-hr` variant (MAP-041); dismiss affordance |
| DEC-006 | Bracket frame | SB-032 | side rails + caps + `[ FIG.0x ]` | `.org-figure` label (MAP-015) |
| DEC-007 | O2H grid | SB-033/006 | two 1px linear-gradients (TOK-010) | `.org-root` field (MAP-001) |
| DEC-008 | Diagonal hatch | SB-034 | `repeating-linear-gradient(45deg,…)` | image placeholder / redacted (MAP-015) |
| DEC-009 | Dot matrix | SB-035 | `radial-gradient(… 1.4px)` | empty-state / sidebar texture (CMP-027) |
| DEC-010 | Scanline | SB-036 | dark plate + gradient + ANM-002 | loading overlay (CMP-024 scanline) |
| DEC-011 | Barcode strip | SB-037 | `repeating-linear-gradient(90deg,…)` | footer (CHR-004) |
| DEC-012 | Rule variants | SB-038 | dashed / 2px-orange / tick-capped | `.org-hr` (MAP-041) |
| DEC-013 | Coordinate tag | SB-039 | mono outline (`border:1px ink`) / solid (`bg ink`) | `.org-verbatim` (MAP-009), `.org-cite` (MAP-017), `.org-timestamp` (MAP-018), planning (MAP-049) |
| DEC-014 | Vertical label | SB-040 | `writing-mode:vertical-rl;rotate(180deg)` | section rail (CHR, page edge) |
| DEC-015 | Orange ribbon | SB-041 | full-width orange band | banner (CHR-006); cover ribbons SB-009/014 |
| DEC-016 | Connector node | SB-042 | square–line–square–`+` leader | diagram (CMP-038) |
| DEC-017 | Index counter | SB-043 | display `07` + grey `/14` | statistics cookie (MAP-021), pagination (CMP-023) |
| DEC-018 | Status pill | SB-044 | bordered chip + blinking dot (ANM-001) | TODO/status badge (MAP-047) |

---

## Registry E — CHROME & LAYOUTS (template / theme level)

Not authored inline. Controlled by `templates/default.html` + partials, document keywords, and a layout
selector. Built in Plan **Phase 2** (template/SEO) and the **3·BYO** override guide.

| ID | What | O2H | Controlled by |
|---|---|---|---|
| CHR-001 | Page frame / app shell | SB-001/002/004 | `templates/default.html` |
| CHR-002 | Site nav bar + brand glyph (favicon) | SB-104, SB-003 | template partial; favicon = registration/boxed-X (Phase 2) |
| CHR-003 | Breadcrumb | SB-105 | template / `#+` config; current = orange |
| CHR-004 | Footer (columns + bottom bar + masthead) | SB-140/141/142 | template partial; barcode = DEC-011 |
| CHR-005 | Status / serial chrome | SB-005 | template; uses DEC-018 |
| CHR-006 | Cover masthead ribbons + meta | SB-009/010/011/013/014 | landing template; reuses DEC-015/001/013 |
| CHR-007 | `data-om-raster` export attribute | SB-089 | engine export hook on diagrams (CMP-009) |
| CHR-008 | Cookie consent banner | SB-129 | global utility partial |
| CHR-009 | Code header chrome (traffic-light squares) | SB-069 | part of `.org-src` (MAP-036) |
| LAY-001 | Layout 01 · Magazine home | SB-111 | `#+HTML_LAYOUT: magazine` or `--template-dir` |
| LAY-002 | Layout 02 · Archive / index | SB-112 | `#+HTML_LAYOUT: archive` |
| LAY-003 | Layout 03 · Editorial feature | SB-113 | `#+HTML_LAYOUT: editorial` |
| LAY-004 | Layout 04 · Feed / list | SB-114 | `#+HTML_LAYOUT: feed` |
| LAY-005 | Layout 05 · Author profile | SB-115 | `#+HTML_LAYOUT: author` |
| LAY-006 | Layout 06 · Single article | SB-116 | `#+HTML_LAYOUT: article` (default for a post) |
| LAY-007 | Layout 07 · Category landing | SB-117 | `#+HTML_LAYOUT: category` |
| LAY-008 | Layout 08 · Newsletter landing | SB-118 | `#+HTML_LAYOUT: newsletter` |

---

## Registry F — ANIMATIONS (`@keyframes`, all reduced-motion gated)

Ship in the default CSS; **all** wrapped in `@media (prefers-reduced-motion: no-preference)` (Phase 4 — the
style book omits this gate, audit §D-5).

| ID | `@keyframes` | Used by | Status |
|---|---|---|---|
| ANM-001 | `bpblink` | SB-005, SB-044 (DEC-018), SB-053, SB-078 | keep |
| ANM-002 | `bpscan` | SB-036 (DEC-010), SB-121 | keep |
| ANM-003 | `bptoast` | SB-101 (CMP-020) | keep |
| ANM-004 | `bpfade` | SB-099 (CMP-018), SB-139 (CMP-036) | keep |
| ANM-005 | `bpshimmer` | SB-119/120 (CMP-024) | keep |
| ANM-006 | `bpspin` | SB-122 (CMP-025) | keep |
| ANM-007 | `bpindet` | SB-125 (CMP-026) | keep |
| ANM-008 | `bppulse` | SB-123 (CMP-025), SB-128 (CMP-029) | keep |
| ANM-009 | `bpmarq` | — **defined but UNUSED** in the book (audit §D-4) | **DECISION:** drop, or wire to a marquee component |

---

## Coverage ledger — every SB-001…142 is owned

Proof that no O2H object is left without an Org-authorable counterpart. `DOC` = style-book's own
presentation (not part of emitted output; its technique is reused via the cited id).

| BP | Owner | BP | Owner | BP | Owner | BP | Owner |
|---|---|---|---|---|---|---|---|
| 001 | CHR-001 | 037 | DEC-011 | 073 | TOK-011 | 109 | MAP-015 |
| 002 | CHR-001 | 038 | DEC-012 | 074 | MAP-010 | 110 | CMP-023 |
| 003 | CHR-002 | 039 | DEC-013 | 075 | CMP-005 | 111 | LAY-001 |
| 004 | CHR-001 | 040 | DEC-014 | 076 | MAP-038 | 112 | LAY-002 |
| 005 | CHR-005 | 041 | DEC-015 | 077 | CMP-006 | 113 | LAY-003 |
| 006 | DEC-007/TOK-010 | 042 | DEC-016 | 078 | CMP-007 | 114 | LAY-004 |
| 007 | TOK-012 | 043 | DEC-017 | 079 | MAP-037 | 115 | LAY-005 |
| 008 | MAP-002 | 044 | DEC-018 | 080 | CMP-008 | 116 | LAY-006 |
| 009 | CHR-006 (DEC-015) | 045 | DOC | 081 | MAP-042 | 117 | LAY-007 |
| 010 | CHR-006 (DEC-001) | 046 | CMP-001 | 082 | CMP-009 | 118 | LAY-008 |
| 011 | CHR-006 (DEC-013) | 047 | CMP-001 | 083 | CMP-009 | 119 | CMP-024 |
| 012 | MAP-002 (DEC-003) | 048 | CMP-001 | 084 | CMP-009 | 120 | CMP-024 |
| 013 | DOC (MAP-004/027) | 049 | CMP-001 | 085 | CMP-009 | 121 | CMP-024 |
| 014 | CHR-006 (DEC-015) | 050 | CMP-001 | 086 | CMP-009 | 122 | CMP-025 |
| 015 | TOK-001 | 051 | CMP-001 | 087 | CMP-009 | 123 | CMP-025 |
| 016 | TOK-002 | 052 | CMP-001 | 088 | CMP-009 | 124 | CMP-026 (MAP-021) |
| 017 | TOK-003 | 053 | CMP-001 | 089 | CHR-007 | 125 | CMP-026 |
| 018 | DOC (TOK-001 doc) | 054 | MAP-047 | 090 | CMP-010 | 126 | CMP-027 |
| 019 | TOK-004 | 055 | MAP-047 | 091 | CMP-011 | 127 | CMP-028 |
| 020 | TOK-005 | 056 | MAP-047 | 092 | CMP-012 | 128 | CMP-029 |
| 021 | TOK-006 | 057 | MAP-035 | 093 | CMP-013 | 129 | CHR-008 |
| 022 | DOC (TOK-010 demo) | 058 | MAP-035 | 094 | CMP-014 | 130 | CMP-030 |
| 023 | TOK-007 | 059 | MAP-035 | 095 | MAP-028 | 131 | CMP-031 |
| 024 | TOK-008 | 060 | MAP-035 | 096 | CMP-015 | 132 | CMP-032 |
| 025 | TOK-009 | 061 | CMP-004 | 097 | CMP-016 | 133 | CMP-033 |
| 026 | TOK-009 | 062 | CMP-002 | 098 | CMP-017 | 134 | MAP-015 |
| 027 | DEC-001 | 063 | CMP-002/003 | 099 | CMP-018 | 135 | MAP-015 |
| 028 | DEC-002 | 064 | CMP-002 | 100 | CMP-019 | 136 | MAP-015 |
| 029 | DEC-003 | 065 | CMP-002 | 101 | CMP-020 | 137 | CMP-034 |
| 030 | DEC-004 | 066 | MAP-042 | 102 | CMP-021 | 138 | CMP-035 |
| 031 | DEC-005 | 067 | CMP-003 | 103 | CMP-022 (MAP-046) | 139 | CMP-036 |
| 032 | DEC-006 | 068 | MAP-036 | 104 | CHR-002 | 140 | CHR-004 |
| 033 | DEC-007 | 069 | CHR-009 | 105 | CHR-003 | 141 | CHR-004 |
| 034 | DEC-008 | 070 | MAP-036 | 106 | MAP-003 | 142 | CHR-004 |
| 035 | DEC-009 | 071 | MAP-036 | 107 | MAP-048 | | |
| 036 | DEC-010 | 072 | MAP-036 | 108 | MAP-030 | | |

**Result:** 142/142 O2H objects own a counterpart — `TOK ×13`, `DEC ×18`, `MAP` (native), `CMP ×38`,
`CHR ×9`, `LAY ×8`, `ANM ×9`; only `DOC ×4` (SB-013/018/022/045) are style-book documentation with no emitted form
(their techniques are reused via the cited id). **Nothing is left out.**

### Org-side coverage

All 76 Org constructs are accounted for: those that produce a visual map to a `MAP-`/`CMP-` row above; the rest
are non-visual **settings** that drive chrome/behaviour — `ORG-054/058` → CHR/template head, `ORG-055` (OPTIONS)
→ toggles, `ORG-056/057/059` → selection/structure/citation behaviour, `ORG-060/062/063/065` → affiliated
modifiers consumed by their target's MAP row, `ORG-021/044/070/075` → babel/clock/formula (compute, no markup).

---

## Resolved decisions (LOCKED 2026-06-28 — Plan D-17…D-21)

All five locked to option (a):

- **OD-1 → RESOLVED (D-17).** Page layout is chosen by a document keyword `#+HTML_LAYOUT: <name>` (LAY-001…008;
  default `article`). `metadata.ts` parses it; Phase 2 wires selection. A full `--template-dir` still overrides wholesale (`[R-11]`).
- **OD-2 → RESOLVED (D-18).** Drop the unused `bpmarq` (ANM-009): the default CSS ships **8** keyframes, not 9.
- **OD-3 → RESOLVED (D-19).** Components are authored **both** ways — block `#+BEGIN_COMPONENT <Name> :prop val`
  … `#+END_COMPONENT` **and** inline `{{< Name prop="val" >}}` (ORG-076). Both emit `data-component`/`data-props`.
- **OD-4 → RESOLVED (D-20).** Decoration opt-out is **two-level**: global `injectDefaultStyles:false` (emit hooks,
  ship zero engine CSS) **plus** a per-decoration switch `--o2h-deco: none`. Semantic HTML preserved either way.
- **OD-5 → RESOLVED (D-21).** Add native callout aliases `IMPORTANT` → tip · `CAUTION` → warning · `ABSTRACT` → note,
  alongside note/tip/warning/danger (MAP-035). `RESTRICTED` stays a component (CMP-004).
