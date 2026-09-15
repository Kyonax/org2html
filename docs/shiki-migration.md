<!--
Copyright (c) 2026 Cristian D. Moreno — @Kyonax
Distributed under the terms of GPL-3.0-only — see LICENSE.
-->

# The shiki pin, and the way off it

`package.json` holds `"shiki": "^0.14.5"`. A caret on a `0.x` version does not
mean what a caret usually means: npm treats every `0.x` minor as a breaking
boundary, so `^0.14.5` can never leave `0.14`. The installed version is 0.14.7,
released December 2023, while shiki 1.0 shipped in February 2024 and the line is
now several majors further on.

That is a pin. It is held on purpose, and `scripts/check-pins.mjs` fails the
build if this file stops explaining why.

## Why it is held

The engine does not pick colours. It defers them.

`DEFAULT_CODE_THEME` is `css-variables` (`src/plugins/code-highlight.ts`), a
shiki 0.x theme that emits every colour as a `var(--shiki-…)` custom property
instead of a hex literal. `templates/styles.css` binds those properties to the
Style Book's own `--o2h-syn-*` tokens, so a code block re-themes with the rest of
the page and a swapped Style Book changes the syntax colours with everything
else. Nothing is baked in.

**shiki 1.0 removed the `css-variables` theme.** It also renamed
`getHighlighter`. So the upgrade is not a version bump with a rename in it — it
is a rewrite of the contract between the highlighter, the stylesheet and the
Style Book. That work has not been scheduled, and doing it accidentally as part
of a dependency refresh is how a release ships unstyled code blocks.

## What it costs today

shiki 0.14 ships 173 grammars. `emacs-lisp`, `elisp` and `org` are **not** among
them — the two languages an Org converter's own documentation is most likely to
contain. Those blocks ship escaped and unhighlighted, carrying
`class="org-src org-src--plain"` and their `data-lang`, and the build prints one
line per language saying so.

`bash`, `yaml`, `sql`, `c`, `ruby`, `lisp`, `scheme` and `clojure` all highlight
normally.

## The way off it

Two routes, both real, neither started.

**1. Dual theme with CSS variables preserved.** Modern shiki replaces the
`css-variables` theme with dual-theme output:

```js
codeToHtml(code, {
  lang,
  themes: { light: 'github-light', dark: 'github-dark' },
  defaultColor: false,          // emit --shiki-light / --shiki-dark, not colours
  cssVariablePrefix: '--o2h-syn-',
})
```

With `defaultColor: false` every token carries `--shiki-light` and
`--shiki-dark` custom properties rather than a resolved colour, which is the same
shape of indirection `css-variables` gave. `templates/styles.css` would bind
those two instead of the current `--shiki-*` names, and the Style Book contract
survives.

**2. `transformerStyleToClass`.** Move colour off the element entirely: shiki
emits a class per token type and the stylesheet owns every colour. This fits the
project's "nothing the reader pays for" line better — no inline style attribute
on a span at all — but it is a larger change to `templates/styles.css` and to the
sanitizer's declaration allowlist, which currently exists to let those inline
colours through.

Either route should add the missing grammars in the same pass:

```js
import { createHighlighter } from 'shiki'
const highlighter = await createHighlighter({
  themes: ['github-light', 'github-dark'],
  langs: ['javascript', 'typescript', 'python', 'rust', 'go', 'java', 'html',
          'css', 'json', 'markdown', 'emacs-lisp', 'org'],
})
```

## What must be true before it lands

- `tests/code-theme.test.ts` still passes, or is deliberately re-cut with the new
  contract written down here first.
- The `--shiki-*` bindings in `templates/styles.css` are replaced, not left
  dangling — a stale binding is a code block with no colour and no error.
- `--code-theme github-dark` still produces hex colours the sanitizer allows
  (`src/renderer/sanitizer.ts` permits `var(--…)`, hex and bare keywords).
- The golden snapshot and the built corpus are re-generated deliberately, with
  the diff inspected rather than accepted.
- `scripts/check-pins.mjs` loses its `shiki` entry, which the gate then requires,
  because an acknowledgement for something no longer pinned is stale bookkeeping.
