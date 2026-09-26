/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/vue-generator.ts — Vue 3 SFC generation helpers.
 *
 * stripDocumentWrapper / safeEncodeForSfc / shortcode
 * processing. Round-trips rendered HTML into a `<script
 * setup>` SFC whose `<template>` block consumes downstream
 * Vue primitives (UiCard, UiLink, etc.). Consumers wire the
 * components-map.json that resolves PascalCase component
 * names to import paths.
 */

import type { OrgMetadata } from "../types.js"
import { resolveSeo, buildJsonLd, escapeJsonForScript } from "../renderer/seo.js"

/**
 * Safe encode helper for embedding JSON inside a .vue file.
 */
export function safeEncodeForSfc(value: any): string {
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value || {})
    return encodeForSingleQuoted(raw)
  } catch {
    return encodeForSingleQuoted(String(value ?? ""))
  }
}

/**
 * Percent-encode for embedding inside a SINGLE-QUOTED JavaScript string.
 *
 * encodeURIComponent deliberately leaves ' ! * ( ) unescaped, and the SFC
 * writes the result as decodeURIComponent('…'). One apostrophe in a #+TITLE or
 * #+DESCRIPTION — "a galaxy that shouldn't exist" — therefore closed the string
 * and produced a .vue that could not be parsed at all. Escaping the quote keeps
 * the value valid percent-encoding, so decodeURIComponent still round-trips it.
 */
function encodeForSingleQuoted(raw: string): string {
  return encodeURIComponent(raw).replace(/'/g, "%27")
}

/**
 * Remove full-document wrapper tags and unsafe tags (head, style, script).
 * Return the cleaned inner HTML suitable for insertion into a Vue <template>.
 */
export function stripDocumentWrapper(html: string): string {
  if (!html) return html

  // Remove DOCTYPE
  html = html.replace(/<!doctype[\s\S]*?>/i, "")

  // Remove <head>...</head>
  html = html.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")

  // Remove <style>...</style> and <script>...</script>
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")

  // Remove outer <html> / <body> tags but keep inner content
  html = html.replace(/<html[^>]*>/gi, "")
  html = html.replace(/<\/html>/gi, "")
  html = html.replace(/<body[^>]*>/gi, "")
  html = html.replace(/<\/body>/gi, "")

  // Trim
  return html.trim()
}

/**
 * Process renderer shortcodes / placeholders into import lines and replaced HTML.
 * Looks for <div data-component="CompName" attr="val" ...></div>
 *
 * Returns:
 *  { imports: string[], propsDeclarations: string[], html: string }
 *
 * For each placeholder:
 *  - generate `import CompId from 'path'` (imports)
 *  - generate `const __propsN = JSON.parse(decodeURIComponent('...'))` (propsDeclarations)
 *  - replace placeholder with `<CompId v-bind="__propsN" />` in template HTML
 */
export function processComponentPlaceholders(
  html: string,
  componentsMap: Record<string, string> = {},
): { imports: string[]; propsDeclarations: string[]; html: string } {
  const importLines: string[] = []
  const propsDeclarations: string[] = []
  const usedNames = new Map<string, string>() // compName -> importId
  const regex = /<div\s+([^>]*?\s)?data-component=["']([^"']+)["']([^>]*)><\/div>/g
  let m: RegExpExecArray | null
  let newHtml = html
  let propIndex = 0

  while ((m = regex.exec(html)) !== null) {
    const fullMatch = m[0]
    const attrsLeft = (m[1] || "") + (m[3] || "")
    const compName = m[2]

    // A data-component-src (from --components / a Style Book) is the authoritative
    // import path; else the map. If NEITHER resolves the component, the host has
    // not provided it: leave the inert <div data-component> exactly as the static
    // HTML path does. Guessing a conventional `./components/X.vue` used to emit an
    // import that no consumer could resolve, so one unmapped component failed the
    // whole downstream build — the opposite of the graceful degradation that
    // --strict exists to opt OUT of ([D-11]).
    const srcMatch = attrsLeft.match(/data-component-src=(?:"([^"]*)"|'([^']*)')/)
    const importPath = srcMatch?.[1] || srcMatch?.[2] || componentsMap[compName]
    if (!importPath) continue

    // Determine import id (unique JS identifier)
    let importId = usedNames.get(compName)
    if (!importId) {
      importId = compName.replace(/[^A-Za-z0-9_$]/g, "") || `Comp${usedNames.size + 1}`
      usedNames.set(compName, importId)
      importLines.push(`import ${importId} from '${importPath}'`)
    }

    // Structured props ride the data-props JSON channel ([R-13]); flat attrs
    // layer on top. data-* hooks themselves are never passed as props.
    const propsObj: Record<string, any> = {}
    const dataProps = attrsLeft.match(/data-props=(?:"([^"]*)"|'([^']*)')/)
    if (dataProps) {
      try {
        Object.assign(propsObj, JSON.parse(decodeURIComponent(dataProps[1] ?? dataProps[2] ?? "")))
      } catch {
        // malformed props channel — ignore, fall back to flat attrs
      }
    }
    // Quote-AWARE: match the closing quote to the opening one. A single
    // character class like [^"']* stops at the first apostrophe, so a value the
    // sanitizer emitted as label="Ada's engine" used to arrive as "Ada".
    const propRegex = /([\w-]+)=(?:"([^"]*)"|'([^']*)')/g
    let p: RegExpExecArray | null
    while ((p = propRegex.exec(attrsLeft)) !== null) {
      const key = p[1]
      if (key.startsWith("data-")) continue // skip the hooks/channels
      const val = p[2] ?? p[3] ?? ""
      try {
        propsObj[key] = JSON.parse(val)
      } catch {
        propsObj[key] = val
      }
    }

    // Same single-quote hazard as the metadata channel: a prop value carrying an
    // apostrophe would otherwise close the string literal.
    const propsJson = safeEncodeForSfc(propsObj)
    const varName = `__props${propIndex++}`
    propsDeclarations.push(`const ${varName} = JSON.parse(decodeURIComponent('${propsJson}'))`)
    const compTag = `<${importId} v-bind="${varName}" />`

    newHtml = newHtml.replace(fullMatch, compTag)
  }

  return { imports: importLines, propsDeclarations, html: newHtml }
}

/**
 * Generate SEO metadata object that can be used by the consuming app
 */
export function generateSeoMetadata(metadata: OrgMetadata): string {
  // Resolve the SAME field set the static-HTML head uses, so the Vue and HTML
  // outputs stay in lockstep ([D-22]).
  const seo = resolveSeo(metadata)
  const metaTags: any[] = []

  // Basic meta tags
  if (seo.description) metaTags.push({ name: "description", content: seo.description })
  if (seo.keywords) metaTags.push({ name: "keywords", content: seo.keywords })
  if (seo.author) metaTags.push({ name: "author", content: seo.author })
  metaTags.push({ name: "robots", content: seo.robots })
  metaTags.push({ name: "theme-color", content: seo.themeColor })

  // Open Graph tags
  metaTags.push({ property: "og:type", content: seo.ogType })
  if (seo.canonical) metaTags.push({ property: "og:url", content: seo.canonical })
  metaTags.push({ property: "og:title", content: seo.ogTitle })
  metaTags.push({ property: "og:description", content: seo.ogDescription })
  if (seo.ogImage) metaTags.push({ property: "og:image", content: seo.ogImage })
  /*
   * og:site_name is the SITE's name, and the static template already guards it with
   * {{#if siteName}}. This path was pushing the ARTICLE TITLE unconditionally, so a host
   * rendering the .vue told every crawler its pages belonged to as many differently-named
   * sites as it had posts — the static-only half of a fix that was supposed to land in
   * both outputs.
   */
  if (seo.siteName) metaTags.push({ property: "og:site_name", content: seo.siteName })
  if (seo.isArticle) {
    if (seo.datePublished)
      metaTags.push({ property: "article:published_time", content: seo.datePublished })
    if (seo.author) metaTags.push({ property: "article:author", content: seo.author })
    if (seo.tags) metaTags.push({ property: "article:tag", content: seo.tags })
  }

  // Twitter Card tags
  metaTags.push({ name: "twitter:card", content: seo.twitterCard })
  if (seo.canonical) metaTags.push({ name: "twitter:url", content: seo.canonical })
  metaTags.push({ name: "twitter:title", content: seo.ogTitle })
  metaTags.push({ name: "twitter:description", content: seo.ogDescription })
  if (seo.twitterImage) metaTags.push({ name: "twitter:image", content: seo.twitterImage })
  if (seo.twitterSite) metaTags.push({ name: "twitter:site", content: seo.twitterSite })
  if (seo.twitterCreator) metaTags.push({ name: "twitter:creator", content: seo.twitterCreator })

  const seoData = {
    title: seo.title,
    htmlAttrs: { lang: seo.language },
    meta: metaTags,
    /*
     * "One head, two outputs" is the rule this module exists to keep: whatever the static
     * <head> carries, the Vue head carries too. rel=prev / rel=next were reaching only the
     * static output, so a site rendering the .vue shipped the navigation on the page while
     * its head said nothing about the sequence — exactly the drift the canonical comment
     * below warns about.
     */
    link: [
      ...(seo.canonical ? [{ rel: "canonical", href: seo.canonical }] : []),
      ...(metadata.relations?.prev ? [{ rel: "prev", href: metadata.relations.prev.url }] : []),
      ...(metadata.relations?.next ? [{ rel: "next", href: metadata.relations.next.url }] : []),
    ],
    // JSON-LD + author-supplied #+HTML_HEAD ride the head as script entries so
    // the host's useHead/vue-meta emits them identically to the static output.
    /*
     * innerHTML, NOT `children`. `children` is the Unhead v1 spelling; under @unhead v2 an
     * unknown key is rendered as an ATTRIBUTE, so the page shipped
     * `<script type="application/ld+json" children="{...}"></script>` — a tag with an empty
     * body. The structured data was in the markup and invisible to every consumer of it,
     * which is the worst shape a half-answer can take: it passes a `contains("ld+json")`
     * check while telling a crawler nothing at all.
     */
    script: [
      { type: "application/ld+json", innerHTML: buildJsonLd(metadata, seo) },
    ],
    htmlHead: metadata.htmlHead ?? [],
  }

  return JSON.stringify(seoData, null, 2)
}

/**
 * Build a Vue SFC string with a real <template> containing the article DOM (not v-html).
 * Now uses Options API with explicit setup() function for proper useHead() context.
 */
export function buildVueSfc(
  metadata: OrgMetadata,
  contentHtml: string,
  importLines: string[] = [],
  propsDeclarations: string[] = [],
) {
  // Defensive: avoid a raw </template> closing sequence, and entity-encode literal
  // {{ }} from prose/code so Vue does not treat them as interpolation (the SFC
  // wires components via v-bind, never raw mustache).
  const safeContent = String(contentHtml)
    .replace(/<\/template>/gi, "</template><!-- -->")
    .replace(/\{\{/g, "&#123;&#123;")
    .replace(/\}\}/g, "&#125;&#125;")

  // Wrap in a <main> landmark + an <article> for semantics (WCAG 1.3.1). The
  // page-level skip link stays the host app's responsibility ([D-22]); nesting a
  // second <main> is avoided by only wrapping when the content lacks one.
  const hasArticle = /<\s*article[\s>]/i.test(safeContent)
  const article = hasArticle ? safeContent : `<article class="org-article">\n${safeContent}\n</article>`
  const hasMain = /<\s*main[\s>]/i.test(safeContent)
  const templateInner = hasMain ? article : `<main class="org-main">\n${article}\n</main>`

  // Build script parts
  const metadataEncoded = safeEncodeForSfc(metadata)

  const setupImports = importLines.length ? `${importLines.join("\n")}\n` : ""
  const setupProps = propsDeclarations.length ? `\n  ${propsDeclarations.join("\n  ")}\n` : ""

  // seoMeta is resolved from the SAME SEO fields as the static-HTML head (shared
  // src/renderer/seo.ts) so the two conversion targets stay in parity ([D-22]).
  // Escaped once so a </script> in any value can't break out of the SFC <script>.
  const seoJson = escapeJsonForScript(generateSeoMetadata(metadata))

  const optionsApiScript = `<script>
import { computed } from 'vue'
import { useHead } from '@unhead/vue'
${setupImports}
// Module-level metadata export (for consuming app to use if needed)
export const metadata = JSON.parse(decodeURIComponent('${metadataEncoded}'))

// Export seoMeta (title / htmlAttrs / meta / link / script[JSON-LD] / htmlHead)
// for the consuming app's head management.
export const seoMeta = ${seoJson}

export default {
  setup() {
${setupProps}
    useHead(seoMeta)

    const formattedDate = computed(() => {
      // Build the Date from ISO COMPONENTS, never by parsing a string.
      // new Date("2026-03-01") is UTC midnight, so toLocaleDateString() prints
      // the day before anywhere west of UTC; and new Date("<2026-03-01 Sun>") is
      // an Invalid Date whose toLocaleDateString() RETURNS "Invalid Date"
      // instead of throwing, so a try/catch here never fires and the reader gets
      // those two words on the page. src/cli/utils.ts avoids exactly this at
      // build time; the browser deserves the same answer.
      const iso = metadata.dateIso || metadata.date
      if (!iso) return ''
      const m = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(String(iso))
      if (!m) return String(metadata.date)
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString()
    })

    return {
      metadata,
      formattedDate
    }
  }
}
</script>

`

  // No <style> block: the SFC is class-only .org-* markup so it inherits the host
  // app's styling ([D-22]/§3e). The host imports the engine's default stylesheet
  // (or its own Style Book) and the .org-root hooks pick it up — the .vue never
  // ships an opinionated max-width / system-ui / .article-* skin.
  return `<template>
${templateInner}
</template>

${optionsApiScript}`
}
