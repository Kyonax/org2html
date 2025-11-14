# org2html — Project description, focus, and current behaviour

`org2html` is a lightweight Org-mode → HTML toolchain with first-class support for generating **Vue 3 Single File Components (SFCs)**.  
Its main purpose is to convert Org files into web-ready content and — instead of only producing static HTML files — produce **Vue route components** that can be dropped into a Vue/Vite project and used as lazy-loaded, interactive routes.

## Primary goals
- Convert Org-mode content into a semantic DOM (HTML) using a custom parser + renderer.  
- Output posts as Vue SFC route components so they can be mounted as pages in a Vue app.  
- Produce metadata and SEO artifacts (metadata.json, og-metadata.json, structured-data.json, sitemap.json, feed.json).  
- Support shortcodes that map to Vue components so authors can include dynamic widgets inside Org content.

---

## High-level architecture / important files
- `src/parser/*` — tokenizes Org content and builds an AST; extracts metadata.  
- `src/renderer/html-renderer.ts` — renders AST → HTML (article-level output); supports TOC, footnotes, code highlighting hooks.  
- `src/renderer/template.ts` — wraps article HTML in a site template (default or custom).  
- `src/index.ts` — public API: `parse`, `renderToHtml`, `applyTemplate`, and convenience `org2html`.  
- `src/cli/commands/build.ts` — CLI build: iterates .org files, renders them, writes outputs, and (when configured) generates Vue SFCs.  
- `src/cli/vue-generator.ts` — builds readable Vue SFCs from article HTML: strips page wrappers, converts shortcodes to component imports/tags, encodes metadata, emits module `<script>` + `<script setup>` + `<template>`.  
- `templates/` — default templates and styles used when applying a site wrapper.

---

## CLI & API surface (how to call)
- CLI command pattern: `org2html build <input> -o <output> [--template <file>] [--template-dir <dir>] [--no-sanitize] [--no-highlight]`  
  - Use `-o` to control where generated files go. For Vue integration, generate into a Vue app's `src/generated-pages` directory.  
  - `--template-dir` may contain `components-map.json` to map shortcode names to import paths.

- Public API functions exported by the library:
  - `parse(content)` → returns an Org AST.  
  - `renderToHtml(ast, options)` → returns a `RenderResult` containing `html` (article/body) and `metadata`.  
  - `applyTemplate(html, metadata, templatePath?, templateDir?)` → returns full HTML page string.  
  - `org2html(content, options)` → convenience for parse → render → applyTemplate.

- Important `RenderOptions`:
  - `template?`, `templateDir?`, `sanitize?`, `allowRawHtml?`, `codeHighlight?`, `componentMap?`, `fetchRemoteAssets?`, `maxAssetSize?`.

---

## Current behaviour (detailed)

### Input
One or more Org files (single file or a directory containing `.org` files).

### Parse & render
1. The parser extracts metadata and builds an AST (headings, paragraphs, lists, code blocks, shortcodes, images, etc.).  
2. `renderToHtml(ast, options)` converts the AST to article-level HTML (TOC + body + footnotes) and collects metadata. This stage does not apply a full-site template by default.  
3. `applyTemplate()` can be used to wrap article HTML into a full HTML document using `templates/default.html` or a custom template.

### CLI build flow (Vue-focused)
- For each `.org`:
  - The build command uses `parse()` + `renderToHtml()` to obtain article HTML + metadata.
  - It strips outer wrappers (`<!doctype>`, `<html>`, `<head>`, `<body>`, `<style>`, `<script>`) so the generated `<template>` remains clean.
  - It converts component shortcodes of the form `<div data-component="Name" attr="val"></div>` into:
    - import lines in the generated `<script setup>` (import path resolved from `components-map.json` or default `./components/Name.vue`),
    - props declarations in `<script setup>` as `const __propsN = JSON.parse(decodeURIComponent('...'))`,
    - template tag replacement `<Name v-bind="__propsN" />`.
  - It constructs a human-readable Vue SFC containing:
    - a `<template>` with the article DOM (not `v-html`), including component tags,
    - a module `<script>` that `export const metadata = ...` so other modules can import metadata from the SFC,
    - a `<script setup>` containing component imports and props variables,
    - a small scoped `<style>` with article styles.
  - Files written per page:
    - `index.vue` (generated SFC), `metadata.json`, `og-metadata.json`, `structured-data.json`.
- The build also aggregates sitemap and feed entries and produces `sitemap.json` and `feed.json`.
- The build generates a `routes.js` module exporting `blogRoutes`, where each route uses a lazy dynamic import to the generated SFC, suitable for `vue-router` registration.

### Integration pattern with Vue/Vite
- Recommended pattern: generate into the Vue app's `src/generated-pages` so Vite treats SFCs as source files and dynamic imports work during dev and build.  
- Demo app workflow: `main.js` dynamically imports `src/generated-pages/routes.js`, extracts `blogRoutes`, and registers them with `vue-router` so pages are lazy-loaded.

---

## Key fixes already made
- SFCs do not contain full-page templates anymore; they include only the article DOM.  
- Fixed the Vue compiler error caused by `export` inside `<script setup>` by moving exports into a module `<script>` and keeping imports in `<script setup>`.  
- Generator produces a readable `<template>` (no `v-html`) so generated SFCs are human-editable.  
- Shortcodes are converted into real component tags with imports; `components-map.json` support added.  
- `routes.js` is generated to make app wiring simple.

---

## Known limitations & caveats
- Literal mustache sequences `{{` in Org content: Vue templates will interpret them. The generator does not auto-escape `{{` by default. Options: wrap content in `v-pre`, escape `{{`, or keep using `v-html` for problematic pages. An `--escape-mustache` option can be added.  
- Images: `<img src="...">` are not automatically rewritten to ES module imports; Vite will not fingerprint local images unless the generator rewrites them. Image-to-import rewriting is an improvement item.  
- Remote assets: `fetchRemoteAssets` exists in options but full remote asset localization and LQIP generation are experimental or incomplete.  
- Complex shortcode props: current parsing uses best-effort `JSON.parse` on attribute values; for robust complex data, the parser can emit a single `data-props` JSON attribute.  
- Sanitization: `sanitize` defaults to true; `allowRawHtml` bypasses sanitizer but should be used cautiously.  
- Plugin system: `OrgPlugin` interface exists, but plugin discovery/loading and documentation are limited.  
- Tests & CI: add unit tests for the parser/renderer and CI checks that ensure generated SFCs compile in a sample app.  
- Nuxt integration: not implemented yet; generator targets Vite/Vue SFCs and `routes.js`.

---

## Typical usage (quick steps)
1. Build the CLI bundler so `dist/cli/index.mjs` exists (e.g., run the project's build script).  
2. Generate pages into a Vue app source folder, for example into `my-vue-app/src/generated-pages`.  
3. In the Vue app, dynamically import `src/generated-pages/routes.js`, extract `blogRoutes`, and register them with `vue-router`.  
4. Start Vite; generated pages are lazy-loaded and render as full articles.

---

## Files contributors should open first
- `src/parser/parser.ts` — inline markup and AST construction logic.  
- `src/renderer/html-renderer.ts` — mapping AST nodes to HTML and TOC/footnotes handling.  
- `src/renderer/template.ts` — site template application and metadata injection.  
- `src/cli/commands/build.ts` — CLI flow and where SFC generation occurs.  
- `src/cli/vue-generator.ts` — SFC assembly and shortcode → component logic.  
- `templates/default.html` — default site wrapper and meta placeholders.
