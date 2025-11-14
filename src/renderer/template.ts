import { readFile } from "fs/promises"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import type { OrgMetadata } from "../types.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function applyTemplate(
  html: string,
  metadata: OrgMetadata,
  templatePath?: string,
  templateDir?: string,
): Promise<string> {
  // Determine template and styles paths
  let template: string
  let styles: string

  if (templatePath) {
    // Custom template provided
    template = await readFile(templatePath, "utf-8")
    // Try to load custom styles from same directory
    try {
      const stylesPath = join(dirname(templatePath), "styles.css")
      styles = await readFile(stylesPath, "utf-8")
    } catch {
      styles = await getDefaultStyles()
    }
  } else if (templateDir) {
    // Custom template directory provided
    try {
      template = await readFile(join(templateDir, "default.html"), "utf-8")
      styles = await readFile(join(templateDir, "styles.css"), "utf-8")
    } catch {
      template = await getDefaultTemplate()
      styles = await getDefaultStyles()
    }
  } else {
    // Use built-in defaults
    template = await getDefaultTemplate()
    styles = await getDefaultStyles()
  }

  const title = metadata.title || "Untitled"
  const description = metadata.description || metadata.excerpt || ""
  const keywords = metadata.keywords?.join(", ") || ""
  const author = metadata.author || ""
  const date = metadata.date || new Date().toISOString()
  const language = metadata.language || "en"
  const canonical = metadata.canonical || ""
  const coverImage = metadata.coverImage || metadata.ogImage || "/default-og-image.png"
  const tags = metadata.tags?.join(", ") || ""

  // Open Graph metadata with fallbacks
  const ogTitle = metadata.ogTitle || title
  const ogDescription = metadata.ogDescription || description
  const ogImage = metadata.ogImage || coverImage
  const ogType = metadata.ogType || "article"

  // Twitter Card metadata with fallbacks
  const twitterCard = metadata.twitterCard || "summary_large_image"
  const twitterSite = metadata.twitterSite || ""
  const twitterCreator = metadata.twitterCreator || ""

  // Additional SEO metadata
  const themeColor = metadata.themeColor || "#0066cc"
  const robots = metadata.robots || "index, follow"

  // Generate structured data JSON-LD
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: description,
    author: {
      "@type": "Person",
      name: author || "Unknown",
    },
    datePublished: date,
    wordCount: metadata.wordCount || 0,
    keywords: keywords,
    image: ogImage,
  })

  return template
    .replace(/\{\{title\}\}/g, escapeHtml(title))
    .replace(/\{\{description\}\}/g, escapeHtml(description))
    .replace(/\{\{keywords\}\}/g, escapeHtml(keywords))
    .replace(/\{\{author\}\}/g, escapeHtml(author))
    .replace(/\{\{date\}\}/g, escapeHtml(date))
    .replace(/\{\{language\}\}/g, language)
    .replace(/\{\{canonical\}\}/g, escapeHtml(canonical))
    .replace(/\{\{coverImage\}\}/g, escapeHtml(coverImage))
    .replace(/\{\{tags\}\}/g, escapeHtml(tags))
    .replace(/\{\{ogTitle\}\}/g, escapeHtml(ogTitle))
    .replace(/\{\{ogDescription\}\}/g, escapeHtml(ogDescription))
    .replace(/\{\{ogImage\}\}/g, escapeHtml(ogImage))
    .replace(/\{\{ogType\}\}/g, escapeHtml(ogType))
    .replace(/\{\{twitterCard\}\}/g, escapeHtml(twitterCard))
    .replace(/\{\{twitterSite\}\}/g, escapeHtml(twitterSite))
    .replace(/\{\{twitterCreator\}\}/g, escapeHtml(twitterCreator))
    .replace(/\{\{themeColor\}\}/g, escapeHtml(themeColor))
    .replace(/\{\{robots\}\}/g, escapeHtml(robots))
    .replace(/\{\{structuredData\}\}/g, structuredData)
    .replace(/\{\{styles\}\}/g, styles)
    .replace(/\{\{content\}\}/g, html)
}

async function getDefaultTemplate(): Promise<string> {
  const templatePath = join(__dirname, "../../templates/default.html")
  try {
    return await readFile(templatePath, "utf-8")
  } catch {
    // Fallback inline template if file not found
    return `<!DOCTYPE html>
<html lang="{{language}}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <meta name="description" content="{{description}}">
  <style>{{styles}}</style>
</head>
<body>
  <article>{{content}}</article>
</body>
</html>`
  }
}

async function getDefaultStyles(): Promise<string> {
  const stylesPath = join(__dirname, "../../templates/styles.css")
  try {
    return await readFile(stylesPath, "utf-8")
  } catch {
    // Minimal fallback styles
    return `body { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: system-ui; line-height: 1.6; }`
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
