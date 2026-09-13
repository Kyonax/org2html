# AUDIT 2 — org2html "O2H" Design System — EXHAUSTIVE VISUAL REGISTRY

- **Source of truth (canonical):** `/home/kyonax/Downloads/O2H Style Book.html` (626 KB, single-file bundle).
  The deliverable is a `.dc.html` runtime bundle: real markup is **gzip+base64** inside `<script type="__bundler/manifest">`, decoded to `template.html` (the `<x-dc>` document, 223 KB) + a `dc-runtime` JS. All values below are read from the decoded template (`/tmp/org2html-audit/template_pretty.html`) and its `data-dc-script` data block.
- **Cross-checked guide:** `/home/kyonax/.brain.d/roam-nodes/kyonax/projects/org_2_html/2026-06-27-000000-styling_org_2_html_o2h.org`.
- **Rule:** where guide and HTML differ, **HTML wins** — discrepancies flagged inline and collected in §DISCREPANCIES.
- **Templating note:** the book uses `sc-for`/`sc-if`/`{{ }}`/`style-hover`/`style-focus` (dc-runtime), so interactive states (hover/focus/active/copied) and list data are in the script, not inline. Engine emits clean `.org-*` markup instead (guide §71-72).
- **Mapping classes:** NATIVE (standard Org construct), COMPONENT (`#+BEGIN_COMPONENT`/shortcode/plugin), CHROME (page-level structure or global default CSS / `--o2h-*` tokens — not authored inline).

---

## GROUP 00 · GLOBAL / CHROME (app shell — outside any `#anchor`)

### SB-001 — App-shell two-pane flex layout
- **Section:** (shell, pre-`#cover`) · **Category:** Chrome
- **Anatomy:** `<div style="display:flex;min-height:100vh;background:#E9E9E6;font-family:'Archivo'">` → `<aside>` (248px sticky rail) + `<main>` (flex:1).
- **Variants:** single.
- **Org-mapping:** CHROME — page frame (`templates/default.html`), not authored inline.

### SB-002 — Left sidebar rail (nav chrome)
- **Section:** (shell) · **Category:** Chrome
- **Anatomy:** `<aside>` `position:sticky;top:0;width:248px;height:100vh;background:#0B0B0B;color:#EDEDEA;border-right:1px solid #000`. Header (brand+`DESIGN SYSTEM · v1.0` mono 10px `.18em` `#7A7A74`), scroll `<nav>`, footer block.
- **Variants:** single.
- **Org-mapping:** CHROME — site nav (`<nav class=org-toc>`/global nav).

### SB-003 — Sidebar brand glyph (boxed registration mark)
- **Section:** (shell) · **Category:** Decoration
- **Anatomy:** 22×22 `#FF5114` square; inner `inset:6px #0B0B0B` square; vertical bar `left:9px;top:3px;4×16 #0B0B0B`. Beside it `org2html` Chakra Petch 700 17px `.04em`.
- **Variants:** appears at 22px (sidebar), 18px (navbar SB-118, footer SB-180).
- **Org-mapping:** CHROME — favicon/logo mark (guide Phase 2: favicon = registration/boxed-X).

### SB-004 — Sidebar nav item
- **Section:** (shell) · **Category:** Chrome
- **Anatomy:** `sc-for navItems` → `<a>` flex, `padding:8px 20px`, JetBrains Mono 12px `.04em` `#C7C7C2`, `border-left:2px solid transparent`; mono id `#5C5C57` 10px + label. **Hover:** `color:#fff;border-left:2px solid #FF5114;background:#141412`. Data: 19 items `00 COVER`…`18 FOOTER`.
- **Variants:** default / hover / active (orange left-border).
- **Org-mapping:** CHROME — TOC/nav (active item = orange left-border, guide §147).

### SB-005 — Sidebar serial + status footer
- **Section:** (shell) · **Category:** Component (status pill instance)
- **Anatomy:** mono 10px `#6E6E68`; `SERIAL / SB-2025-001`; status row = 7×7 `#3FBF6A` circle `border-radius:50%;animation:bpblink 1.6s infinite` + `STATUS · ACTIVE`.
- **Variants:** single (uses status-pill decoration SB-046).
- **Org-mapping:** CHROME — global status chrome.

### SB-006 — Main o2h-grid field background
- **Section:** (shell) · **Category:** Decoration
- **Anatomy:** `<main>` `background-color:#E9E9E6; background-image:linear-gradient(rgba(11,11,11,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(11,11,11,.035) 1px,transparent 1px); background-size:44px 44px`. THE 44px module field.
- **Variants:** page field 44px `.035`; section variants 26px/30px `.04`; demo 18px `.14` (SB-038).
- **Org-mapping:** CHROME — default `.org-root` body field (guide §63/§90).

### SB-007 — Global base tokens (root CSS)
- **Section:** (shell, `<style>`) · **Category:** Foundation-Token
- **Anatomy:** `*{box-sizing:border-box;margin:0;padding:0}` · `html{scroll-behavior:smooth}` · `body{background:#E9E9E6;color:#0B0B0B;font-family:'Archivo';-webkit-font-smoothing:antialiased}` · `::selection{background:#FF5114;color:#fff}` · `a{color:inherit;text-decoration:none}` · scrollbar `width:10px;track #E9E9E6;thumb #1a1a1a border 2px #E9E9E6`.
- **Variants:** single set.
- **Org-mapping:** CHROME — default global CSS / `--o2h-*` reset.

### SB-008 — Section header pattern (repeated ×19)
- **Section:** (every `#anchor`) · **Category:** Chrome
- **Anatomy:** flex row: mono index `NN` 12px `.16em` `#FF5114`; `<h2>` Archivo 800 `clamp(30px,4vw,52px)` `line-height:.95;letter-spacing:-.02em`; `border-top:1px solid #0B0B0B` rule + two mono 11px `.14em` `#7A7A76` meta spans (category / count).
- **Variants:** one per section (01 Color … 18 Footer). Cover uses a different masthead.
- **Org-mapping:** NATIVE — H2 heading pattern (`*` headline ⇐ Archivo heavy + mono section-ref, guide §94).

---

## GROUP 01 · #cover (Masthead)

### SB-009 — Top SPEC ribbon
- **Section:** #cover · **Category:** Decoration/Chrome
- **Anatomy:** `background:#FF5114;color:#0B0B0B;padding:9px 22px` mono 11px `.16em` 500; `SPEC` / Archivo 700 deck / `07.4`.
- **Variants:** orange top ribbon (this) vs ink bottom ribbon (SB-014).
- **Org-mapping:** CHROME — orange-ribbon banner (decoration SB-043).

### SB-010 — Cover crosshair node array
- **Section:** #cover · **Category:** Decoration
- **Anatomy:** 5 absolute `<span>+` JetBrains Mono 22px `#C2C2BD` at corners + top-center.
- **Variants:** ambient grey (here); focal orange (SB-035).
- **Org-mapping:** CHROME — crosshair-node decoration (SB-033).

### SB-011 — Cover meta coordinate row
- **Section:** #cover · **Category:** Decoration
- **Anatomy:** flex mono 11px `.16em` `#7A7A76`: `UNITED · DESIGN · SYSTEM` / `FIELD TESTED · STATUS ACTIVE` / `REF / AD—47`.
- **Variants:** single.
- **Org-mapping:** CHROME — coordinate-tag labels (SB-041).

### SB-012 — Masthead title with registration brackets
- **Section:** #cover · **Category:** Component
- **Anatomy:** `position:relative;display:inline-block;padding:18px 26px`; 8 absolute spans = 4 orange corner brackets `30×6` + `6×30` `#FF5114`; `<h1>` Chakra Petch 700 `clamp(54px,9vw,128px)` `line-height:.86;letter-spacing:-.01em;text-transform:uppercase` "Org2_Html".
- **Variants:** single (focal hero).
- **Org-mapping:** NATIVE — H1 ⇐ `#+TITLE` (Chakra display + registration brackets, guide §93).

### SB-013 — Cover deck + stat column
- **Section:** #cover · **Category:** Component
- **Anatomy:** Archivo 17px deck `max-width:480px #1c1c1a` + mono 11px `.14em` `#7A7A76` `line-height:2.1` list: `SECTIONS — 16` / `COMPONENTS — 50+` / `DECORATIONS — 16`.
- **Variants:** single. **[DISCREPANCY: see §D]**
- **Org-mapping:** NATIVE — lead paragraph + descriptive list.

### SB-014 — Bottom UNIT ribbon
- **Section:** #cover · **Category:** Decoration/Chrome
- **Anatomy:** `background:#0B0B0B;color:#FF5114;padding:9px 22px` mono 11px `.16em`; `UNIT` / white Archivo 700 deck / `BP—001`.
- **Variants:** ink ribbon counterpart to SB-009.
- **Org-mapping:** CHROME — ribbon banner.

---

## GROUP 02 · #color (every token, click-to-copy swatch)

Swatch component = `<button>` `height:128px`(orange/neutral) / `112px`(functional), `background:{hex};color:{fg}`, mono; role label top, hex label + name bottom; `onClick=copyHex` (label flips `✓ COPIED`); hover `filter:brightness(1.03–1.05)`. Cells in a `gap:1px;background:#C9C9C4` hairline-seam grid `minmax(150px,1fr)`.

### SB-015 — Signal-orange token scale (6)
- **Section:** #color · **Category:** Foundation-Token
- **Tokens (exact):** SIGNAL 50 `#FFEDE6` (TINT/WASH, fg `#7A2A10`) · SIGNAL 100 `#FFD2C0` (HOVER BG, `#7A2A10`) · SIGNAL 300 `#FF8B5C` (ILLUSTRATION, `#3a1405`) · SIGNAL 500 `#FF5114` (PRIMARY, `#0B0B0B`) · SIGNAL 600 `#E8410A` (HOVER/ACTIVE, `#fff`) · SIGNAL 700 `#BC3406` (PRESSED, `#fff`).
- **Org-mapping:** CHROME — `--o2h-signal-50…700` defaults.

### SB-016 — Paper & Ink neutral tokens (6)
- **Section:** #color · **Category:** Foundation-Token
- **Tokens:** PAPER `#E9E9E6` (CANVAS) · CARD `#FFFFFF` (SURFACE) · LINE `#C9C9C4` (BORDERS) · MUTE `#7A7A76` (META TEXT, fg`#fff`) · SLATE `#3A3A37` (SECONDARY, `#fff`) · INK `#0B0B0B` (TEXT/FILL, `#fff`).
- **Org-mapping:** CHROME — neutral `--o2h-*` defaults.

### SB-017 — Functional/status tokens (3)
- **Section:** #color · **Category:** Foundation-Token
- **Tokens:** GO `#2E9E5B` (SUCCESS, fg`#fff`) · HOLD `#D9A300` (WARNING, `#0B0B0B`) · STOP `#D23B2B` (ERROR/DANGER, `#fff`).
- **Org-mapping:** CHROME — `--o2h-go/hold/stop`.

### SB-018 — Colour usage rule cards (3)
- **Section:** #color · **Category:** Chrome (doc content)
- **Anatomy:** 3 white cards (RESTRAINT / CONTRAST / NEUTRAL FIELD), mono 10px `.14em` `#FF5114` label + 13.5px body. Note auxiliary greys named here: `#222` body, `#9A9A95`, `#5C5C57`.
- **Org-mapping:** CHROME — documentation only.

---

## GROUP 03 · #type

### SB-019 — Font-family cards (3 families)
- **Section:** #type · **Category:** Foundation-Token
- **Tokens:** DISPLAY = **Chakra Petch** 700 (uppercase, headlines/hero); EDITORIAL = **Archivo** 400–900 (titles/body); TECHNICAL = **JetBrains Mono** 400/500/700 (labels/meta/specs, uppercase + wide tracking). All 3 are `@font-face`-inlined as woff2 (Archivo/JetBrains full unicode ranges, Chakra Petch).
- **Org-mapping:** CHROME — `--o2h-font-display/editorial/mono`; load in `default.html` head.

### SB-020 — Type scale table (6 steps, ratio 1.25)
- **Section:** #type · **Category:** Foundation-Token
- **Tokens:** DISPLAY 72px · H1 48px · H2 36px · H3 24px · BODY 16px · CAPTION 12px (rows render "The quick brown fox" in Archivo 700). Never <12px.
- **Org-mapping:** CHROME — type-scale tokens.

### SB-021 — Mono label pattern
- **Section:** #type · **Category:** Foundation-Token
- **Anatomy:** JetBrains Mono ~10–11px, `letter-spacing:.12–.16em`, UPPERCASE, `color:#7A7A76`. (Guide canon: 11px `.14em`.) The pervasive caption/meta primitive.
- **Org-mapping:** CHROME — default mono-label utility.

---

## GROUP 04 · #grid

### SB-022 — Modular field demo
- **Section:** #grid · **Category:** Layout
- **Anatomy:** `grid-template-columns:repeat(6,1fr);grid-auto-rows:46px` with `linear-gradient(#0000000d 1px…)` `background-size:calc(100%/6) 46px`; HERO (span3×2 ink), CTA (orange), placeholder cells (`#E9E9E6` 1px line, `margin:3px`).
- **Org-mapping:** CHROME — 12-col/44px layout grid.

### SB-023 — Spacing scale
- **Section:** #grid · **Category:** Foundation-Token
- **Tokens:** 04·XS=4px · 08·S=8px · 16·M=16px · 24·L=24px · 44·XL=44px · 64·2XL=64px (orange bars sized to value). 4px base; 44px module aligns to grid.
- **Org-mapping:** CHROME — spacing tokens.

### SB-024 — Sharp-edges / radius-0 rule
- **Section:** #grid · **Category:** Foundation-Token
- **Anatomy:** `border-radius:0` everywhere; corners softened only by bracket decorations. (Exception: status dots/avatars circular.)
- **Org-mapping:** CHROME — `--o2h` radius token = 0.

### SB-025 — Hairline-seam technique
- **Section:** #grid · **Category:** Foundation-Token
- **Anatomy:** container `background:#C9C9C4;gap:1px`, cells `#fff`; the 1px gap shows through as the rule. Dominant grid technique across the book.
- **Org-mapping:** CHROME — border/structure token recipe.

### SB-026 — Density principle card + border tokens
- **Section:** #grid · **Category:** Foundation-Token
- **Anatomy:** 3 cards (SHARP EDGES / HAIRLINE RULES / DENSITY). Border tokens stated: `1px solid #C9C9C4` (structural), `1px solid #0B0B0B` (emphasis); dashed divider `1px dashed #C9C9C4`. Section seam color `#D4D4CF`.
- **Org-mapping:** CHROME — border tokens / doc content.

---

## GROUP 05 · #deco — THE 18 DECORATION CARDS (header labels "16 MOTIFS" — see §D)

Each card = white cell, `min-height:130–150px` preview + footer (mono 11px 700 `.06em` name + 11.5px `#666` guidance), in a hairline-seam grid.

### Group A — Frame marks
### SB-027 — Crosshair node
- #deco · Decoration · 4 ambient grey `+` 18px `#C2C2BD` corners + 1 focal orange `+` 30px `#FF5114`.
- **Org-mapping:** CHROME — ambient `::before` corner marks on `.org-root`.

### SB-028 — Crop marks
- #deco · Decoration · box `118×84 #F4F4F1`; 8 spans, black L's `18×2`+`2×18 #0B0B0B` at 4 corners (offset 0).
- **Org-mapping:** NATIVE — figure frame ⇐ `<figure>`/image (`.org-figure::before/after`).

### SB-029 — Registration brackets
- #deco · Decoration · 8 spans, bold orange corners `24×5`+`5×24 #FF5114` offset `-3px`.
- **Org-mapping:** NATIVE — H1/focal heading ⇐ `#+TITLE` (reserve for single focal element).

### SB-030 — Target reticle
- #deco · Decoration · `54×54` circle `border:1.5px #0B0B0B;border-radius:50%`; cross H+V `1.5px`; center `10×10 #FF5114` dot.
- **Org-mapping:** COMPONENT — focus marker (carousel center / "you are here"); no native form.

### SB-031 — Boxed X
- #deco · Decoration · `46×46` `border:1.5px #0B0B0B`; mono `×` 22px.
- **Org-mapping:** NATIVE — section divider ⇐ `-----` (also reused as dismiss/close affordance).

### SB-032 — Bracket frame
- #deco · Decoration · `118×80`; left+right `2px` rails with `14×2` cap ticks; centered mono `[ FIG.01 ]` 10px `#9A9A95`.
- **Org-mapping:** NATIVE — figure ref ⇐ `#+CAPTION` (`[ FIG.0x ]`).

### Group B — Field & texture
### SB-033 — O2H grid
- #deco · Decoration · two `linear-gradient(#0b0b0b14 1px…)` `background-size:18px 18px`.
- **Org-mapping:** CHROME — base page field (see SB-006).

### SB-034 — Diagonal hatch
- #deco · Decoration · `repeating-linear-gradient(45deg,#0b0b0b,#0b0b0b 1px,transparent 1px,transparent 8px)`.
- **Org-mapping:** NATIVE — image placeholder ⇐ `<figure>` no-src / redacted fill.

### SB-035 — Dot matrix
- #deco · Decoration · `radial-gradient(#0b0b0b33 1.4px,transparent 1.4px)` `background-size:12px 12px`.
- **Org-mapping:** CHROME — empty-state / sidebar texture.

### SB-036 — Scanline
- #deco · Decoration/Animation · `#0B0B0B` plate + `repeating-linear-gradient(#FF511430,… 1px,transparent 6px);animation:bpscan .9s linear infinite`.
- **Org-mapping:** CHROME — loading/processing state overlay.

### SB-037 — Barcode strip
- #deco · Decoration · `140×46` `repeating-linear-gradient(90deg,#0B0B0B 0-2px,transparent,#0B0B0B 4-7px,transparent 7-9px)`.
- **Org-mapping:** CHROME — footer/serial decoration (see SB-179).

### SB-038 — Rule variants
- #deco · Decoration · three rules: dashed `1px #0B0B0B`; `2px solid #FF5114`; `1px #0B0B0B` tick-capped with `6×6 #FF5114` square ends.
- **Org-mapping:** NATIVE — horizontal rule ⇐ `-----` (default + section-divider variants, guide §150).

### Group C — Labels & nodes
### SB-039 — Coordinate tag
- #deco · Decoration · mono 10px `.12em`; outline `border:1px solid #0B0B0B` `LAT 40.71`; solid `background:#0B0B0B;color:#fff` `REF—07`.
- **Org-mapping:** NATIVE — verbatim ⇐ `=text=` / citation / inline timestamp (mono outline/solid).

### SB-040 — Vertical label
- #deco · Decoration · Archivo 800 13px `.16em`; `writing-mode:vertical-rl;transform:rotate(180deg);text-transform:uppercase`.
- **Org-mapping:** CHROME — binder-spine rail label (page edge).

### SB-041 — Orange ribbon
- #deco · Decoration · `background:#FF5114;color:#0B0B0B` Archivo 700 13px `padding:6px 16px`.
- **Org-mapping:** CHROME — full-width banner (announcement/tagline).

### SB-042 — Connector node
- #deco · Decoration · `9×9 #FF5114` square — `1.5px #0B0B0B` line — `9×9` outline square — line — mono `+` 16px. Schematic leader line.
- **Org-mapping:** COMPONENT — diagram leader/connector; no native form.

### SB-043 — Index counter
- #deco · Decoration · Chakra Petch 700 34px `07` + `<span style="color:#C2C2BD">/14`. Current/total numerals.
- **Org-mapping:** NATIVE — statistics cookie ⇐ `[n/m]` (or pagination/progress).

### SB-044 — Status pill
- #deco · Decoration · `inline-flex;border:1px solid #C9C9C4;padding:6px 12px` mono 11px `.1em`; `7×7` `#2E9E5B` `border-radius:50%;animation:bpblink 1.6s infinite` + `LIVE · SYNCED`.
- **Org-mapping:** NATIVE — TODO/status keyword badge ⇐ headline TODO (draft/published/presence).

### SB-045 — DO / DON'T guidance pair
- #deco · Chrome (doc) · two cards: `✓ DO` (mono `#2E9E5B`) / `✕ DON'T` (mono `#D23B2B`), 4 `<li>` each.
- **Org-mapping:** CHROME — documentation only.

---

## GROUP 06 · #buttons

### SB-046 — Button: PRIMARY
- #buttons · Component-Variant · `background:#FF5114;color:#0B0B0B` mono 700 12px `.1em` `padding:13px 22px` "APPLY NOW →". **Hover:** `#E8410A` + white.
- **Org-mapping:** COMPONENT — `Button variant=primary` (one per view).

### SB-047 — Button: SECONDARY / OUTLINE
- #buttons · Component-Variant · `background:#fff;color:#0B0B0B;border:1.5px solid #FF5114` `padding:11.5px 22px`. **Hover:** `#FFEDE6`.
- **Org-mapping:** COMPONENT — `Button variant=outline`.

### SB-048 — Button: INK / SOLID
- #buttons · Component-Variant · `background:#0B0B0B;color:#fff`. **Hover:** `#FF5114`+ink.
- **Org-mapping:** COMPONENT — `Button variant=ink`.

### SB-049 — Button: GHOST / TERTIARY
- #buttons · Component-Variant · `background:transparent;border:1px solid #C9C9C4` mono 500. **Hover:** `border-color:#0B0B0B`.
- **Org-mapping:** COMPONENT — `Button variant=ghost`.

### SB-050 — Button: BRACKETED
- #buttons · Component-Variant · borderless; 4 orange corner ticks `10×2`+`2×10 #FF5114` (TL+BR). **Hover:** `color:#FF5114`.
- **Org-mapping:** COMPONENT — `Button brackets=true`.

### SB-051 — Button: ICON (3)
- #buttons · Component-Variant · three `44×44` (hit target): outline `→` (hover `border #0B0B0B`); ink `+` (hover orange); orange `↗` (hover `#E8410A`).
- **Org-mapping:** COMPONENT — `Button variant=icon`.

### SB-052 — Button sizes (S/M/L)
- #buttons · Component-Variant · SMALL 10px `padding:7px 13px`; MEDIUM 12px `11px 18px`; LARGE 14px `15px 26px` (ink fill).
- **Org-mapping:** COMPONENT — `Button size=sm|md|lg`.

### SB-053 — Button states (default/hover/disabled/loading)
- #buttons · State · DEFAULT (orange/ink); HOVER `#E8410A`+white; DISABLED `background:#E2E2DD;color:#A6A6A1;cursor:not-allowed`; LOADING `border:1px #C9C9C4;#fff;color:#7A7A76;cursor:wait` + `8×8 #FF5114 animation:bpblink .8s`.
- **Org-mapping:** COMPONENT — `Button` state props.

---

## GROUP 07 · #tags

### SB-054 — Category tags (4)
- #tags · Component-Variant · mono 10px `.1em` `padding:5px 10px`: EDITORIAL/TUTORIAL outline `#C9C9C4`; ACTIVE outline `#0B0B0B`; RESEARCH solid `#0B0B0B`/`#fff`.
- **Org-mapping:** NATIVE — headline tags ⇐ `:tag:` (outline mono chips, guide §156).

### SB-055 — Status badges (4)
- #tags · Component-Variant · NEW `bg #FF5114;#0B0B0B` 700; PUBLISHED `border #2E9E5B;color #2E9E5B` + `6×6` green dot; DRAFT `border #D9A300;color #9A7400`; ARCHIVED `border #D23B2B;color #D23B2B`.
- **Org-mapping:** NATIVE — TODO/state badge ⇐ headline TODO keyword (TODO→NEW, DONE→PUBLISHED, etc.).

### SB-056 — Counters & meta (4)
- #tags · Component-Variant · CLEARANCE 4 solid ink; `12 MIN READ` mono 11px; `·` separator `#7A7A76`; `NOV 04 2025`; FEATURED `#FF5114` + `7×7` orange square.
- **Org-mapping:** NATIVE — read-time/date meta + priority/clearance chip ⇐ headline metadata.

---

## GROUP 08 · #callouts (5 intents)

### SB-057 — Callout: NOTE (info)
- #callouts · Component-Variant · `bg #fff;border:1px solid #C9C9C4;border-left:4px solid #0B0B0B;padding:18px 20px`; top row mono 10px `.14em` `ⓘ NOTE` / ref `INF—01` `#9A9A95`; body 13.5px `#222`.
- **Org-mapping:** NATIVE — `#+BEGIN_NOTE` / `#+BEGIN_QUOTE` default.

### SB-058 — Callout: TIP (orange)
- #callouts · Component-Variant · `bg #FFF4EF;border:1px solid #FFD2C0;border-left:4px solid #FF5114`; label `#BC3406` `★ TIP` / `TIP—02 #E09277`; body `#5a2510`.
- **Org-mapping:** NATIVE — `#+BEGIN_TIP`.

### SB-059 — Callout: WARNING (amber)
- #callouts · Component-Variant · `bg #FFFBEF;border:1px solid #EBD79A;border-left:4px solid #D9A300`; label `#9A7400` `⚠ WARNING` / `WRN—03 #C2A646`; body `#5c4a14`.
- **Org-mapping:** NATIVE — `#+BEGIN_WARNING`.

### SB-060 — Callout: DANGER (red)
- #callouts · Component-Variant · `bg #FCEEEC;border:1px solid #E8B6AF;border-left:4px solid #D23B2B`; label `#A82A1C` `✕ DANGER` / `ERR—04 #C77B70`; body `#5c1c14`.
- **Org-mapping:** NATIVE — `#+BEGIN_DANGER`/CAUTION.

### SB-061 — Callout: RESTRICTED (inverted + brackets)
- #callouts · Component-Variant · `bg #0B0B0B;color #EDEDEA;grid-column:1/-1`; 4 orange corner brackets `18×4`+`4×18 #FF5114` offset `-2px`; label `#FF5114` `▙ RESTRICTED ACCESS ZONE` / `CLEARANCE LEVEL 4 · AD—47 #7A7A74`; body `#D8D8D4`.
- **Org-mapping:** COMPONENT — `#+BEGIN_RESTRICTED`/paywall block (pair with primary button).

---

## GROUP 09 · #cards (4 patterns)

### SB-062 — Blog card
- #cards · Component-Variant · `<article>` `border:1px solid #C9C9C4` (hover `#0B0B0B`); 170px cover = diagonal-hatch `#F4F4F1` + `┌`/`┘` mono corners + NEW badge + `[ COVER IMAGE ]`; body = tag row + Archivo 700 20px h3 + 13px `#666` + footer (`24×24` avatar `TB` + name + `→`).
- **Org-mapping:** COMPONENT — `Card` (blog/article).

### SB-063 — Project / stat card
- #cards · Component-Variant · header `INCUBATION`; 120px wordmark `SOLIDUS` Archivo 800 26px; 2×2 hairline stat grid ($4,4M FUNDS / 700% GROWTH / 41x ROI / 84 PARTNERSHIPS) Archivo 700 20px + mono 10px labels + `→`.
- **Org-mapping:** COMPONENT — `Card` (project) / stat grid.

### SB-064 — Feature (inverted) card
- #cards · Component-Variant · `bg #0B0B0B;color #EDEDEA;padding:22px`; orange `+` 18px top-right; `01 / FEATURED #FF5114`; Chakra Petch 700 24px uppercase title; `#B7B7B2` body; orange `READ MORE` button.
- **Org-mapping:** COMPONENT — `Card` (feature/pinned).

### SB-065 — Compact / list card
- #cards · Component-Variant · `border:1px solid #C9C9C4;padding:18px`; rows `border-top:1px solid #EFEFEA`: mono `#FF5114` index + Archivo 600 14px title + mono 10px `#9A9A95` meta.
- **Org-mapping:** COMPONENT — `Card` (compact list) / ⇐ ordered list.

---

## GROUP 10 · #data

### SB-066 — Spec table
- #data · Component · `border:1px solid #0B0B0B`; header `grid-template-columns:1fr 1.4fr 1.4fr;background:#0B0B0B;color:#fff` mono 10px `.12em` (`'' / SPEC / OUTPUT`); rows `border-top:1px solid #EFEFEA` mono 12px (key `#0B0B0B`, value `#333`, output `#7A7A76`). Data: FORMAT/TYPE/GRID/PALETTE/COMPONENTS. **[D: COMPONENTS row = "40+ PATTERNS" vs cover "50+".]**
- **Org-mapping:** NATIVE — table ⇐ Org table (black header, hairline rows, guide §133).

### SB-067 — Stat grid
- #data · Component-Variant · hairline-seam `minmax(160px,1fr)` cells; Chakra Petch 700 34px numeral with orange unit accent (`28×`, `800%`) + mono 10px `.1em` `#7A7A76` label.
- **Org-mapping:** COMPONENT — stat-grid variant of table (numeric KPIs, guide §134).

---

## GROUP 11 · #code (developer content — full sub-kit)

### SB-068 — Code block (dark, with header bar)
- #code · Component · `bg #0B0B0B;border:1px solid #0B0B0B`; header `border-bottom:1px solid #232320`.
- **Org-mapping:** NATIVE — `#+BEGIN_SRC` ⇐ `<pre class=org-src>`.

### SB-069 — Code block traffic-light squares
- #code · Decoration · three `9×9` squares `#3A3A37,#3A3A37,#FF5114` (sharp, not circles).
- **Org-mapping:** CHROME — part of `.org-src` header chrome.

### SB-070 — Code block filename + language tag
- #code · Component-Variant · mono 11px `#B7B7B2` `org2html.css`; lang tag `border:1px solid #3A3A37;padding:2px 7px` 9px `#7A7A74` `CSS`.
- **Org-mapping:** NATIVE — `#+NAME`/`-n`/lang of `#+BEGIN_SRC`.

### SB-071 — Code block COPY button
- #code · State · `onClick=copyCss`, mono 10px `#FF8B5C` (hover `#fff`); label toggles `COPY` ⇄ `✓ COPIED` (1.2s).
- **Org-mapping:** NATIVE — copy affordance on `.org-src`.

### SB-072 — Code line-number gutter
- #code · Component-Variant · `width:42px;text-align:right;color:#4A4A46;user-select:none` per line; 7 lines, `line-height:1.7`.
- **Org-mapping:** NATIVE — `#+BEGIN_SRC -n` line numbers.

### SB-073 — Syntax-highlight palette (O2H theme)
- #code · Foundation-Token · keywords/selector `#FF8B5C` · plain/values `#EDEDEA` · punctuation `#7A7A74` · comments `#6E6E68` · strings `#C7C7C2` (on `#0B0B0B`).
- **Org-mapping:** CHROME — Shiki "o2h" css-variables theme (guide §113).

### SB-074 — Inline code
- #code · Component-Variant · `font:JetBrains Mono 12.5px;background:#F0EFEB;border:1px solid #D7D7D3;color:#BC3406;padding:1px 6px`.
- **Org-mapping:** NATIVE — `~code~` ⇐ `<code>` (also `src_lang{}` inline-src).

### SB-075 — Keyboard keys (kbd)
- #code · Component-Variant · mono 12px `background:#fff;border:1px solid #0B0B0B;border-bottom-width:3px;padding:3px 9px` (⌘, K).
- **Org-mapping:** COMPONENT — kbd shortcode (no native Org form).

### SB-076 — Output / result block
- #code · Component-Variant · `border-left:4px solid #2E9E5B;background:#F1F8F3;padding:10px 14px` mono 12px `#1f6e42` `→ Build complete · 0 errors · 1.2s`.
- **Org-mapping:** NATIVE — `#+RESULTS:` / `#+BEGIN_EXAMPLE` output.

### SB-077 — Copyable command
- #code · Component · `bg #0B0B0B;padding:14px 16px` mono 13px; `$ ` prompt `#FF8B5C` + `npm i @org2html/ds`; copy `34×30` button `border:1px #3A3A37;bg #141412;#FF8B5C` toggles `⎘`⇄`✓`.
- **Org-mapping:** COMPONENT — copyable-command shortcode / `#+BEGIN_SRC sh`.

### SB-078 — Terminal / console
- #code · Component · `bg #0B0B0B`; header `8×8 #FF5114` + `TERMINAL · bash`; body lines: prompt `➜ org2html #FF8B5C`, `git:(main)` punct, dim `#7A7A74` steps, `✓ done #9ECE6A`, blinking cursor `8×15 #FF5114 animation:bpblink 1s`.
- **Org-mapping:** COMPONENT — terminal/console shortcode.

### SB-079 — Diff block
- #code · Component · `bg #0B0B0B`; header `theme.css · DIFF` + `+2 −1 #FF8B5C`; rows: context `#7A7A74`; removed `background:rgba(210,59,43,.18);color:#E89A90` `−` gutter `#D23B2B`; added `rgba(46,158,91,.18);#9ECE6A` `+` `#2E9E5B`.
- **Org-mapping:** NATIVE — `#+BEGIN_SRC diff` (or diff shortcode).

### SB-080 — File tree
- #code · Component · `bg #fff;border:1px solid #C9C9C4`; header `PROJECT STRUCTURE`; mono 12.5px `line-height:1.85`; dirs `#FF5114` (`▸ org2html/`, `tokens/`, `components/`), `├─/│/└─` connectors, files plain.
- **Org-mapping:** COMPONENT — file-tree shortcode (or `#+BEGIN_EXAMPLE`).

### SB-081 — API / props table
- #code · Component · `border:1px solid #0B0B0B`; header `grid 1.2/1/1/1.6 bg #0B0B0B` `PROP/TYPE/DEFAULT/DESCRIPTION`; rows mono 11.5px (prop `#BC3406`, type `#0B0B0B`, default `#7A7A76`, desc Archivo 12.5px `#444`). Data: variant/size/brackets/disabled.
- **Org-mapping:** NATIVE — table ⇐ Org table (API-doc variant).

---

## GROUP 12 · #arch (7 diagrams A–G; all carry `data-om-raster=""`)

Shared chrome: each `border:1px solid #C9C9C4` + ink header bar (`8×8 #FF5114` + `FIG.x · NAME` mono 10px `.12em` / right tag `#7A7A74`). Conventions: solid ink box = node, orange box/diamond = focal/active, dashed box = datastore/edit, `2px` lines with CSS-triangle arrowheads, orange `7×7` connector dots, mono labels, `26px` o2h-grid bg on full-width figures.

### SB-082 — FIG.A System architecture (LAYERED)
- #arch · Component · 5 tiers CLIENT(WEB APP/MOBILE) → API GATEWAY(orange) → SERVICES(AUTH/POSTS/SEARCH) → DATA(`▤` POSTGRES/REDIS/S3, dashed) with vertical arrow connectors; orange `5×5` corner ticks on client boxes.
- **Org-mapping:** COMPONENT — `Diagram` (architecture).

### SB-083 — FIG.B Flowchart (DECISION)
- #arch · Component · pill START (`border-radius:20px`) → WRITE DRAFT → orange rotated `80×80` diamond `REVIEW OK?` → elbow branch → NO↺ dashed EDIT / YES✓ ink PUBLISH.
- **Org-mapping:** COMPONENT — `Diagram` (flowchart).

### SB-084 — FIG.C UML class (INHERITANCE)
- #arch · Component · two `200px` class boxes (Content parent ink header / Post child orange header), `−` fields / `+` methods compartments; hollow-triangle inheritance arrow (`border-bottom:13px #0B0B0B`).
- **Org-mapping:** COMPONENT — `Diagram` (UML).

### SB-085 — FIG.D Sequence (REQUEST FLOW)
- #arch · Component · USER/API/DB actor boxes; dashed `#C2C2BD` lifelines; solid ink + orange call arrows, dashed `#9A9A95` return arrows (GET /posts, query(), rows, 200 JSON) with CSS-triangle heads.
- **Org-mapping:** COMPONENT — `Diagram` (sequence).

### SB-086 — FIG.E Entity-relation (1 ──< ∞)
- #arch · Component · USER (ink header) & POST (orange header) entity tables; rows `⚷ PK #FF5114`, `FK #7A7A76`; crow's-foot relation `1 — <∞`.
- **Org-mapping:** COMPONENT — `Diagram` (ER).

### SB-087 — FIG.F Annotated schematic (LEADER CALLOUTS)
- #arch · Component · central `170×180` hatched figure with `┌┐└┘` corners + Chakra `CORE`/`ENGINE`; 4 leader callouts (SCHEDULER/CACHE/ROUTER/RENDERER) = `46×1` line + orange `7×7` dot + mono title/desc; 26px grid bg.
- **Org-mapping:** COMPONENT — `Diagram` (annotated schematic).

### SB-088 — FIG.G Build pipeline (SEQUENTIAL)
- #arch · Component · 4 stage boxes (01 Ingest/02 Parse/03 Render/04 Ship-inverted) with orange `→` between; mono index `#FF5114` + Archivo 700 15px + mono sub.
- **Org-mapping:** COMPONENT — `Diagram` (pipeline).

### SB-089 — `data-om-raster` export convention
- #arch · Chrome · every diagram wrapper carries `data-om-raster=""` → engine hook to rasterize/export diagrams to image (guide §160). 7 instances confirmed.
- **Org-mapping:** CHROME — engine export attribute.

---

## GROUP 13 · #forms

### SB-090 — Text input
- #forms · Component-Variant · `<label>` mono 10px `.12em` `#7A7A76` + `<input>` `border:1px solid #C9C9C4;padding:12px 14px` mono 13px `outline:none`; **focus** `border-color:#FF5114`.
- **Org-mapping:** COMPONENT — form input (no native Org form).

### SB-091 — Search row
- #forms · Component-Variant · `border:1px solid #C9C9C4` row with `⌕ #9A9A95` icon + borderless input; focus orange.
- **Org-mapping:** COMPONENT — search field.

### SB-092 — Input error state
- #forms · State · label `#D23B2B`; `<input value=taken_name border:1px solid #D23B2B;background:#FCEEEC>` + `✕ THIS HANDLE IS UNAVAILABLE` mono 10px `#D23B2B`.
- **Org-mapping:** COMPONENT — input error state.

### SB-093 — Select
- #forms · Component-Variant · `<select appearance:none>` `border:1px #C9C9C4;padding:12px 14px` + `▾` absolute chevron.
- **Org-mapping:** COMPONENT — select control.

### SB-094 — Textarea
- #forms · Component-Variant · `<textarea rows=3 resize:vertical>` same skin.
- **Org-mapping:** COMPONENT — textarea.

### SB-095 — Checkbox (checked + unchecked)
- #forms · Component-Variant · checked `18×18;border:1.5px #0B0B0B;background:#FF5114;✓` 700; unchecked `border:1.5px #C9C9C4;#fff`.
- **Org-mapping:** NATIVE — checkbox ⇐ `[ ]/[X]/[-]` (guide §128).

### SB-096 — Toggle switch
- #forms · Component-Variant · `38×20 #FF5114` track + `16×16 #fff` knob `right:2px` (ON state).
- **Org-mapping:** COMPONENT — toggle (no native form).

### SB-097 — Filter tabs (interactive)
- #forms · Component/State · `sc-for tabItems` buttons; active `border:1px #0B0B0B;background:#0B0B0B;color:#fff`, inactive `border #C9C9C4;#fff;color #3A3A37`; readout `ACTIVE FILTER — {activeTab}`. Data All/Editorial/Tutorials/Changelog.
- **Org-mapping:** COMPONENT — tabs/filter component.

### SB-098 — Newsletter band
- #forms · Component · `bg #0B0B0B;color #EDEDEA;padding:28px 26px`; `*ONLY VALUABLE RESOURCES` mono `#7A7A74`; Chakra 700 24px uppercase title; underline-only email input (`border-bottom:1px #4a4a46`) + orange SUBSCRIBE (hover `#fff`).
- **Org-mapping:** COMPONENT — newsletter/subscribe block.

---

## GROUP 14 · #overlays (triggers in-section; surfaces rendered via `sc-if` at end of doc)

### SB-099 — Modal / dialog
- #overlays · Component · `sc-if modalActive`: backdrop `position:fixed;inset:0;background:rgba(11,11,11,.55);animation:bpfade .15s`; card `max-width:460px;border:1px solid #0B0B0B;animation:bpfade .2s` + 4 orange corner brackets `22×5`+`5×22` offset `-2px`; header (mono tag + `×` close), body (Archivo 800 24px title + 14px), footer 2 buttons CANCEL/action.
- **Variants:** **dialog** (tag `DIALOG · REF—07`, title "Unlock the full article", orange `SUBSCRIBE →` btn) and **alert/destructive** (tag `CONFIRM · ERR—04`, title `#D23B2B` "Delete this post?", `#D23B2B` DELETE btn).
- **Org-mapping:** COMPONENT — `Modal`/`Dialog`.

### SB-100 — Alert (destructive) trigger + variant
- #overlays · Component-Variant · trigger button `border:1.5px #D23B2B;color #D23B2B` (hover `#FCEEEC`); opens SB-099 alert variant.
- **Org-mapping:** COMPONENT — destructive confirm.

### SB-101 — Toast / snackbar
- #overlays · Component · `sc-if toast`: `position:fixed;right:24px;bottom:24px;background:#0B0B0B;color:#fff;border-left:4px solid #FF5114;animation:bptoast .2s;box-shadow:0 8px 30px rgba(0,0,0,.25)`; `8×8 #2E9E5B` + "Saved successfully" + `REF—09 · 2S AGO` + `×`. Auto-dismiss 2.8s.
- **Org-mapping:** COMPONENT — `Toast`.

### SB-102 — Tooltip / hover
- #overlays · Component · `.bp-tip` trigger `border-bottom:1px dashed #0B0B0B;cursor:help`; `.bp-tip-body` absolute `bg #0B0B0B;color #fff` mono 10px `opacity:0;transition:.15s`, shown via CSS `.bp-tip:hover .bp-tip-body{opacity:1}`.
- **Org-mapping:** COMPONENT — `Tooltip` (also inline in article body SB-126).

### SB-103 — Accordion / FAQ
- #overlays · Component · `sc-for faq`; rows `border-bottom:1px solid #EFEFEA`; button (Archivo 600 15px Q + `30×30` sign box) toggles; sign `+`→`×`, box `#0B0B0B`→`#FF5114` when open; body animates `max-height 0→220px;opacity;transition:all .28s`. 5 Q&A.
- **Org-mapping:** COMPONENT — `Accordion` (⇐ `:LOGBOOK:`/drawer collapsible, guide §153).

---

## GROUP 15 · #blog (page-level compositions)

### SB-104 — Nav bar
- #blog · Chrome · `bg #fff;border:1px solid #C9C9C4` flex; brand glyph + Chakra `org2html`; mono 12px links (active `#0B0B0B`, rest `#7A7A76`, hover `#FF5114`); `⌕` + orange SUBSCRIBE.
- **Org-mapping:** CHROME — site nav bar.

### SB-105 — Breadcrumb
- #blog · Chrome · mono 11px `.08em`; `HOME #0B0B0B / EDITORIAL / DESIGNING SYSTEMS #FF5114` with `/ #C2C2BD` separators (current = orange).
- **Org-mapping:** CHROME — breadcrumb trail.

### SB-106 — Article header
- #blog · Component · `border-top:2px solid #0B0B0B`; meta row `ARTICLE · 04/14` / `NOV 04 2025 · 12 MIN READ`; `<h1>` Archivo 800 `clamp(32px,5vw,60px)` `max-width:18ch`; 17px deck; author row (`34×34` avatar TB + name + `PRINCIPAL DESIGNER`) + share `↗`/`♡` `36×36` buttons.
- **Org-mapping:** NATIVE — article header ⇐ `#+TITLE` + `#+DATE`/`#+AUTHOR` + subtitle.

### SB-107 — Sticky TOC rail
- #blog · Chrome · `<aside position:sticky;top:20px;border:1px solid #C9C9C4`; header `ON THIS PAGE`; items mono index + title; active = `border-left:2px solid #FF5114;background:#FFF4EF`, rest `border-left:transparent`.
- **Org-mapping:** CHROME — `<nav class=org-toc>` (active orange left-border, guide §147).

### SB-108 — Pull-quote
- #blog · Component-Variant · `<blockquote bg #0B0B0B;color #fff;padding:20px 24px`; orange corner bracket `18×4`+`4×18` TL; Archivo 600 20px quote + `— DESIGN PRINCIPLE 01` mono `#FF5114`.
- **Org-mapping:** NATIVE — emphasis `#+BEGIN_QUOTE` ⇐ pull-quote variant (guide §116).

### SB-109 — Inline figure + caption
- #blog · Component-Variant · 180px diagonal-hatch `#F4F4F1` + `┌┐└┘` corners + `[ FIG.01 · DIAGRAM ]`; caption mono 10px `#7A7A76` `FIG.01 — …`.
- **Org-mapping:** NATIVE — `<figure>/<figcaption>` ⇐ image + `#+CAPTION`.

### SB-110 — Pagination
- #blog · Component · hairline-seam row of mono buttons `← / 01(active ink) / 02 / 03 / … / 14 / →`; hover `#F4F4F1`.
- **Org-mapping:** COMPONENT — pagination (page-level).

---

## GROUP 16 · #layouts (8 full-page templates; each = ink header bar + composed body)

### SB-111 — Layout 01 · Magazine home
- #layouts · Layout · nav + hero split (featured editorial + hatched cover w/ NEW) + 4-col recent grid + ink TRENDING rail; 30px o2h-grid bg.
- **Org-mapping:** CHROME — homepage template.

### SB-112 — Layout 02 · Archive / index
- #layouts · Layout · `ARCHIVE` Chakra title + count + search; filter chips (ALL active, joined outline); `sc-for archiveCards` 3-col card grid; centered pager.
- **Org-mapping:** CHROME — archive/index template.

### SB-113 — Layout 03 · Editorial feature
- #layouts · Layout · `border:1px solid #0B0B0B`; `grid 64px/1.1fr/1fr`: orange vertical `DEEP DIVE` spine + text column (serial meta, Archivo 800 title, 2-up stat foot) + grid-bg figure with big Chakra `07/` index + crosshairs.
- **Org-mapping:** CHROME — editorial feature template.

### SB-114 — Layout 04 · Feed / list
- #layouts · Layout · chronology header; `sc-for feedRows` rows `grid 120px/1fr/auto`: date / (Archivo 700 title + excerpt) / `CAT →` orange; hover `#FAFAF8`.
- **Org-mapping:** CHROME — feed/list template.

### SB-115 — Layout 05 · Author profile
- #layouts · Layout · `96×96` hatched avatar `TB` with 4 orange corner brackets; bio block; 2-up POSTS/READERS stat; 3-col works grid.
- **Org-mapping:** CHROME — author profile template.

### SB-116 — Layout 06 · Single article
- #layouts · Layout · top `4px` read-progress bar (`62% #FF5114`); `grid 180px/1fr/150px` = TOC rail (active orange left-border) + reading column (figure) + share rail (`↗/♡/⎘`).
- **Org-mapping:** CHROME — single-article template.

### SB-117 — Layout 07 · Category landing
- #layouts · Layout · orange banner (`+` mark, count, Chakra `TUTORIALS` uppercase, deck); 4-col subtopic counts (`#FF5114` numerals); 3-col article grid.
- **Org-mapping:** CHROME — category landing template.

### SB-118 — Layout 08 · Newsletter landing
- #layouts · Layout · `border:1px solid #0B0B0B`; 48px o2h-grid field + 4 grey `+` crosshairs; centered white card with 4 orange corner brackets (`22×5`); `▙ JOIN 8,200 READERS`, Archivo 800 title, hairline email+SUBSCRIBE, fine print.
- **Org-mapping:** CHROME — newsletter/conversion landing template.

---

## GROUP 17 · #states

### SB-119 — Skeleton: card (shimmer)
- #states · Animation/State · image + 3 text bars `linear-gradient(90deg,#E6E6E2 25%,#F2F2EF 50%,#E6E6E2 75%);background-size:200% 100%;animation:bpshimmer 1.3s infinite`; `┌` ghost corner `#C2C2BD`.
- **Org-mapping:** COMPONENT — `Skeleton` (card).

### SB-120 — Skeleton: list (shimmer)
- #states · Animation/State · 2 rows of `38×38` avatar block + two text bars, same shimmer.
- **Org-mapping:** COMPONENT — `Skeleton` (list).

### SB-121 — Skeleton: scanline placeholder
- #states · Animation/State · `96px #0B0B0B` plate + `bpscan .9s` orange scanline + `DECODING…` mono `#FF8B5C`.
- **Org-mapping:** COMPONENT — `Skeleton`/loading (scanline).

### SB-122 — Spinner: square
- #states · Animation · `30×30;border:3px solid #E2E2DD;border-top-color:#FF5114;animation:bpspin .8s linear infinite`.
- **Org-mapping:** COMPONENT — `Spinner` (square).

### SB-123 — Spinner: dot-pulse
- #states · Animation · three `10×10 #FF5114` squares `animation:bppulse 1s infinite` staggered `.2s`/`.4s`.
- **Org-mapping:** COMPONENT — `Spinner` (dot-pulse).

### SB-124 — Progress: determinate
- #states · Component-Variant · label+`62%`; track `8px #E2E2DD` + `62% #FF5114` fill.
- **Org-mapping:** COMPONENT — `Progress` (determinate) (⇐ statistics cookie, guide §156).

### SB-125 — Progress: indeterminate
- #states · Animation · `SYNCING…`; track `#E2E2DD;overflow:hidden` + `40% #0B0B0B animation:bpindet 1.1s ease-in-out infinite`.
- **Org-mapping:** COMPONENT — `Progress` (indeterminate).

### SB-126 — Empty state
- #states · State · `54×54` `border:1.5px #0B0B0B` + `⌀` `#C2C2BD`; Archivo 700 "No posts yet"; body; BROWSE ALL ghost button.
- **Org-mapping:** COMPONENT — `Empty` state.

### SB-127 — 404 state
- #states · State · inverted `#0B0B0B`; orange corner bracket; Chakra 700 54px `404 #FF5114`; "Page not found"; orange `← BACK TO HOME`.
- **Org-mapping:** COMPONENT — `404` state.

### SB-128 — Offline / error state
- #states · State · `54×54 #FCEEEC;border:1.5px #D23B2B;!`; "Connection lost" `#A82A1C`; `RECONNECTING` + `8×8 #D23B2B animation:bppulse 1s`.
- **Org-mapping:** COMPONENT — `Offline`/error state.

### SB-129 — Cookie consent banner
- #states · Component · `border:1px solid #0B0B0B` card; body + `Learn more ↗ #FF5114`; ACCEPT (ink) / DECLINE (outline) buttons.
- **Org-mapping:** CHROME — cookie banner (global utility).

### SB-130 — Avatar group
- #states · Component · three `32×32` avatars `border:2px solid #fff;margin-left:-10px` overlap (TB ink, CD slate, +5 orange).
- **Org-mapping:** COMPONENT — avatar group.

### SB-131 — Notification badge
- #states · Component · `34×34` icon box `✦` + absolute `min-width:16px;height:16px;background:#FF5114;color:#0B0B0B` count `3` top-right.
- **Org-mapping:** COMPONENT — notification badge.

### SB-132 — Back-to-top FAB
- #states · Component · `44×44;background:#0B0B0B;color:#fff;↑` (hover orange). 44px hit target.
- **Org-mapping:** COMPONENT — back-to-top FAB (global utility).

### SB-133 — Read-progress ring
- #states · Component · `44×44;border:1.5px #0B0B0B;border-radius:50%`; orange arc via `clip-path:polygon(...)` `border:1.5px #FF5114`; `62%` center mono.
- **Org-mapping:** COMPONENT — read-progress ring.

---

## GROUP 18 · #media

### SB-134 — Figure: captioned + crop marks
- #media · Media · 240px hatched `#F4F4F1` + `┌┐└┘` 15px corners + `⊕ ZOOM` badge + `[ IMAGE · 16:9 ]`; caption row `FIG.01 — … / ↗ SOURCE`; `onClick=openFig0` → lightbox.
- **Org-mapping:** NATIVE — `<figure>` ⇐ image + `#+CAPTION` (crop-marked).

### SB-135 — Figure: side-caption
- #media · Media · 120px dark `#0B0B0B` plate w/ white dot-matrix + `[ DARK PLATE ]`; side block `SIDE CAPTION #FF5114` + 12.5px annotation.
- **Org-mapping:** NATIVE — figure with side `#+CAPTION` (`#+ATTR_HTML` layout).

### SB-136 — Figure: full-bleed band
- #media · Media · 160px `-45deg` hatch `#F4F4F1;border:1px #C9C9C4`; `FULL-BLEED BAND · EDGE TO EDGE` + `[ PANORAMIC IMAGE ]` + `2400 × 800` dims.
- **Org-mapping:** NATIVE — full-bleed figure (`#+ATTR_HTML :class full-bleed`).

### SB-137 — Gallery grid
- #media · Media · `sc-for slides` 4-col hatched/grid/dot/-45° tiles (per `slideStyles`), `cursor:zoom-in`, `onClick` → lightbox; mono index `n` + sub.
- **Org-mapping:** COMPONENT — `Gallery` grid.

### SB-138 — Carousel / slider
- #media · Media · `border:1px solid #0B0B0B`; header w/ `{counter}` (`01 / 04`); 300px viewport + track `transform:translateX(-N*100%);transition:.45s cubic-bezier(.5,0,.2,1)`; `sc-for slides` (Chakra label + `[ PLACEHOLDER IMAGE ]`); prev/next `42×42` ink arrows (hover orange); dot nav (active `26px #FF5114`, rest `10px #C9C9C4`); thumbnail rail (active `2px #FF5114` border).
- **Org-mapping:** COMPONENT — `Carousel`/slider.

### SB-139 — Lightbox / zoom
- #media · Media · `sc-if lightboxActive`: `position:fixed;inset:0;z-index:100;background:rgba(8,8,8,.92);animation:bpfade .18s`; top bar (`8×8 #FF5114` + `{lbNum · lbLabel}` + ZOOM toggle + `×`); stage `min(70vw,820px)×min(70vh,520px)` with 4 orange corner brackets, image `transform:scale(1)↔scale(1.9);transition:.35s;cursor zoom-in/out`; prev/next `46×46` arrows; bottom meta `LIGHTBOX · REF—LB`.
- **Org-mapping:** COMPONENT — `Lightbox`/image-zoom.

---

## GROUP 19 · #footer

### SB-140 — Footer pattern (link columns)
- #footer · Chrome · `bg #fff;border:1px solid #C9C9C4`; hairline `minmax(160px,1fr)` columns: brand+blurb, SECTIONS, LEGAL, SOCIAL (mono `↗` links, hover `#FF5114`).
- **Org-mapping:** CHROME — global footer.

### SB-141 — Footer bottom bar + barcode strip
- #footer · Decoration/Chrome · `border-top:1px solid #EFEFEA` row: `© 2025 · ALL RIGHTS RESERVED · ORG2HTML.DS` + `120×20` barcode strip `repeating-linear-gradient(90deg,#0B0B0B…)`.
- **Org-mapping:** CHROME — footer legal + barcode decoration (SB-037).

### SB-142 — Footer masthead glyph
- #footer · Decoration · 4 orange `9×9 #FF5114` corner squares + Chakra Petch 700 `clamp(70px,18vw,230px)` uppercase `ORG2HTML`.
- **Org-mapping:** CHROME — oversized footer masthead.

---

## ANIMATIONS — every `@keyframes` (defined in shell `<style>`, lines 508–516)

| Keyframe | Definition | Used by | Count |
|---|---|---|---|
| `bpblink` | `0%,49%{opacity:1}50%,100%{opacity:.15}` | sidebar status dot (SB-005), status pill (SB-044), button loading (SB-053), terminal cursor (SB-078) | 4× |
| `bpscan` | `0%{translateY(0)}100%{translateY(14px)}` | scanline deco (SB-036), scanline skeleton (SB-121) | 2× |
| `bptoast` | `from{translateY(20px);opacity:0}to{translateY(0);opacity:1}` | toast (SB-101) | 1× |
| `bpfade` | `from{opacity:0}to{opacity:1}` | modal backdrop+card (SB-099), lightbox (SB-139) | 3× |
| `bpmarq` | `0%{translateX(0)}100%{translateX(-50%)}` | **DEFINED BUT UNUSED** in the book (marquee) | 0× |
| `bpshimmer` | `0%{bg-position:200% 0}100%{bg-position:-200% 0}` | skeletons (SB-119/120) | 10× |
| `bpspin` | `to{rotate(360deg)}` | square spinner (SB-122) | 1× |
| `bpindet` | `0%{left:-40%}100%{left:100%}` | indeterminate progress (SB-125) | 1× |
| `bppulse` | `0%,100%{opacity:.25}50%{opacity:1}` | dot-pulse (SB-123), offline reconnecting (SB-128) | 4× |

All 9 expected keyframes present. None are gated behind `prefers-reduced-motion` in the book (guide flags this as a Phase-4 engine requirement).

---

## DISCREPANCIES (HTML wins)

- **D-1 (deco count):** Cover (SB-013) and #deco header both label **"16"** decorations/motifs, but the kit renders **18 distinct decoration cards** (6+6+6 across Groups A/B/C). The guide also says "16 marks" yet lists 18 names. → Real count = **18**.
- **D-2 (component count):** Cover (SB-013) says `COMPONENTS — 50+`; the spec table (SB-066) says `COMPONENTS · 40+ PATTERNS`. Self-reported counts conflict.
- **D-3 (sections count):** Cover says `SECTIONS — 16`, but the sidebar nav + `data-screen-label` count is **19** (`00 COVER`…`18 FOOTER`). The grid section meta says "12 COLUMN" while the spec table says GRID "12 COLUMN / 44PX MODULE".
- **D-4 (bpmarq):** Guide lists `bpmarq` as a shipped animation; HTML **defines but never uses it** (0 usages).
- **D-5 (reduced-motion):** Guide mandates gating all `bp*` keyframes behind `prefers-reduced-motion`; the book does **not** include that media query.
- **D-6 (token roles minor):** Guide labels SIGNAL 300 "accents on DARK"; HTML swatch role = `ILLUSTRATION`. SIGNAL 100 role guide "tip-callout borders"; HTML `HOVER BG`. Hex values all match exactly.
- **All palette hexes, the 3 font families, the type scale, the code-syntax colours, and the 9 keyframes in the guide were verified present and exact in the HTML.**

---

## PER-SECTION COUNT
- 00 Global/Chrome (shell): 8 (SB-001…008)
- 01 #cover: 6 (SB-009…014)
- 02 #color: 4 (SB-015…018)
- 03 #type: 3 (SB-019…021)
- 04 #grid: 5 (SB-022…026)
- 05 #deco: 19 (SB-027…045) — 18 decorations + DO/DON'T
- 06 #buttons: 8 (SB-046…053)
- 07 #tags: 3 (SB-054…056)
- 08 #callouts: 5 (SB-057…061)
- 09 #cards: 4 (SB-062…065)
- 10 #data: 2 (SB-066…067)
- 11 #code: 14 (SB-068…081)
- 12 #arch: 8 (SB-082…089) — 7 diagrams + raster note
- 13 #forms: 9 (SB-090…098)
- 14 #overlays: 5 (SB-099…103)
- 15 #blog: 7 (SB-104…110)
- 16 #layouts: 8 (SB-111…118)
- 17 #states: 15 (SB-119…133)
- 18 #media: 6 (SB-134…139)
- 19 #footer: 3 (SB-140…142)
- **TOTAL: 142 registered visual objects.**
