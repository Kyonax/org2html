# Org-mode Syntax Surface Audit — `@kyonax/org2html`

Exhaustive registry of every Org-mode construct that can appear in a `.org` file and
produce HTML on `ox-html` export. Each construct lists **all** authoring-form variants,
its target HTML element(s), the modifiers that change its rendering, and the current
support status in THIS engine.

- **Sources:** orgmode.org formal syntax spec (`org-syntax.html`) + Org manual chapters
  (Export-Settings, Hyperlinks/External/Internal-Links, Tables/Column-Width/Spreadsheet,
  Blocks, Creating-Footnotes, Macro-Replacement, Special-Symbols, Subscripts-and-Superscripts,
  Timestamps, HTML-Export).
- **Engine grounded from:** `src/parser/{lexer,parser,metadata,ast}.ts`,
  `src/renderer/{html-renderer,sanitizer,template}.ts`.
- **Support legend:** SUPPORTED = parsed AND rendered correctly · PARTIAL = recognized but
  incomplete/buggy · MISSING = not handled (falls through to paragraph/text or dropped).

---

## Category 1 — Heading / Section

### ORG-001 — Headline
**Category:** Heading/Section
**Authoring forms:**
- `* Title` … `****** Title` (1–N leading `*` then a space = nesting level)
- `* TODO Title` / `* DONE Title` (TODO keyword as first word)
- `* TODO [#A] Title` (priority cookie `[#A]`/`[#B]`/`[#C]` after keyword)
- `* Title :tag1:tag2:` (tags, colon-delimited, right-aligned)
- `* Title [1/3]` / `* Title [50%]` (statistics cookie in headline)
- `* COMMENT Title` (COMMENT keyword → whole subtree excluded from export)
- `* Title` with `:ARCHIVE:` tag (archived subtree; export controlled by `arch:` OPTION)
**Target HTML:** `<h1>`…`<h6>` (clamped to h6); ox-html wraps each in `<div class="outline-N">` + `<h N id="org…">`; tags → `<span class="tag"><span class="tagname">…</span></span>`; TODO → `<span class="todo TODO">`; priority → `<span class="priority">`.
**Modifiers:** `#+OPTIONS: H:` (max headline level → list), `num:` (section numbers), `todo:`, `pri:`, `tags:`, `arch:`, `#+SELECT_TAGS`/`#+EXCLUDE_TAGS`; `:CUSTOM_ID:` property sets the anchor id.
**Support:** PARTIAL — `lexer.ts` matches `^(\*+)\s+`; `parser.ts parseHeading` extracts level + trailing `:tags:` only. No TODO keyword, no priority, no in-headline statistics cookie, no COMMENT, no archive handling. Renderer emits bare `<hN id=slug>` (no outline div, no tag/todo spans).

### ORG-002 — Section (content under a headline)
**Category:** Heading/Section
**Authoring forms:**
- The block of elements between a headline and the next headline of equal/higher level.
**Target HTML:** `<div class="outline-text-N" id="text-N">…</div>` inside the outline container.
**Modifiers:** inherits headline OPTIONS.
**Support:** PARTIAL — children are rendered flat; no per-section `<div>` nesting/containment.

### ORG-003 — Inlinetask
**Category:** Heading/Section
**Authoring forms:**
- A headline at level ≥ `org-inlinetask-min-level` (default 15 `*`), e.g. `*************** TASK`
- Optionally closed by a trailing `*************** END` line.
**Target HTML:** ox-html `<div class="inlinetask">` (with `org-inlinetask` module).
**Modifiers:** `#+OPTIONS: inline:` (include/exclude inline tasks).
**Support:** MISSING — treated as an ordinary deep headline.

---

## Category 2 — Greater Element (block / container)

### ORG-004 — Plain list (container)
**Category:** Greater Element
**Authoring forms:**
- Unordered with `-` bullet
- Unordered with `+` bullet
- Unordered with `*` bullet (only when indented; `*` at col 0 is a headline)
- Ordered with `1.` … `N.`
- Ordered with `1)` … `N)`
- Nested lists by increasing indentation
- Lists separated by ≤1 blank line stay one list; 2 blank lines end it
**Target HTML:** `<ul>` / `<ol>` containing `<li>`.
**Modifiers:** `[@N]` counter set changes `<ol start>`; `#+ATTR_HTML: :class …`.
**Support:** PARTIAL — `lexer.ts` matches `^([-+*]|\d+[.)])\s+`; `parser.ts parseList` groups only same-indent items → **no nesting**. `ordered` flag → `<ul>`/`<ol>`.

### ORG-005 — List item (item variants)
**Category:** Greater Element
**Authoring forms:**
- Plain item: `- text`
- Descriptive item: `- term :: description` (the ` :: ` separator)
- Checkbox unchecked: `- [ ] text`
- Checkbox checked: `- [X] text`
- Checkbox partial: `- [-] text`
- Counter-set: `1. [@5] text` / `- [@a] text` (force item number/letter)
- Item with tag + checkbox + counter combined: `- [@3] [X] term :: desc`
**Target HTML:** `<li>` for plain/checkbox/counter; descriptive lists → `<dl><dt>term</dt><dd>description</dd>`; checkbox → `<code>[ ]</code>`/`<code>[X]</code>` (or `<input type=checkbox>` with attr); counter → `<li value="N">`.
**Modifiers:** `#+OPTIONS:` none specific; checkbox display per ox-html.
**Support:** PARTIAL — only plain items. **No** descriptive (`::`), **no** checkbox, **no** counter `[@n]`. (`sanitizer.ts` does allow `value`/`start`/`type`/`checked` attrs, so the renderer *could* emit them, but the parser never produces them.)

### ORG-006 — Quote block
**Category:** Greater Element
**Authoring forms:**
- `#+BEGIN_QUOTE` … `#+END_QUOTE`
- lowercase `#+begin_quote` … `#+end_quote`
**Target HTML:** `<blockquote>`.
**Modifiers:** `#+ATTR_HTML`, optional citation line.
**Support:** SUPPORTED — `parseBlock` maps `QUOTE` → `quote` → `<blockquote>`.

### ORG-007 — Verse block
**Category:** Greater Element
**Authoring forms:**
- `#+BEGIN_VERSE` … `#+END_VERSE` (whitespace + line breaks preserved)
**Target HTML:** `<p class="verse">` (ox-html preserves newlines as `<br>` and leading spaces as `&nbsp;`).
**Modifiers:** `#+ATTR_HTML`.
**Support:** PARTIAL — maps to `<p class="verse">` but does NOT preserve line breaks/leading whitespace (content is inline-parsed + space-collapsed).

### ORG-008 — Center block
**Category:** Greater Element
**Authoring forms:**
- `#+BEGIN_CENTER` … `#+END_CENTER`
**Target HTML:** `<div class="org-center">` (engine emits `<div class="center">`).
**Modifiers:** `#+ATTR_HTML`.
**Support:** SUPPORTED — `center` → `<div class="center">`.

### ORG-009 — Special / admonition block (custom greater block)
**Category:** Greater Element
**Authoring forms:**
- `#+BEGIN_<NAME>` … `#+END_<NAME>` for any NAME not in the standard set (e.g. `NOTE`, `WARNING`, `TIP`, `IMPORTANT`, `ABSTRACT`)
- May carry parameters: `#+BEGIN_<NAME> PARAMS`
**Target HTML:** ox-html `<div class="NAME">…</div>` (lowercased class).
**Modifiers:** `#+ATTR_HTML`.
**Support:** MISSING — `parseBlock` falls through to `quote` for any non-{QUOTE,EXAMPLE,VERSE,CENTER} block → wrong `<blockquote>` output.

### ORG-010 — Dynamic block
**Category:** Greater Element
**Authoring forms:**
- `#+BEGIN: NAME PARAMETERS` … `#+END:` (note the colon, not underscore)
- e.g. `#+BEGIN: clocktable :scope file` … `#+END:`
**Target HTML:** depends on generated content (e.g. clocktable → `<table>`).
**Modifiers:** block parameters; regenerated by Org, not authored content.
**Support:** MISSING — lexer regex `#\+BEGIN_(\w+)` requires `_`, so `#+BEGIN:` is not matched → treated as paragraph text.

### ORG-011 — Footnote definition
**Category:** Greater Element
**Authoring forms:**
- `[fn:LABEL] definition text` at column 0 (definition continues until next footnote/headline/2 blank lines)
- Numeric label: `[fn:1] definition`
**Target HTML:** collected into `<div id="footnotes"><h2>Footnotes</h2><div class="footdef">…</div></div>`.
**Modifiers:** `#+OPTIONS: f:` (include footnotes); footnote section placement.
**Support:** MISSING — no parsing of definition lines; renderer fabricates placeholder text `Footnote <label>` for any reference instead of using a real definition.

### ORG-012 — Table
**Category:** Greater Element
**Authoring forms:**
- Org pipe table: `| a | b |` rows
- Header/body separator rule: `|---+---|` / `|---|`
- table.el ASCII table: `+----+----+` border + `| … |` cells (starts with a `+-` line)
- Column-group row: `| / | < | > |` (group markers)
- Alignment/width cookie row: `| <r> | <l10> | <c> |`
- `#+TBLFM:` formula line directly below the table
- `#+CAPTION:` affiliated keyword above the table
- `#+NAME:` affiliated keyword above (for cross-references)
- `#+ATTR_HTML:` affiliated keyword above (HTML attributes)
**Target HTML:** `<table>` `<colgroup><col …>` `<thead><tr><th scope="col">` `<tbody><tr><td>`; caption → `<caption class="t-above">`.
**Modifiers:** `#+ATTR_HTML: :class :border :rules :frame :width`; `#+OPTIONS: |:` (include tables); `org-html-table-default-attributes`.
**Support:** PARTIAL — pipe tables only, header detected from first `|---|` rule. **No** table.el, **no** alignment/width cookies (rendered as literal cells), **no** `#+TBLFM`, **no** `#+CAPTION`/`#+NAME`/`#+ATTR_HTML`, **no** colgroup. (See Category 9 for per-row/cell items.)

---

## Category 3 — Lesser Element (leaf)

### ORG-013 — Source block (babel)
**Category:** Lesser Element
**Authoring forms:**
- `#+BEGIN_SRC lang` … `#+END_SRC`
- `#+BEGIN_SRC lang -n -r -l "fmt"` (switches: `-n` line numbers, `+n` continued, `-r` remove refs, `-l` label fmt, `-i`, `-k`)
- `#+BEGIN_SRC lang :tangle … :exports … :results …` (babel header args)
- `#+HEADER:` lines preceding the block
- bare `#+BEGIN_SRC` (no language)
**Target HTML:** `<pre class="src src-LANG">…</pre>` (with `<span class="linenr">` if `-n`).
**Modifiers:** `#+ATTR_HTML`, `#+CAPTION`, `#+NAME`; `#+OPTIONS:` n/a; `org-html-htmlize-output-type`.
**Support:** PARTIAL — single-word language captured; **switches and header args ignored**. Highlighted via Shiki (`code-highlight.ts`); when highlight disabled → `<pre><code class="language-…">`.

### ORG-014 — Example block
**Category:** Lesser Element
**Authoring forms:**
- `#+BEGIN_EXAMPLE` … `#+END_EXAMPLE`
- `#+BEGIN_EXAMPLE -n` (with line-number/ref switches)
**Target HTML:** `<pre class="example">` (literal, escaped).
**Modifiers:** `-n`/`+n` switches; `#+ATTR_HTML`.
**Support:** PARTIAL — mapped to `<pre class="example">`, BUT content is run through `parseInlineMarkup` (should be literal/escaped) → emphasis/markup inside an example is wrongly interpreted.

### ORG-015 — Export block
**Category:** Lesser Element
**Authoring forms:**
- `#+BEGIN_EXPORT html` … `#+END_EXPORT` (raw HTML passthrough)
- `#+BEGIN_EXPORT latex` / `ascii` / other backend (dropped for non-matching backend)
**Target HTML:** raw verbatim insertion when backend = html; otherwise omitted.
**Modifiers:** backend name selects inclusion.
**Support:** MISSING — `parseBlock` falls through to `quote` → wraps raw HTML in `<blockquote>` and escapes it (wrong).

### ORG-016 — Comment block
**Category:** Lesser Element
**Authoring forms:**
- `#+BEGIN_COMMENT` … `#+END_COMMENT` (never exported)
**Target HTML:** none (omitted from output).
**Modifiers:** none.
**Support:** MISSING — falls through to `quote` and IS rendered (should be dropped entirely).

### ORG-017 — Comment line
**Category:** Lesser Element
**Authoring forms:**
- `# comment text` (hash + space at line start)
- `#` (lone hash, blank comment)
**Target HTML:** none (omitted).
**Modifiers:** none.
**Support:** MISSING — body-level `# text` becomes a paragraph TEXT token and is rendered. (Only top-of-file `#+KEY:` lines are special-cased in metadata.)

### ORG-018 — Fixed-width area
**Category:** Lesser Element
**Authoring forms:**
- `: text` (colon + space at line start; consecutive lines merge)
- `:` (lone colon = blank fixed-width line)
**Target HTML:** `<pre class="example">` (same as example block).
**Modifiers:** `#+OPTIONS: ::` (include fixed-width).
**Support:** MISSING — lexer’s drawer regex `^:(\w+):$` won’t match `: text`; line becomes paragraph text.

### ORG-019 — Horizontal rule
**Category:** Lesser Element
**Authoring forms:**
- `-----` (five or more hyphens on their own line)
**Target HTML:** `<hr>`.
**Modifiers:** `#+ATTR_HTML`.
**Support:** MISSING — becomes a paragraph (`<p>-----</p>`).

### ORG-020 — LaTeX environment
**Category:** Lesser Element
**Authoring forms:**
- `\begin{NAME}` … `\end{NAME}` (e.g. `equation`, `align`, `figure`)
- `\begin{NAME}EXTRA` (extra args after the brace)
**Target HTML:** verbatim LaTeX wrapped for MathJax: `\begin{…}…\end{…}` inside the page (rendered client-side).
**Modifiers:** `#+OPTIONS: tex:` (`t`/`nil`/`verbatim`/`dvipng`/`dvisvgm`/`imagemagick`/`mathjax`), `#+HTML_MATHJAX`.
**Support:** MISSING — `\begin{…}` lines become paragraph text.

### ORG-021 — Babel call line
**Category:** Lesser Element
**Authoring forms:**
- `#+CALL: name(args)`
- `#+CALL: name[inside-header](args)[end-header]`
**Target HTML:** the call’s `#+RESULTS` (varies).
**Modifiers:** header args.
**Support:** MISSING — `#+CALL:` not recognized as keyword; line ignored/treated as text.

### ORG-022 — Diary sexp
**Category:** Lesser Element
**Authoring forms:**
- `%%(SEXP)` at line start (e.g. `%%(diary-float t 4 2)`)
**Target HTML:** typically omitted/agenda-only.
**Modifiers:** none.
**Support:** MISSING — becomes paragraph text.

### ORG-023 — Node property
**Category:** Lesser Element
**Authoring forms:**
- `:NAME: VALUE` (inside a property drawer)
- `:NAME:` (empty value)
- `:NAME+: VALUE` (append to a multi-valued property)
- `:NAME+:` (append empty)
**Target HTML:** none by default; included only if `#+OPTIONS: prop:t` → `<table>` of properties.
**Modifiers:** `#+OPTIONS: prop:` (which/whether properties export).
**Support:** PARTIAL — `metadata.ts` parses `:NAME: VALUE` inside the leading property drawer only (no `+` append, no per-heading drawers); not rendered.

### ORG-024 — Paragraph
**Category:** Lesser Element
**Authoring forms:**
- Any run of unrecognized text lines separated by blank lines.
**Target HTML:** `<p>…</p>`.
**Modifiers:** `#+ATTR_HTML` on the line above.
**Support:** SUPPORTED — `parseParagraph` joins lines, inline-parses, → `<p>`.

### ORG-025 — Generic keyword line
**Category:** Lesser Element
**Authoring forms:**
- `#+KEY: VALUE` (any keyword not otherwise specialized)
- `#+KEY[OPTVAL]: VALUE` (optional value form)
**Target HTML:** none unless the key is meaningful (most are settings).
**Modifiers:** n/a.
**Support:** PARTIAL — only recognized in the leading metadata block (`metadata.ts`); unknown keys stashed in `metadata.properties` and otherwise ignored. Mid-document `#+KEY:` lines fall through as text.

---

## Category 4 — Object (inline)

### ORG-026 — Bold
**Authoring forms:** `*bold*`
**Target HTML:** `<b>` (ox-html) / engine `<strong>`.
**Modifiers:** `#+OPTIONS: *:` (emphasis on/off); Org emphasis border/PRE/POST rules.
**Support:** SUPPORTED — `EMPHASIS_TYPES['*']` → `<strong>`, with correct PRE/POST/border boundary logic.

### ORG-027 — Italic
**Authoring forms:** `/italic/`
**Target HTML:** `<i>` / engine `<em>`.
**Modifiers:** `#+OPTIONS: *:`.
**Support:** SUPPORTED — `/` → `<em>`.

### ORG-028 — Underline
**Authoring forms:** `_underline_`
**Target HTML:** `<span class="underline">` (ox-html) / engine `<u>`.
**Modifiers:** `#+OPTIONS: *:`.
**Support:** SUPPORTED — `_` → `<u>`. (Note: collides with subscript `a_b` since subscript is unimplemented.)

### ORG-029 — Strike-through
**Authoring forms:** `+strike+`
**Target HTML:** `<del>`.
**Modifiers:** `#+OPTIONS: *:`.
**Support:** SUPPORTED — `+` → `<del>` (with boundary rules; conflicts with `+` list bullet are resolved by lexer order).

### ORG-030 — Verbatim
**Authoring forms:** `=verbatim=` (literal; no nested markup)
**Target HTML:** `<code>`.
**Modifiers:** `#+OPTIONS: *:`.
**Support:** SUPPORTED — `=` → `<code class="verbatim">`, contents taken literally.

### ORG-031 — Code (inline)
**Authoring forms:** `~code~` (literal; no nested markup)
**Target HTML:** `<code>`.
**Modifiers:** `#+OPTIONS: *:`.
**Support:** SUPPORTED — `~` → `<code>`, contents literal.

### ORG-032 — Subscript
**Authoring forms:**
- `a_b` (single char)
- `a_{group}` (braced group)
- `a_word` (word until non-word char)
**Target HTML:** `<sub>`.
**Modifiers:** `#+OPTIONS: ^:{}` (braces only) / `^:nil` (off); `org-export-with-sub-superscripts`.
**Support:** MISSING — `_` is consumed as underline; no subscript parsing. (`metadata.ts` parses the `_:` OPTION but renderer never uses it.)

### ORG-033 — Superscript
**Authoring forms:**
- `a^b`
- `a^{group}`
- `a^word`
**Target HTML:** `<sup>`.
**Modifiers:** `#+OPTIONS: ^:{}` / `^:nil`.
**Support:** MISSING — `^` is plain text; no superscript parsing. (`^:` OPTION parsed but unused.)

### ORG-034 — Line break
**Authoring forms:** `\\` at end of line (backslash-backslash, optional trailing spaces)
**Target HTML:** `<br>`.
**Modifiers:** `#+OPTIONS: \n:` (preserve literal newlines).
**Support:** SUPPORTED — `parseInlineMarkup` emits `lineBreak` → `<br>`.

### ORG-035 — Regular (bracket) link
**Authoring forms:**
- `[[PATH]]` (no description)
- `[[PATH][DESCRIPTION]]`
- with search option: `[[file.org::*Heading]]`, `[[file.org::123]]`, `[[file.org::#custom-id]]`, `[[file.org::text search]]`
**Target HTML:** `<a href="…">desc</a>`.
**Modifiers:** `#+LINK` abbreviations; `org-html-link-org-files-as-html`.
**Support:** PARTIAL — `[[url][desc]]` / `[[url]]` parsed; image extension → `<img>`. No search-option resolution; href used verbatim; no protocol normalization.

### ORG-036 — Plain link
**Authoring forms:**
- `http://…`, `https://…`, `ftp://…`
- `mailto:user@host`, `news:group`, `doi:10.x`, `id:UUID`, `info:node`, `help:fn`, `shell:cmd`, `elisp:(form)`, `irc:/…`, `attachment:file`
**Target HTML:** `<a href="…">URL</a>` (mailto auto-linked).
**Modifiers:** `org-link-descriptive`; `#+OPTIONS: expand-links`.
**Support:** MISSING — bare URLs in text are not auto-linked (stay plain text).

### ORG-037 — Angle link
**Authoring forms:**
- `<http://example.com>`
- `<mailto:user@host>`
- `<file:/path>`
**Target HTML:** `<a href="…">`.
**Modifiers:** same as plain links.
**Support:** MISSING — angle-bracketed links not parsed (would be left as `&lt;…&gt;`).

### ORG-038 — Internal link
**Authoring forms:**
- `[[#custom-id]]` (CUSTOM_ID property target)
- `[[*Heading title]]` (headline target)
- `[[fuzzy text]]` (NAME keyword / heading / text search)
- `[[target]]` (matches a `<<target>>`)
- `[[#custom-id][description]]` (with description)
**Target HTML:** `<a href="#anchor">`.
**Modifiers:** target uniqueness; `org-html-prefer-user-labels`.
**Support:** MISSING — no internal-anchor resolution; `[[*Heading]]`/`[[#id]]` href used literally (broken anchors).

### ORG-039 — Radio link
**Authoring forms:**
- Plain text matching a previously declared `<<<radio target>>>` (auto-linked, no brackets)
**Target HTML:** `<a href="#radio-anchor">`.
**Modifiers:** radio target table.
**Support:** MISSING.

### ORG-040 — Image / inline image link
**Authoring forms:**
- `[[file:img.png]]` / `[[./img.png]]` (bare image link → inline `<img>`)
- `[[img.png][alt]]`
- `[[link][img.png]]` (image as a clickable link’s description)
- file extensions: `.png .jpg .jpeg .gif .svg .webp .bmp .tif(f)`
**Target HTML:** `<img src alt>`, or `<figure><img><figcaption>` when `#+CAPTION` present.
**Modifiers:** `#+CAPTION`, `#+NAME`, `#+ATTR_HTML: :width :height :alt :class`; `org-html-inline-images`.
**Support:** PARTIAL — bracket links whose URL ends in `png/jpg/jpeg/gif/svg/webp` → `<img src alt>` (alt = description). No figure/caption, no `#+ATTR_HTML`, no `.bmp/.tiff`, no image-as-link-description.

### ORG-041 — Footnote reference
**Authoring forms:**
- `[fn:LABEL]` (reference to a definition)
- `[fn:LABEL:DEFINITION]` (inline definition with label)
- `[fn::DEFINITION]` (anonymous inline definition)
**Target HTML:** `<sup><a id="fnr.N" href="#fn.N" class="footref">N</a></sup>` + entry in footnotes section.
**Modifiers:** `#+OPTIONS: f:`; footnote section position.
**Support:** PARTIAL — only `[fn:LABEL]` parsed; renders `<sup><a>` but with a **fabricated** definition (`Footnote <label>`). `[fn:LABEL:DEF]` and `[fn::DEF]` MISSING.

### ORG-042 — Citation
**Authoring forms:**
- `[cite:@key]`
- `[cite:@key1;@key2]`
- `[cite/style:@key]` (citation style, e.g. `[cite/t:@key]`)
- `[cite:prefix;@key;suffix]` (global/local prefix & suffix)
- `[cite:@key p. 7]` (key suffix)
**Target HTML:** depends on `#+CITE_EXPORT` processor → `<a>`/inline text + bibliography.
**Modifiers:** `#+CITE_EXPORT`, `#+BIBLIOGRAPHY`, `#+PRINT_BIBLIOGRAPHY`.
**Support:** MISSING — left as literal `[cite:@key]` text.

### ORG-043 — Inline source block
**Authoring forms:**
- `src_LANG{BODY}`
- `src_LANG[HEADERS]{BODY}`
**Target HTML:** `<code class="src src-LANG">`.
**Modifiers:** header args; highlight settings.
**Support:** MISSING.

### ORG-044 — Inline babel call
**Authoring forms:**
- `call_NAME(ARGS)`
- `call_NAME[inside-header](ARGS)[end-header]`
**Target HTML:** result of the call inline.
**Modifiers:** header args.
**Support:** MISSING.

### ORG-045 — Export snippet
**Authoring forms:**
- `@@html:RAW@@` (inserted verbatim for HTML backend)
- `@@latex:RAW@@` / `@@BACKEND:VALUE@@` (dropped for non-matching backend)
**Target HTML:** raw inline insertion when backend = html.
**Modifiers:** backend name.
**Support:** MISSING — left as literal text (and `@@` escaped).

### ORG-046 — Macro
**Authoring forms:**
- `{{{name}}}`
- `{{{name(arg1,arg2)}}}` (commas inside args escaped with `\`)
- predefined: `{{{title}}}`, `{{{author}}}`, `{{{email}}}`, `{{{date}}}`, `{{{date(FMT)}}}`, `{{{time(FMT)}}}`, `{{{modification-time(FMT,VC)}}}`, `{{{input-file}}}`, `{{{property(NAME)}}}`, `{{{property(NAME,SEARCH)}}}`, `{{{keyword(NAME)}}}`, `{{{n}}}`, `{{{n(NAME)}}}`, `{{{n(NAME,ACTION)}}}`
- defined via `#+MACRO: name replacement with $1 $2`
**Target HTML:** expanded inline text (any HTML the expansion yields).
**Modifiers:** `#+MACRO` definitions.
**Support:** MISSING — `{{{…}}}` left literal. (Note: engine instead supports a non-standard Hugo `{{< … >}}` shortcode — see ORG-076.)

### ORG-047 — Target
**Authoring forms:**
- `<<target name>>`
**Target HTML:** `<span id="anchor"></span>` (anchor for internal links).
**Modifiers:** referenced by `[[target name]]`.
**Support:** MISSING — rendered as escaped `&lt;&lt;…&gt;&gt;`.

### ORG-048 — Radio target
**Authoring forms:**
- `<<<radio target>>>` (every later occurrence of the text auto-links to it)
**Target HTML:** `<a id="anchor"></a>` + auto-links elsewhere.
**Modifiers:** none.
**Support:** MISSING.

### ORG-049 — Statistics cookie
**Authoring forms:**
- `[N/M]` (fraction, e.g. `[1/3]`)
- `[P%]` (percent, e.g. `[50%]`)
- empty `[/]` / `[%]` (auto-computed from checkboxes/TODO children)
**Target HTML:** `<code>[1/3]</code>` / `<span class="org-statistics-cookie">` text.
**Modifiers:** `#+OPTIONS: stat:`; recomputed from sub-items.
**Support:** MISSING — rendered as literal bracket text (in headlines and lists).

### ORG-050 — Timestamp
**Authoring forms:**
- Active date: `<2024-01-01 Mon>`
- Active date+time: `<2024-01-01 Mon 09:00>`
- Inactive: `[2024-01-01 Mon]` / `[2024-01-01 Mon 09:00]`
- Time range: `<2024-01-01 Mon 09:00-11:00>`
- Date range: `<2024-01-01 Mon>--<2024-01-03 Wed>`
- Diary sexp timestamp: `<%%(diary-float t 4 2)>`
- Repeater cumulate: `<2024-01-01 Mon +1w>` (units h/d/w/m/y)
- Repeater catch-up: `<… ++1w>`
- Repeater restart: `<… .+1w>`
- Warning/delay: `<… -1d>` / `<… --2d>`
- Combined repeater + warning: `<2024-01-01 Mon +1m -3d>`
**Target HTML:** `<span class="timestamp-wrapper"><span class="timestamp">…</span></span>`.
**Modifiers:** `#+OPTIONS: <:` (include timestamps), `timestamp:`.
**Support:** MISSING — rendered as literal text (`<…>` escaped).

### ORG-051 — LaTeX fragment
**Authoring forms:**
- Inline math TeX: `$x$` (single `$…$`, border rules)
- Inline math: `\(x\)`
- Display math: `$$x$$`
- Display math: `\[x\]`
- Command form: `\command` / `\command{args}` / `\command[opt]{args}`
**Target HTML:** preserved verbatim for MathJax, or rendered to image per `tex:` setting.
**Modifiers:** `#+OPTIONS: tex:` (`t`/`nil`/`verbatim`/`dvipng`/`mathjax`…), `#+HTML_MATHJAX`, `#+STARTUP: latexpreview`.
**Support:** MISSING — `$…$`, `\(…\)`, `$$…$$`, `\[…\]` left as escaped literal text.

### ORG-052 — Entity / special symbol
**Authoring forms:**
- Named entity: `\alpha`, `\to`, `\Rightarrow`, `\copy`, `\nbsp`, … (followed by whitespace/non-letter)
- Entity with boundary terminator: `\alpha{}` (then a letter)
- Special strings: `\-` (shy hyphen), `--` (en dash), `---` (em dash), `...` (ellipsis)
**Target HTML:** HTML entity, e.g. `\alpha` → `&alpha;`, `---` → `&#x2014;`, `...` → `&#x2026;`.
**Modifiers:** `#+OPTIONS: e:` (entities), `-:` (special strings), `#+STARTUP: entitiespretty`.
**Support:** MISSING — `\alpha`, `---`, `...` left as literal text.

### ORG-053 — Table cell (object)
**Authoring forms:**
- `CONTENTS |` (content terminated by a pipe)
- `CONTENTS` at end of row line
**Target HTML:** `<td>` / `<th scope="col">`.
**Modifiers:** alignment cookie / auto-alignment → `class="org-left/right/center"`.
**Support:** PARTIAL — cells split on `|`, inline-parsed; header cells → `<th scope="col">`, body → `<td>`. No alignment class.

---

## Category 5 — Document Keyword

### ORG-054 — Core export keywords
**Authoring forms (each its own keyword):**
- `#+TITLE: text` (repeatable / multi-line)
- `#+SUBTITLE: text`
- `#+AUTHOR: name`
- `#+EMAIL: addr`
- `#+DATE: date-or-timestamp`
- `#+LANGUAGE: code`
- `#+DESCRIPTION: text`
- `#+KEYWORDS: a, b, c`
- `#+CREATOR: text`
- `#+EXPORT_FILE_NAME: name`
**Target HTML:** `<title>`, `<meta name>`, `<h1 class="title">`, `<p class="subtitle">`, `<p class="author/date">`.
**Modifiers:** `#+OPTIONS: title: author: email: date: creator:` toggle inclusion.
**Support:** PARTIAL — TITLE/AUTHOR/DATE/EMAIL/DESCRIPTION/KEYWORDS/LANGUAGE/CATEGORY/EXPORT_FILE_NAME recognized (`metadata.ts`). **SUBTITLE/CREATOR MISSING.** Engine also adds many non-standard SEO keys (CANONICAL, COVER_IMAGE, OG_*, TWITTER_*, THEME_COLOR, ROBOTS) consumed by `template.ts`.

### ORG-055 — `#+OPTIONS` keyword (and all symbol keys)
**Authoring forms:** `#+OPTIONS: key:val key:val …`. Symbol/letter keys:
- `'` smart quotes
- `*` emphasis on/off
- `-` special strings (dashes/ellipsis)
- `:` fixed-width sections
- `<` include timestamps
- `\n` preserve line breaks
- `^` super/subscript (`t`/`nil`/`{}`)
- `_` subscript control (paired with `^` in practice)
- `|` include tables
- `arch:` archived trees (`headline`/`nil`/`t`)
- `author:` include author
- `broken-links:` (`t`/`nil`/`mark`)
- `c:` include CLOCK
- `creator:` include creator
- `d:` include drawers (`t`/`nil`/`(list)`)
- `date:` include date
- `e:` include entities
- `email:` include email
- `expand-links:` expand env vars in links
- `f:` include footnotes
- `H:` headline level cutoff (number)
- `inline:` include inline tasks
- `num:` section numbering (`t`/`nil`/N)
- `p:` include planning
- `pri:` include priority cookies
- `prop:` include property drawers
- `stat:` include statistics cookies
- `tags:` include tags (`t`/`nil`/`not-in-toc`)
- `tasks:` include TODO items (`t`/`nil`/`todo`/`done`)
- `tex:` LaTeX handling (`t`/`nil`/`verbatim`)
- `timestamp:` include creation timestamp
- `title:` include title
- `toc:` table of contents (`t`/`nil`/N/`listings`)
- `todo:` include TODO keywords
**Target HTML:** governs presence/format of many elements (see each above).
**Modifiers:** self.
**Support:** PARTIAL — `parseOptions` handles `toc`, `num`, `date`, `H`, `author`, `email`, `title`, `_`, `^`, `tex`; only `toc` is actually acted on by the renderer (TOC depth/enable). `^`/`_` parsed but not applied. All others stored generically and ignored.

### ORG-056 — Selection / tag keywords
**Authoring forms:**
- `#+FILETAGS: :tag1:tag2:`
- `#+SELECT_TAGS: export`
- `#+EXCLUDE_TAGS: noexport`
- `#+TAGS: tag1 tag2` (tag definitions/groups)
**Target HTML:** affects which subtrees export; tags → `<span class="tag">`.
**Modifiers:** `#+OPTIONS: tags:`.
**Support:** PARTIAL — only `#+FILETAGS` parsed (→ `metadata.tags`). SELECT_TAGS/EXCLUDE_TAGS/TAGS MISSING.

### ORG-057 — Structure & babel keywords
**Authoring forms:**
- `#+PROPERTY: name value` (buffer-wide property; `+` appends)
- `#+COLUMNS: %25ITEM …`
- `#+CONSTANTS: name=value`
- `#+TODO: TODO | DONE` (also `#+SEQ_TODO:`, `#+TYP_TODO:`)
- `#+PRIORITIES: A C B`
- `#+ARCHIVE: %s_done::`
- `#+CATEGORY: name`
- `#+STARTUP: overview/content/showall/showeverything/indent/num/hidestars/inlineimages/latexpreview/…`
- `#+LINK: abbrev https://…/%s` (link abbreviation)
- `#+MACRO: name expansion` (macro definition)
- `#+INCLUDE: "file" [type] [args]`
- `#+SETUPFILE: path-or-URL`
- `#+BIND: var value`
**Target HTML:** mostly behavioral (no direct element); STARTUP `inlineimages` toggles `<img>`; INCLUDE injects content.
**Modifiers:** self.
**Support:** MISSING — none of these are recognized (stashed in `metadata.properties` at best); `#+INCLUDE`/`#+SETUPFILE`/`#+MACRO`/`#+LINK`/`#+STARTUP` have no effect.

### ORG-058 — HTML export keywords
**Authoring forms:**
- `#+HTML_HEAD: <link …>`
- `#+HTML_HEAD_EXTRA: <…>`
- `#+HTML_DOCTYPE: html5`
- `#+HTML_CONTAINER: div`
- `#+HTML_LINK_HOME: url`
- `#+HTML_LINK_UP: url`
- `#+HTML_MATHJAX: path config`
- `#+INFOJS_OPT: view:info …`
**Target HTML:** inject into `<head>`, set doctype, section container element, nav links, MathJax loader.
**Modifiers:** `#+OPTIONS: html5-fancy: html-preamble: html-postamble:`.
**Support:** MISSING — none recognized; engine uses its own Mustache `template.ts` head/meta system instead.

### ORG-059 — Citation / bibliography keywords
**Authoring forms:**
- `#+CITE_EXPORT: processor [bibstyle] [citestyle]`
- `#+BIBLIOGRAPHY: refs.bib`
- `#+PRINT_BIBLIOGRAPHY:` (placement of the reference list)
**Target HTML:** rendered bibliography list `<div class="csl-bib-body">`.
**Modifiers:** `oc.el` citation processors.
**Support:** MISSING.

---

## Category 6 — Affiliated Keyword

### ORG-060 — `#+NAME`
**Authoring forms:** `#+NAME: identifier` (attaches to the next element; cross-ref target)
**Target HTML:** sets `id` on the element; enables `[[name]]` references → numbered ref.
**Modifiers:** referenced by links and `\ref`-style cross-refs.
**Support:** MISSING.

### ORG-061 — `#+CAPTION`
**Authoring forms:**
- `#+CAPTION: text`
- `#+CAPTION[short]: long caption` (optional short form)
**Target HTML:** `<caption>` for tables; `<figcaption>` inside `<figure>` for images; “Listing N:” for src.
**Modifiers:** combines with `#+NAME` for numbering.
**Support:** MISSING.

### ORG-062 — `#+ATTR_HTML` (and `#+ATTR_*` family)
**Authoring forms:**
- `#+ATTR_HTML: :class foo :width 300 :alt text :style …`
- (family) `#+ATTR_LATEX:`, `#+ATTR_ORG:`, `#+ATTR_ASCII:` — HTML export only consumes `ATTR_HTML`
**Target HTML:** injects arbitrary attributes onto the next element (`<img>`, `<table>`, `<div>`, etc.).
**Modifiers:** self.
**Support:** MISSING — not parsed; attributes never applied. (`sanitizer.ts` would permit `class/style/width/height/loading/…` if produced.)

### ORG-063 — `#+HEADER` / `#+HEADERS`
**Authoring forms:** `#+HEADER: :var x=1 :results output` (extra babel header args for the following block)
**Target HTML:** affects src block execution/results, not direct markup.
**Modifiers:** self.
**Support:** MISSING.

### ORG-064 — `#+RESULTS`
**Authoring forms:**
- `#+RESULTS:` (anonymous; precedes a src block’s output)
- `#+RESULTS[hash]:`
- `#+RESULTS: name`
**Target HTML:** the result element (table/example/etc.).
**Modifiers:** `:results` header arg shape.
**Support:** MISSING — `#+RESULTS:` line treated as text.

### ORG-065 — `#+PLOT`
**Authoring forms:** `#+PLOT: title:"x" ind:1 deps:(2 3) type:2d with:lines` (gnuplot params for following table)
**Target HTML:** generated image (gnuplot), not native.
**Modifiers:** self.
**Support:** MISSING.

---

## Category 7 — Drawer

### ORG-066 — Generic drawer
**Authoring forms:**
- `:NAME:` … `:END:` (NAME is any non-reserved word)
**Target HTML:** `<div class="drawer NAME">` only if `#+OPTIONS: d:t`; otherwise omitted.
**Modifiers:** `#+OPTIONS: d:` (which drawers export).
**Support:** PARTIAL — lexer/parser produce a `drawer` node, but `html-renderer.ts` has **no `case 'drawer'`** → renders empty string (content dropped).

### ORG-067 — Property drawer
**Authoring forms:**
- `:PROPERTIES:` … `:END:` (directly under a headline or at top of file)
- contains node properties `:KEY: value` (see ORG-023)
**Target HTML:** omitted unless `prop:t` (then a properties `<table>`).
**Modifiers:** `#+OPTIONS: prop:`.
**Support:** PARTIAL — top-of-file `:PROPERTIES:` parsed into `metadata.properties`; per-heading property drawers are matched by `parseDrawer` and **skipped** (returns null). Never rendered.

### ORG-068 — LOGBOOK drawer
**Authoring forms:**
- `:LOGBOOK:` … `:END:` (holds clock entries and state-change notes)
**Target HTML:** omitted unless `d:` includes it.
**Modifiers:** `#+OPTIONS: d:`; `org-log-into-drawer`.
**Support:** MISSING — parsed as a generic drawer (ORG-066) and therefore dropped; clock lines inside are not understood.

---

## Category 8 — Planning / Logbook

### ORG-069 — Planning line
**Authoring forms:**
- `SCHEDULED: <2024-01-01 Mon>`
- `DEADLINE: <2024-01-01 Mon>`
- `CLOSED: [2024-01-01 Mon 10:00]`
- combined on one line: `DEADLINE: <…> SCHEDULED: <…>`
- with repeater/warning cookies on the timestamp (see ORG-050)
**Target HTML:** `<p class="planning"><span class="timestamp-kwd">DEADLINE:</span> …` when `p:t`.
**Modifiers:** `#+OPTIONS: p:` (include planning).
**Support:** MISSING — becomes paragraph text directly below the heading.

### ORG-070 — Clock entry
**Authoring forms:**
- `CLOCK: [2024-01-01 Mon 09:00]--[2024-01-01 Mon 10:00] =>  1:00`
- `CLOCK: [2024-01-01 Mon 09:00]` (open clock)
- `CLOCK: => 1:00` (duration only)
**Target HTML:** omitted unless `c:t` (then in logbook/clocktable).
**Modifiers:** `#+OPTIONS: c:`.
**Support:** MISSING.

---

## Category 9 — Table-internal

### ORG-071 — Table data row
**Authoring forms:** `| cell1 | cell2 | … |`
**Target HTML:** `<tr>` with `<td>`/`<th>`.
**Modifiers:** position relative to first rule = header vs body.
**Support:** SUPPORTED — split on `|`; header/body from first rule.

### ORG-072 — Horizontal rule row
**Authoring forms:**
- `|---|`
- `|---+---+---|` (plus signs at column boundaries)
- `|---:|:--:|` (alignment-marked rule, Org tolerates colons)
**Target HTML:** row boundary → splits `<thead>`/`<tbody>` (no element of its own).
**Modifiers:** first rule separates header.
**Support:** PARTIAL — `/^\|[-+:| ]+\|$/` detects the rule and marks header boundary; multiple rules / tfoot grouping not modeled.

### ORG-073 — Column group row
**Authoring forms:**
- `| / | < | > | < |` (the `/` in column 1 marks a group-definition row; `<`/`>`/`<>` mark group edges)
**Target HTML:** `<colgroup><col class="org-…">` groupings.
**Modifiers:** self.
**Support:** MISSING — treated as an ordinary data row.

### ORG-074 — Alignment / width cookie
**Authoring forms:**
- `<l>` left, `<c>` center, `<r>` right
- `<N>` fixed width (chars), e.g. `<6>`
- combined `<rN>` / `<lN>` / `<cN>`, e.g. `<r10>`
- placed alone in a cell of an otherwise-cookie row: `| <r> | <l> |`
**Target HTML:** sets `class="org-right/left/center"` on `<col>`/cells; cookie row removed from output.
**Modifiers:** overrides Org’s automatic numeric/text alignment.
**Support:** MISSING — cookie rows rendered as literal data cells (e.g. a row containing `<r>`).

### ORG-075 — `#+TBLFM` formula line
**Authoring forms:**
- `#+TBLFM: $3=$1+$2` (column/field formula)
- `#+TBLFM: @2$1=vsum(@I..@II)` (field/range formula with row/col refs)
- multiple formulas separated by `::`
**Target HTML:** none directly (computes cell values; line itself not exported).
**Modifiers:** Calc / Emacs-Lisp formula mode.
**Support:** MISSING — `#+TBLFM:` line treated as paragraph text below the table.

---

## Category 10 — Other

### ORG-076 — Hugo-style shortcode (NON-STANDARD engine extension)
**Category:** Other
**Authoring forms:**
- `{{< name attr="value" … >}}` (single-line component shortcode)
**Target HTML:** `<div data-component="name" attr="value"></div>` (client-hydrated component hook).
**Modifiers:** `sanitizer.ts` whitelists `data-component`, `data-props`, `data-src`.
**Support:** SUPPORTED — this is a bespoke, **non-Org** construct implemented in `lexer.ts`/`parser.ts parseShortcode`. Not part of the Org spec; documented here for completeness because it occupies the macro/`{{{…}}}` syntactic niche.

---

## Support tally

| Status | Count |
|--------|------:|
| SUPPORTED | 12 |
| PARTIAL | 20 |
| MISSING | 44 |
| **Total** | **76** |

**SUPPORTED (12):** ORG-006, ORG-008, ORG-024, ORG-026, ORG-027, ORG-028, ORG-029, ORG-030, ORG-031, ORG-034, ORG-071, ORG-076
**PARTIAL (20):** ORG-001, ORG-002, ORG-004, ORG-005, ORG-007, ORG-012, ORG-013, ORG-014, ORG-023, ORG-025, ORG-035, ORG-040, ORG-041, ORG-053, ORG-054, ORG-055, ORG-056, ORG-066, ORG-067, ORG-072
**MISSING (44):** ORG-003, ORG-009, ORG-010, ORG-011, ORG-015, ORG-016, ORG-017, ORG-018, ORG-019, ORG-020, ORG-021, ORG-022, ORG-032, ORG-033, ORG-036, ORG-037, ORG-038, ORG-039, ORG-042, ORG-043, ORG-044, ORG-045, ORG-046, ORG-047, ORG-048, ORG-049, ORG-050, ORG-051, ORG-052, ORG-057, ORG-058, ORG-059, ORG-060, ORG-061, ORG-062, ORG-063, ORG-064, ORG-065, ORG-068, ORG-069, ORG-070, ORG-073, ORG-074, ORG-075
