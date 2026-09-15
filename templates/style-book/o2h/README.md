<!--
Copyright (c) 2026 Cristian D. Moreno — @Kyonax
Distributed under the terms of GPL-3.0-only — see LICENSE.
-->

# The O2H Style Book

The engine's original default look: paper `#E9E9E6`, ink `#0B0B0B`, Signal Orange
`#FF5114`, sharp corners, a 44px ambient grid, and the technical-drawing grammar
(registration brackets, crop marks, mono coordinate labels) documented across the
142-object matrix in [`docs/authoring-style-books.md`](https://github.com/kyonax/org2html/blob/main/docs/authoring-style-books.md).

It was the default through `v1.0.x`. From `v1.1.0` the default is the
kyo-web-online book (`../kwo-tokens.css` + `../kwo.css`); O2H is preserved here,
unchanged, and stays selectable:

```bash
org2html build src/ -o out --style-book node_modules/@kyonax/org2html/templates/style-book/o2h
```

Nothing was rewritten to make this work. O2H is a pure **value** selection: it
pairs `../o2h-tokens.css` with the same shared construct stylesheet
(`../../styles.css`) the default uses. That the two books differ only in their
token layer plus a small construct delta is the whole point of the
`--o2h-*` / `--host-*` indirection ([D-08] / [D-29]).
