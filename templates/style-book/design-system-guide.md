# org2html — O2H Style Book

> A futuristic, minimalist **o2h / technical-drawing** design language for editorial blogs.
> Built around one signal colour (orange), pure ink-on-paper neutrals, a faint engineering grid,
> and a kit of registration marks. This document is the operating manual for that system.

> **In-repo note (org2html):** this is the canonical written spec, preserved verbatim from the
> hand-off. The machine-checkable cross-reference between every Org construct and every O2H
> object lives in [`org-style-book-matrix.md`](./org-style-book-matrix.md); the default token layer
> lives in [`o2h-tokens.css`](./o2h-tokens.css); the rendered source of truth is
> [`o2h-style-book.html`](./o2h-style-book.html).

---

## 0. How to use this document

This guide is the written specification for the visual system implemented in:

| File | What it is | Use it for |
|---|---|---|
| `O2H Style Book.dc.html` | The **living style book** — the source of truth. Every token, decoration, component, layout, diagram and state is rendered and (where relevant) interactive. | Reading real markup, copying exact values, seeing components in context. |
| `O2H Style Book.html` | A **standalone, offline** bundle of the same file (fonts + runtime inlined). | Sharing, previewing without the project, no-build handoff. |
| `org2html — Design System Guide.md` | **This file.** Purpose, rules, when/why, snippets, use cases. | Briefing a person or an AI agent to build new screens on-system. |

**Every section below references the matching anchor in `O2H Style Book.dc.html`.** The style book is
organised as a left-rail navigation (`00`–`18`). When this guide says _"see `#cards`"_, it means the
`<section id="cards">` in that file. Open it and read the inline styles — they are the canonical implementation.

### Section map (anchors in the HTML)

| # | Anchor | Topic |
|---|---|---|
| 00 | `#cover` | Masthead / cover |
| 01 | `#color` | Colour palette |
| 02 | `#type` | Typography |
| 03 | `#grid` | Grid & layout |
| 04 | `#deco` | Decorations (16 motifs) |
| 05 | `#buttons` | Buttons |
| 06 | `#tags` | Tags & badges |
| 07 | `#callouts` | Callouts & notices |
| 08 | `#cards` | Cards |
| 09 | `#data` | Data & tables |
| 10 | `#code` | Code & technical content |
| 11 | `#arch` | Architecture & diagrams |
| 12 | `#forms` | Forms & inputs |
| 13 | `#overlays` | Overlays (modal, toast, tooltip, accordion) |
| 14 | `#blog` | Blog patterns (nav, article, pagination) |
| 15 | `#layouts` | Full blog page layouts (8 templates) |
| 16 | `#states` | States & loading |
| 17 | `#media` | Media & carousels + lightbox |
| 18 | `#footer` | Footer |

---

## 1. Design philosophy — the five laws

Apply these before reaching for any component. They are what make output read as *org2html* rather than generic.

1. **Orange is a signal, not a surface.** It marks exactly one primary action per view, active states, and
   registration ticks. Never flood it across large areas or body copy.
2. **Ink carries, paper holds.** Pure black `#0B0B0B` does all reading copy and structural rules. The warm grey
   paper `#E9E9E6` is the canvas; white cards float on it. Saturation stays at ~0 everywhere except the orange.
3. **Everything sits on the grid.** A 44px module and a faint two-axis grid underlie every page. Align content,
   rules and marks to it. Use crosshair `+` marks at major intersections.
4. **Sharp by default.** `border-radius: 0`. Corners are softened only with *bracket decorations*, never radii.
   (The single exception: status dots and avatars may be circular.)
5. **One or two decorations per surface.** Marks are quiet structure, not art. Corner brackets + a serial label
   reads as intentional; five overlapping motifs reads as noise.

**AI-slop to avoid:** gradient backgrounds (except the deliberate skeleton shimmer), emoji as UI, soft drop
shadows everywhere, rounded "pill cards with a left accent border", Inter/Roboto. This system is hard-edged,
monospaced-labelled, and technical.

---

## 2. Foundations

### 2.1 Colour tokens — see `#color`

All swatches in the style book are click-to-copy. Use these exact hex values.

#### Signal Orange (primary) — use sparingly
| Token | Hex | Role / when to use |
|---|---|---|
| `signal-50` | `#FFEDE6` | Tint wash — hover background on light surfaces, soft callout fills. |
| `signal-100` | `#FFD2C0` | Hover/active background, borders on tip callouts. |
| `signal-300` | `#FF8B5C` | Illustration & code-syntax accents on dark backgrounds. |
| **`signal-500`** | **`#FF5114`** | **THE primary.** CTAs, active nav, registration marks, focal accents. |
| `signal-600` | `#E8410A` | Hover / active state of a primary button (text flips to white). |
| `signal-700` | `#BC3406` | Pressed state; orange text on light backgrounds (e.g. inline code). |

#### Paper & Ink (neutrals) — the workhorses
| Token | Hex | Role |
|---|---|---|
| `paper` | `#E9E9E6` | Page canvas / app background. The base everything floats on. |
| `card` | `#FFFFFF` | Surfaces: cards, inputs, modals, table bodies. |
| `line` | `#C9C9C4` | Borders & 1px structural rules (also used as grid-gap fill colour). |
| `line-soft` | `#EFEFEA` | Internal dividers inside a white card. |
| `mute` | `#7A7A76` | Mono meta text, captions, secondary labels. |
| `slate` | `#3A3A37` | Secondary fills (e.g. a second avatar). |
| `ink` | `#0B0B0B` | Text, primary fills, dark blocks, rules. |

#### Functional / status
| Token | Hex | Role |
|---|---|---|
| `go` | `#2E9E5B` | Success, published, online. |
| `hold` | `#D9A300` | Warning, draft, caution. |
| `stop` | `#D23B2B` | Error, danger, destructive, offline. |

**Rules:** (1) one primary orange action per view; (2) never grey for primary reading copy — use ink;
(3) keep all non-orange saturation near zero. If you need a new tint, derive it in `oklch` from the existing
hue — do not introduce a second saturated colour.

### 2.2 Typography — see `#type`

Three families, each with a strict job. Loaded via Google Fonts.

| Family | Stack | Job | Rules |
|---|---|---|---|
| **Display** | `'Chakra Petch', sans-serif` | Big squared/techno headers, hero titles, masthead, large numerals. | **Uppercase only.** Weights 600–700. |
| **Editorial** | `'Archivo', sans-serif` | Article titles, card titles, running body copy, deck headings. | Weights 400–900. Tight tracking on large sizes (`letter-spacing:-.02em`). |
| **Technical** | `'JetBrains Mono', monospace` | All labels, captions, tags, metadata, coordinates, serials, code. | **Uppercase + wide tracking** (`letter-spacing:.1em–.16em`) for labels. |

**Type scale (ratio 1.25):** Display 72 · H1 48 · H2 36 · H3 24 · Body 16 · Caption 12. Never go below 12px.
Hero/display titles use `clamp()` for fluid scaling (e.g. `clamp(54px,9vw,128px)`).

**The label pattern** (used everywhere — section headers, captions, tags):
```html
<span style="font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#7A7A76">FUNDS RAISED</span>
```

### 2.3 Grid, spacing, borders — see `#grid`

- **Spacing scale (4px base):** 4 · 8 · 16 · 24 · 44 · 64. Every gutter/pad/gap is a multiple of 4. The 44px
  module aligns content to the background grid.
- **The o2h grid background** (apply to a page/section, not small elements):
  ```html
  style="background-color:#E9E9E6;
         background-image:linear-gradient(rgba(11,11,11,.035) 1px,transparent 1px),
                          linear-gradient(90deg,rgba(11,11,11,.035) 1px,transparent 1px);
         background-size:44px 44px"
  ```
- **Hairline seams:** to draw 1px lines *between* grid/flex cells, give the container `background:#C9C9C4` and
  `gap:1px`, then make each cell `background:#fff`. The gap shows through as a rule. This is the dominant
  card-grid technique in the system.
- **Radius:** `0`. **Borders:** `1px solid #C9C9C4` (structural) or `1px solid #0B0B0B` (emphasised).
- **Density:** information-dense but breathable — tight mono labels paired with generous whitespace around
  display type.

---

## 3. Decorations — see `#deco`

The soul of the system. Sixteen marks, grouped. **Use one or two per surface.** Each is pure HTML/CSS (no SVG).

> **Audit correction (org2html):** the style book actually renders **18** decoration cards (6 + 6 + 6), even
> though the cover and the `#deco` header both label it "16 MOTIFS". The matrix tracks all 18 (DEC-001…DEC-018).

### Group A — Frame marks
| Mark | What / when to use | Minimal snippet |
|---|---|---|
| **Crosshair node** | Mark grid intersections & page edges. Grey for ambient, orange for emphasis. | `<span style="font-family:'JetBrains Mono';font-size:22px;color:#C2C2BD">+</span>` |
| **Crop marks** | Thin black L's at the 4 corners of a box. Frame imagery, thumbnails, pull-quotes. | 8 absolutely-positioned spans (2 per corner, 18×2px black). See `#deco`. |
| **Registration brackets** | Bold orange corners. Reserve for the hero title and the single focal element. | 8 spans, 24×5px `#FF5114`, offset `-3px`. |
| **Target reticle** | A focus point — carousel centre, "you are here". | Circle `border:1.5px solid #0B0B0B` + crosshair lines + orange dot. |
| **Boxed X** | Section divider / "void" marker; doubles as dismiss. | `<div style="width:46px;height:46px;border:1.5px solid #0B0B0B;display:flex;align-items:center;justify-content:center">×</div>` |
| **Bracket frame** | Enclose a figure/stat. Square-bracket ends read as "measured". | Vertical bars + short caps + `[ FIG.01 ]` label. |

**Reusable 4-corner bracket** (drop into any `position:relative` box; orange = focal, black = neutral):
```html
<span style="position:absolute;left:-2px;top:-2px;width:22px;height:5px;background:#FF5114"></span>
<span style="position:absolute;left:-2px;top:-2px;width:5px;height:22px;background:#FF5114"></span>
<span style="position:absolute;right:-2px;bottom:-2px;width:22px;height:5px;background:#FF5114"></span>
<span style="position:absolute;right:-2px;bottom:-2px;width:5px;height:22px;background:#FF5114"></span>
```

### Group B — Field & texture
| Mark | When to use | Technique |
|---|---|---|
| **O2H grid** | The base page field. | Two 1px linear-gradients (see §2.3). Keep opacity low. |
| **Diagonal hatch** | Image placeholder & "redacted" fill. | `repeating-linear-gradient(45deg,#0b0b0b0d,#0b0b0b0d 1px,transparent 1px,transparent 9px)` |
| **Dot matrix** | Soft texture for empty states & sidebars. | `radial-gradient(#0b0b0b33 1.4px,transparent 1.4px); background-size:12px 12px` |
| **Scanline** | Animated "processing/loading" overlay. Use sparingly. | Dark block + `repeating-linear-gradient` + `@keyframes bpscan`. |
| **Barcode strip** | Footer / serial decoration. | `repeating-linear-gradient(90deg, ...)` of black bars. |
| **Rule variants** | Section dividers. | Dashed, 2px-orange weight, or tick-capped (orange squares at ends). |

### Group C — Labels & nodes
| Mark | When to use |
|---|---|
| **Coordinate tag** | Tiny mono labels: serials, coordinates, figure refs. Outline (`border:1px solid #0B0B0B`) or solid (`background:#0B0B0B;color:#fff`). |
| **Vertical label** | Rotated rail text on a page edge — names a section like a binder spine. `writing-mode:vertical-rl;transform:rotate(180deg)`. |
| **Orange ribbon** | Full-width banner at page top/bottom — announcements & taglines. |
| **Connector node** | Schematic line linking points — annotate diagrams & step flows. |
| **Index counter** | Big "current / total" numerals (`07/14`) — project counts, pagination, progress. Display font. |
| **Status pill** | Blinking dot + label (`@keyframes bpblink`). System status, draft/published, presence. |

**Do:** anchor marks to the grid/corners; keep them monochrome; one frame motif per component; treat them as
structure. **Don't:** stack 4+ motifs; animate everything at once; let marks overlap legible text; recolour
brackets outside the palette.

---

## 4. Components

Each entry: **Purpose · When/why · Anatomy · Variants · Use cases.** Reference the HTML anchor for exact markup.

### 4.1 Buttons — see `#buttons`
- **Purpose:** trigger actions.
- **When/why:** choose by emphasis. Exactly **one primary per view**.
- **Variants & when:**
  - **Primary** (`background:#FF5114;color:#0B0B0B`, hover → `#E8410A` + white): the single most important action (Subscribe, Apply).
  - **Secondary / outline** (`border:1.5px solid #FF5114`): an alternate path sharing weight with the primary.
  - **Ink / solid** (`background:#0B0B0B;color:#fff`, hover → orange): neutral high-contrast (Read article).
  - **Ghost / tertiary** (`border:1px solid #C9C9C4`): low-emphasis — filters, toggles, subtle links.
  - **Bracketed** (transparent + orange corner ticks): a "framed" technical action.
  - **Icon** (44×44): carousel nav, expand, share. **Min hit target 44px.**
- **Sizes:** S `padding:7px 13px / 10px` · M `11px 18px / 12px` · L `15px 26px / 14px`. All mono, weight 700, `letter-spacing:.1em`, uppercase.
- **States:** default · hover · disabled (`#E2E2DD` bg, `#A6A6A1` text, `cursor:not-allowed`) · loading (blinking square + "LOADING").
- **Snippet (primary):**
  ```html
  <button style="cursor:pointer;border:none;background:#FF5114;color:#0B0B0B;font-family:'JetBrains Mono';font-weight:700;font-size:12px;letter-spacing:.1em;padding:13px 22px">APPLY NOW →</button>
  ```

### 4.2 Tags & badges — see `#tags`
- **Purpose:** classify and signal status in a compact label.
- **When/why:** category on cards, status in dashboards/CMS, meta in bylines.
- **Variants:** **Category tag** (outline mono); **Status badge** (NEW = orange solid; PUBLISHED = green outline + dot; DRAFT = amber; ARCHIVED = red); **Counter/meta** (CLEARANCE black solid, read-time, dates, FEATURED with square).
- **Use cases:** card category chip, article state in an editor, "12 MIN READ", clearance/paywall marker.

### 4.3 Callouts & notices — see `#callouts`
- **Purpose:** inline messaging set apart from body copy.
- **Five intents (left-border + tinted bg):** Note (ink) · Tip (orange, `#FFF4EF`) · Warning (amber, `#FFFBEF`) · Danger (red, `#FCEEEC`) · **Restricted** (inverted black block with orange brackets — premium gates, paywalls, "members only").
- **When/why:** definitions/context (Note), best practices (Tip), deprecations & irreversible steps (Warning),
  destructive/critical (Danger), gated content (Restricted, pair with a primary button).
- **Anatomy:** mono label + ref code on top row, 13.5px body, `border-left:4px solid <intent>`.

### 4.4 Cards — see `#cards`
- **Purpose:** package a unit of content as a surface on the paper.
- **Four patterns:**
  - **Blog card:** hatch cover (with crop marks + NEW badge) → category/read-time → Archivo title → excerpt → byline footer with avatar + `→`. Use for post grids/feeds.
  - **Project / stat card:** category header → wordmark area → 2×2 stat grid (hairline-divided) with `→`. Use for metrics, portfolio, comparisons.
  - **Feature card (inverted):** black card, mono index, orange `+`, display title, CTA. Use for a pinned/spotlight post.
  - **Compact list card:** numbered rows with title + mono date. Use for "popular/recent" rails.
- **Hover:** `border-color:#0B0B0B`.

### 4.5 Data & tables — see `#data`
- **Spec table:** black header row (mono caps), 1px row dividers, mono cells. Use for specifications, comparisons, API params.
- **Stat grid:** hairline-divided cells, **Display-font numerals** with orange unit accents (`28x`, `800%`), mono label beneath. Use for KPIs and post/author stats.

### 4.6 Code & technical content — see `#code`
- **Purpose:** developer-facing content; a core strength of this aesthetic.
- **Components:**
  - **Code block:** dark `#0B0B0B`, header bar (traffic-light squares + filename + language tag + live **COPY** button), line-number gutter (`#4A4A46`), on-brand syntax colours — keywords `#FF8B5C`, plain `#EDEDEA`, punctuation `#7A7A74`, comments `#6E6E68`, strings `#C7C7C2`.
  - **Inline code:** `background:#F0EFEB;border:1px solid #D7D7D3;color:#BC3406;padding:1px 6px` mono.
  - **Keyboard keys (`kbd`):** white box, `border:1px solid #0B0B0B;border-bottom-width:3px`.
  - **Output/result:** green left-border callout.
  - **Copyable command:** dark one-liner with orange `$` and a copy button.
  - **Terminal/console:** prompt + output + blinking cursor (`@keyframes bpblink`).
  - **Diff:** `+`/`−` lines with green/red tint and coloured gutter sign.
  - **File tree:** mono with orange folders.
  - **API / props table:** PROP (orange) · TYPE · DEFAULT · DESCRIPTION.
- **Use cases:** tutorials, changelogs, engineering posts, docs.

### 4.7 Architecture & diagrams — see `#arch`
- **Purpose:** schematics for engineering/architecture writing — the system was made for this.
- **Seven figures:** **A** System architecture (layered, arrowed connectors) · **B** Flowchart (orange decision diamond, yes/no branches) · **C** UML class (name/attr/method compartments, inheritance triangle) · **D** Sequence (lifelines + request/return arrows) · **E** ER (entities with PK/FK, crow's-foot label) · **F** Annotated schematic (central block with leader-line callouts — the "exploded diagram" look) · **G** Build pipeline (numbered sequential stages).
- **Conventions:** white boxes `border:1px solid #0B0B0B`; arrowheads via CSS borders; orange highlights the focal node; dashed boxes/lines = data stores / returns; every diagram framed with a chrome label bar.
- **Export note:** diagram cards carry `data-om-raster` so PPTX export rasterises them instead of mangling the connectors. Keep that attribute on any HTML/CSS diagram you build.

### 4.8 Forms & inputs — see `#forms`
- **Inputs:** `border:1px solid #C9C9C4`, mono text, focus → `border-color:#FF5114`. Always pair with a mono uppercase label above.
- **Controls:** search (icon + input in a bordered row); error state (red border + `#FCEEEC` bg + mono error line); select (custom `▾`); textarea; checkbox (square, checked = orange with `✓`); toggle (square knob).
- **Filter tabs:** segmented, active = `background:#0B0B0B;color:#fff`.
- **Newsletter band:** dark block, underline-only email input, orange SUBSCRIBE.
- **Use cases:** comment forms, subscribe, search, CMS editors, settings.

### 4.9 Overlays — see `#overlays`
- **Modal / dialog:** centred white card with orange registration brackets on a dimmed field; header (mono tag + `×`), body, two-button footer (Cancel ghost + primary). Use for gated content & confirmations.
- **Alert (destructive):** same shell, red title + red primary (DELETE). Use for irreversible actions.
- **Toast / snackbar:** bottom-right, ink block + orange left border + status square; auto-dismiss (`@keyframes bptoast`). Transient confirmation.
- **Tooltip:** hover-reveal dark label (`.bp-tip:hover .bp-tip-body`). Inline definitions/coordinate hints.
- **Accordion / FAQ:** rows with `+`/`×` toggle (orange when open), animated `max-height`. Use for FAQs and progressive disclosure.

### 4.10 States & loading — see `#states`
- **Skeletons:** shimmer (`@keyframes bpshimmer`) on grey bars sized to the real content (card, list, avatar). Use while fetching, **matching the final layout's shape**.
- **Spinners:** square spinner (`@keyframes bpspin`) and dot-pulse (`@keyframes bppulse`). Square for in-context loads.
- **Progress:** determinate orange bar; indeterminate ink bar (`@keyframes bpindet`).
- **Empty / 404 / offline:** bordered glyph + title + helper + action. 404 is the inverted black + big orange numeral. Offline pulses a red "RECONNECTING".
- **Utilities:** cookie consent banner, avatar group (overlapped, `+N` orange), notification badge, back-to-top FAB, read-progress ring.

### 4.11 Media & carousels — see `#media`
- **Figures:** captioned figure with crop marks (click → lightbox); image + side caption; full-bleed band. Image placeholders use the diagonal-hatch fill with a `[ IMAGE · 16:9 ]` mono tag — **replace with real `<img>` in production.**
- **Gallery grid:** clickable tiles → lightbox.
- **Carousel/slider:** animated track (`transform:translateX`), ink prev/next arrows (44px), expanding orange dot indicators, slide counter, thumbnail rail. Click a slide → lightbox.
- **Lightbox / zoom modal:** full-screen dark overlay, orange corner brackets on the stage, **Zoom in/out toggle** (`transform:scale`), prev/next, close. Use for photo galleries and any "view larger".

---

## 5. Page patterns & layouts

### 5.1 Blog patterns — see `#blog`
Nav bar (logo + mono links + Subscribe), breadcrumb (mono, orange current), **article header** (top rule + meta
row + Archivo title + lede + byline + actions), **sticky TOC rail** (active item = orange left-border), pull-quote
(inverted block with orange brackets), inline figure with `FIG.0x` caption, **pagination** (hairline segmented).

### 5.2 Full page layouts — see `#layouts`
Eight ready compositions, each framed with a chrome label. Use them as starting points:

| # | Layout | Use for |
|---|---|---|
| 01 | Magazine home | Landing: split featured hero + recent grid + trending rail. |
| 02 | Archive / index | Filtered card grid + search + pagination. |
| 03 | Editorial feature | Asymmetric split with vertical orange rail (long-form deep dive). |
| 04 | Feed / list | Text-forward chronological list with date rail. |
| 05 | Author profile | Bracketed avatar + bio + stats + their posts. |
| 06 | Single article | TOC rail + narrow reading column + share rail + scroll-progress bar. |
| 07 | Category landing | Orange banner + subtopic counters + post grid. |
| 08 | Newsletter landing | Centred conversion card with full registration brackets. |

**Reading-column rule:** keep article body ≤ ~70ch; 14.5–17px; line-height ~1.65.

---

## 6. Recipes — composing a new screen

1. **Start the field.** Page = `paper` bg + o2h grid. Add 4 ambient crosshair `+` marks near the edges.
2. **Mast the page.** Optional orange ribbon top, then a Display-font title; bracket only the one focal title.
3. **Lay the grid.** Use the hairline-seam technique (`background:#C9C9C4; gap:1px; cells #fff`) for any group of
   2+ cells (cards, stats, nav, footer columns). Prefer flex/grid with `gap` over inline flow.
4. **Label everything technical** with the mono uppercase pattern + a small ref code (`REF—07`, `FIG.A`, `07.4`).
5. **One orange action.** Decide the single primary CTA; everything else is ink/outline/ghost.
6. **Add at most one texture/decoration per surface.**
7. **Cover states.** Provide skeleton, empty, and error variants for any data-driven region (see `#states`).

---

## 7. Conventions for an AI agent continuing this work

- **Styling is inline.** This is a Design Component (`.dc.html`); there are **no CSS classes or stylesheets**.
  Every style is a `style="..."` attribute. New components must follow suit. The only global CSS lives in
  `<helmet><style>`: `@font-face`/font `<link>`s, `@keyframes` (`bpblink`, `bpscan`, `bptoast`, `bpfade`,
  `bpshimmer`, `bpspin`, `bpindet`, `bppulse`, `bpmarq`), the scrollbar, and the `.bp-tip` hover rule.
- **Reuse the literals.** Repeat the exact hex/font/spacing values from §2 — do not invent new colours or fonts.
- **Hover/active/focus** use `style-hover` / `style-active` / `style-focus` attributes (DC syntax), not CSS.
- **Interactive state** lives in the logic class `class Component extends DCLogic` → `renderVals()` returns
  values/handlers consumed by `{{ }}` template holes. Static styles stay as literal `style="..."`; only truly
  dynamic values (an open/active style, a live transform) come through a `{{ }}` hole.
- **Repetition** uses `<sc-for list="{{ items }}" as="x" hint-placeholder-count="N">`; conditionals use
  `<sc-if value="{{ flag }}" hint-placeholder-val="{{ false }}">`.
- **Diagrams / HTML-CSS figures** get `data-raster`→`data-om-raster` for clean PPTX export.
- **Screens/slides** should carry `data-screen-label="…"` (already on every `<section>`).
- **Placeholders:** image areas are diagonal-hatch blocks with a mono `[ … ]` tag. When real assets exist,
  swap in `<img>` but keep the crop-mark frame and caption.

> **org2html translation note:** the engine emits **clean semantic HTML + `.org-*` class hooks + token-driven
> CSS** instead of inline styles. The `style="…"` literals above are the *design source*; the
> [`org-style-book-matrix.md`](./org-style-book-matrix.md) maps each one to its stable `.org-*` hook /
> `data-component` name and its `--o2h-*` token so the parser, CSS, and component plugins never drift.

---

## 8. Quick token reference (copy/paste)

```
/* Colour */
paper #E9E9E6   card #FFFFFF   line #C9C9C4   line-soft #EFEFEA
mute  #7A7A76   slate #3A3A37  ink  #0B0B0B
signal-50 #FFEDE6  100 #FFD2C0  300 #FF8B5C  500 #FF5114  600 #E8410A  700 #BC3406
go #2E9E5B   hold #D9A300   stop #D23B2B

/* Type */
Display:   'Chakra Petch', sans-serif    (UPPERCASE, 600–700)
Editorial: 'Archivo', sans-serif         (400–900)
Technical: 'JetBrains Mono', monospace   (UPPERCASE labels, letter-spacing .1–.16em)

/* Structure */
radius 0   spacing 4·8·16·24·44·64   grid module 44px
border 1px #C9C9C4 (structural) / #0B0B0B (emphasis)
hairline seam: container bg #C9C9C4 + gap:1px + cells #fff
```

---

*End of guide. The `O2H Style Book.dc.html` file is always the source of truth — when in doubt, open the
matching `#anchor` and copy its inline styles verbatim.*
