<!--
Copyright (c) 2026 Cristian D. Moreno — @Kyonax
Distributed under the terms of GPL-3.0-only — see LICENSE.
-->

# Includes, setup files, and startup switches

Three Org keywords need the filesystem: `#+SETUPFILE`, `#+INCLUDE`, and
`#+STARTUP`. org2html resolves all three **before** parsing, in the CLI layer —
`parse()` itself never touches disk.

Every example here is backed by a fixture under
[`../tests/fixtures/file-layer/`](../tests/fixtures/file-layer) and exercised by
[`../tests/file-layer.test.ts`](../tests/file-layer.test.ts).

## Why this matters

Setup files are where `#+MACRO:` definitions usually live. Without resolution, a
document whose byline is built from a macro renders the braces verbatim:

```org
#+SETUPFILE: ~/org/house-style.org
#+AUTHOR: {{{person(Ada Lovelace,Analytical Engines)}}}
```

```html
<!-- unresolved: the macro definition was never read -->
<span class="org-article-author">{{{person(Ada Lovelace,Analytical Engines)}}}</span>
```

That is silent content corruption, so resolution is **on by default**.

## `#+SETUPFILE` — import settings

```org
#+SETUPFILE: house-style.org
#+TITLE: My document
```

The target contributes **settings, not content**: every top-level `#+KEY:` line
that is not inside a block, from anywhere in the file. That last part matters —
a setup file often defines its macros a hundred lines down, after a block of
explanatory comments, and those still count.

**The document always wins.** A keyword the document defines for itself is never
overwritten by an import, regardless of line order. `#+MACRO` and `#+LINK` are
keyed by the name they define, so a document can override one macro from a setup
file while inheriting the rest.

Setup files may chain. Resolution is depth-first, and the nearer file wins:

```org
# house-style.org
#+SETUPFILE: base.org
#+MACRO: greet Salutations, $1!    # overrides base.org's version
```

## `#+INCLUDE` — splice content

```org
#+INCLUDE: "chapter-one.org"
#+INCLUDE: "config.yml" src yaml
#+INCLUDE: "notes.org" :lines "5-10"
#+INCLUDE: "manual.org::*Installation" :only-contents t
#+INCLUDE: "shared.org" :minlevel 2
```

| Form | Effect |
|---|---|
| `src <lang>` | wraps in `#+BEGIN_SRC <lang>` |
| `example` | wraps in `#+BEGIN_EXAMPLE` |
| `export <backend>` | wraps in `#+BEGIN_EXPORT <backend>` |
| `:lines "5-10"` | lines 5 through **9** — Org's end is exclusive |
| `:lines "5-"` / `:lines "-10"` | open-ended in either direction |
| `:only-contents t` | drops the selected headline and its property drawer |
| `:minlevel N` | shifts headings so the shallowest sits at level `N` |
| `file::*Heading` | selects that headline's subtree |
| `file::#custom-id` | selects the subtree owning that `:CUSTOM_ID:` |
| `file::NAME` | selects the block following `#+NAME: NAME` |

Wrapped content is comma-escaped, so an included heading or `#+END_SRC` cannot
break out of the block. Nested includes resolve relative to **their own** file,
not the top-level document.

## `#+STARTUP` — in-buffer switches

Switches with a rendered meaning become their `#+OPTIONS` equivalent
(`nonum` → `num:nil`, `num` → `num:t`, `entitiespretty` → `e:t`). They are
prepended, so a document's own `#+OPTIONS` still overrides per key.

Editor-visibility switches — `overview`, `content`, `showall`, `indent`,
`logdone` — are recognized and deliberately produce nothing. They describe how
Emacs folds a buffer, not how a page renders.

## Security: root confinement

**A document may only read files inside its own directory.** Anything else is
refused with a warning naming the file.

This is not paranoia. Without it, any `.org` you did not write could say:

```org
#+INCLUDE: "/etc/passwd"
```

and have the contents published into your rendered HTML. Resolution goes through
`realpath`, so a symlink cannot be used to step outside a root either.

To allow a shared directory, name it:

```bash
org2html build notes/ -o site --include-root ~/org/shared-setup
```

`--include-root` is repeatable. To turn resolution off entirely:

```bash
org2html build notes/ -o site --no-resolve-includes
```

Both flags work on `build`, `watch`, and filter mode.

## Failure behavior

Nothing here ever throws. A target that is missing, refused, cyclic, or too
deeply nested produces a one-line warning on stderr and the directive is
dropped — the rest of the document still renders.

| Guard | Limit |
|---|---|
| Cycle detection | ancestor stack; a file cannot include itself, directly or transitively |
| Depth cap | 16 |
| File size cap | 8 MB per included file |
| Root confinement | the document's directory, plus any `--include-root` |

## Keywords inside blocks are data

A document *about* Org — a guide showing readers how to write `#+INCLUDE` — is
not itself including anything:

````org
Here is how you include a file:

#+BEGIN_SRC org
#+INCLUDE: "example.org"
#+END_SRC
````

The directive inside the block is left exactly as written.

## Watch mode

`org2html watch` adds every resolved setup file and include target to its watch
set, so editing a shared setup file rebuilds the documents that import it — even
when the setup file lives outside the watched tree.
