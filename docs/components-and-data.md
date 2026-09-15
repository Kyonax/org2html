<!--
Copyright (c) 2026 Cristian D. Moreno — @Kyonax
Distributed under the terms of GPL-3.0-only — see LICENSE.
-->

# Components & Data

org2html can embed **component placeholders** in its output. The engine only
*emits* an inert `data-component` placeholder — the host app wires the runtime
and the look ([D-22]). On the static-HTML path the placeholder ships as-is; on
the Vue path it is rewritten into an imported `<Component v-bind>`.

- [Invocation forms](#invocation-forms)
- [The `--components` map](#the---components-map)
- [What gets emitted](#what-gets-emitted)
- [Image dimensions](#image-dimensions)
- [Not in scope (website project)](#not-in-scope-website-project)

## Invocation forms

**Inline shortcode** — for a simple, attribute-only component:

```org
{{< Callout tone="tip" title="Heads up" >}}
```

**Block component** — `#+BEGIN_COMPONENT Name :key value …` with an optional
JSON body for structured props (the `data-props` channel):

```org
#+BEGIN_COMPONENT Chart :height 320 :variant bars
{ "series": [12, 30, 9], "labels": ["a", "b", "c"] }
#+END_COMPONENT
```

`:key value` pairs become flat attributes; the JSON body becomes structured
props. Flat attrs and JSON props are merged (JSON first, attrs on top).

## The `--components` map

Point `--components <file>` at a JSON map of component **name → import source**:

```json
{
  "Callout": "@site/components/Callout.vue",
  "Chart": "@site/components/Chart.vue"
}
```

- The name is validated against the map. An unknown component **warns** and
  degrades to an inert placeholder; under `--strict` it is a hard **error**.
- A matched name stamps `data-component-src` on the placeholder, and the Vue
  path imports the component from that source.
- A Style Book's `components` map seeds this; `--components` overrides it, and a
  `templateDir/components-map.json` overrides both.

## What gets emitted

Static HTML (inert — the host mounts it):

```html
<div data-component="Chart" data-component-src="@site/components/Chart.vue"
     height="320" variant="bars"
     data-props="%7B%22series%22%3A%5B12%2C30%2C9%5D%7D"></div>
```

Vue SFC (rewritten to a real import + bind):

```vue
<script>
import Chart from '@site/components/Chart.vue'
const __props0 = JSON.parse(decodeURIComponent('...'))
</script>
<template>
  <Chart v-bind="__props0" />
</template>
```

`data-props` is a URL-encoded JSON channel, so structured data survives both
paths. `data-*` hooks are never passed to the component as props.

## Image dimensions

org2html stamps intrinsic `width`/`height` on `<img>` that lack them so the
page reserves layout space (a Core-Web-Vitals / CLS win, R-12). **Local** images
are probed from disk (relative to the source `.org` file). **Remote** images are
only touched with `--fetch-assets metadata` (probe just the header bytes) or
`--fetch-assets full` (download the body); the default `none` leaves them alone.
Root-absolute site paths (`/img/x.png`) are treated as deploy paths and skipped.

## Not in scope (website project)

Two related capabilities are deferred to the downstream website project
([D-22]): **data-source resolvers** (`:data ./x.json`, `:src ./gen.js` behind
`--allow-exec`, `#+NAME`/`#+RESULTS`, remote datasets → props) and the
**component runtime + look** (hydration, mounting, the Style-Book component
kit). org2html stops at the placeholder + the `data-component-src` reference.
