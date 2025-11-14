import type { OrgMetadata } from "../types.js"

/**
 * Safe encode helper for embedding JSON inside a .vue file.
 */
export function safeEncodeForSfc(value: any): string {
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value || {})
    return encodeURIComponent(raw)
  } catch {
    return encodeURIComponent(String(value ?? ""))
  }
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

    // Determine import id (unique JS identifier)
    let importId = usedNames.get(compName)
    if (!importId) {
      importId = compName.replace(/[^A-Za-z0-9_$]/g, "") || `Comp${usedNames.size + 1}`
      usedNames.set(compName, importId)

      // Resolve import path
      const importPath = componentsMap[compName] || `./components/${compName}.vue`
      importLines.push(`import ${importId} from '${importPath}'`)
    }

    // Parse attrs into props object
    const propRegex = /(\w+)=["']([^"']*)["']/g
    const propsObj: Record<string, any> = {}
    let p: RegExpExecArray | null
    while ((p = propRegex.exec(attrsLeft)) !== null) {
      const key = p[1]
      const val = p[2]
      try {
        propsObj[key] = JSON.parse(val)
      } catch {
        propsObj[key] = val
      }
    }

    const propsJson = encodeURIComponent(JSON.stringify(propsObj))
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
function generateSeoMetadata(metadata: OrgMetadata): string {
  const metaTags: any[] = []

  // Basic meta tags
  if (metadata.description) {
    metaTags.push({ name: "description", content: metadata.description })
  }
  if (metadata.keywords && metadata.keywords.length > 0) {
    metaTags.push({ name: "keywords", content: metadata.keywords.join(", ") })
  }
  if (metadata.author) {
    metaTags.push({ name: "author", content: metadata.author })
  }
  if (metadata.robots) {
    metaTags.push({ name: "robots", content: metadata.robots })
  }
  if (metadata.themeColor) {
    metaTags.push({ name: "theme-color", content: metadata.themeColor })
  }

  // Open Graph tags
  const ogTitle = metadata.ogTitle || metadata.title
  const ogDescription = metadata.ogDescription || metadata.description
  const ogImage = metadata.ogImage || metadata.coverImage

  if (ogTitle) {
    metaTags.push({ property: "og:title", content: ogTitle })
  }
  if (ogDescription) {
    metaTags.push({ property: "og:description", content: ogDescription })
  }
  if (ogImage) {
    metaTags.push({ property: "og:image", content: ogImage })
  }
  if (metadata.canonical) {
    metaTags.push({ property: "og:url", content: metadata.canonical })
  }
  metaTags.push({ property: "og:type", content: "article" })

  // Twitter Card tags
  const twitterCard = metadata.twitterCard || "summary_large_image"
  metaTags.push({ name: "twitter:card", content: twitterCard })

  if (metadata.twitterSite) {
    metaTags.push({ name: "twitter:site", content: metadata.twitterSite })
  }
  if (metadata.twitterCreator) {
    metaTags.push({ name: "twitter:creator", content: metadata.twitterCreator })
  }
  if (ogTitle) {
    metaTags.push({ name: "twitter:title", content: ogTitle })
  }
  if (ogDescription) {
    metaTags.push({ name: "twitter:description", content: ogDescription })
  }
  if (ogImage) {
    metaTags.push({ name: "twitter:image", content: ogImage })
  }

  const seoData = {
    title: metadata.title || "Untitled",
    htmlAttrs: { lang: metadata.language || "en" },
    meta: metaTags,
    link: metadata.canonical ? [{ rel: "canonical", href: metadata.canonical }] : [],
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
  // Defensive: avoid raw </template> closing sequences
  const safeContent = String(contentHtml).replace(/<\/template>/gi, "</template><!-- -->")

  // If the content does not already have an <article>, wrap it for semantics
  const hasArticle = /<\s*article[\s>]/i.test(safeContent)
  const templateInner = hasArticle ? safeContent : `<article class="org-article">\n${safeContent}\n</article>`

  // Build script parts
  const metadataEncoded = safeEncodeForSfc(metadata)

  const setupImports = importLines.length ? `${importLines.join("\n")}\n` : ""
  const setupProps = propsDeclarations.length ? `\n  ${propsDeclarations.join("\n  ")}\n` : ""

  const optionsApiScript = `<script>
import { computed } from 'vue'
import { useHead } from '@unhead/vue'
${setupImports}
// Module-level metadata export (for consuming app to use if needed)
export const metadata = JSON.parse(decodeURIComponent('${metadataEncoded}'))

// Export seoMeta for consuming app to use with their own head management
export const seoMeta = {
  title: metadata.title || 'Untitled',
  htmlAttrs: { lang: metadata.language || 'en' },
  meta: [
    ${metadata.description ? `{ name: 'description', content: '${metadata.description.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.keywords ? `{ name: 'keywords', content: '${metadata.keywords.join(", ").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.author ? `{ name: 'author', content: '${metadata.author.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.robots ? `{ name: 'robots', content: '${metadata.robots.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.themeColor ? `{ name: 'theme-color', content: '${metadata.themeColor.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogTitle || metadata.title ? `{ property: 'og:title', content: '${(metadata.ogTitle || metadata.title || "").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogDescription || metadata.description ? `{ property: 'og:description', content: '${(metadata.ogDescription || metadata.description || "").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogImage || metadata.coverImage ? `{ property: 'og:image', content: '${(metadata.ogImage || metadata.coverImage || "").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.canonical ? `{ property: 'og:url', content: '${metadata.canonical.replace(/'/g, "\\'")}' },` : ""}
    { property: 'og:type', content: 'article' },
    ${metadata.twitterCard ? `{ name: 'twitter:card', content: '${metadata.twitterCard.replace(/'/g, "\\'")}' },` : "{ name: 'twitter:card', content: 'summary_large_image' },"}
    ${metadata.twitterSite ? `{ name: 'twitter:site', content: '${metadata.twitterSite.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.twitterCreator ? `{ name: 'twitter:creator', content: '${metadata.twitterCreator.replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogTitle || metadata.title ? `{ name: 'twitter:title', content: '${(metadata.ogTitle || metadata.title || "").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogDescription || metadata.description ? `{ name: 'twitter:description', content: '${(metadata.ogDescription || metadata.description || "").replace(/'/g, "\\'")}' },` : ""}
    ${metadata.ogImage || metadata.coverImage ? `{ name: 'twitter:image', content: '${(metadata.ogImage || metadata.coverImage || "").replace(/'/g, "\\'")}' },` : ""}
  ].filter(Boolean),
  link: ${metadata.canonical ? `[{ rel: 'canonical', href: '${metadata.canonical.replace(/'/g, "\\'")}' }]` : "[]"}
}

export default {
  setup() {
${setupProps}
    useHead(seoMeta)

    const formattedDate = computed(() => {
      if (!metadata.date) return ''
      try { return new Date(metadata.date).toLocaleDateString() } catch { return metadata.date }
    })

    return {
      metadata,
      formattedDate
    }
  }
}
</script>

`

  const styleBlock = `<style scoped>
.org-article { max-width: 820px; margin: 0 auto; padding: 24px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; line-height: 1.6; }
.article-header h1 { margin-bottom: 0.25rem; font-size: 1.8rem; }
.article-content img { max-width: 100%; height: auto; display: block; margin: 0.5rem 0; }
.article-meta { color: #555; font-size: 0.9rem; margin-bottom: 1rem; }
</style>
`

  return `<template>
${templateInner}
</template>

${optionsApiScript}${styleBlock}`
}
