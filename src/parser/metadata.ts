import type { OrgMetadata, OrgOptions } from "../types.js"
import slugify from "slugify"

const METADATA_KEYS = [
  "TITLE",
  "AUTHOR",
  "DATE",
  "EMAIL",
  "DESCRIPTION",
  "KEYWORDS",
  "LANGUAGE",
  "CATEGORY",
  "FILETAGS",
  "OPTIONS",
  "EXPORT_FILE_NAME",
  "CANONICAL",
  "COVER_IMAGE",
  "OG_IMAGE",
  "OG_TITLE",
  "OG_DESCRIPTION",
  "OG_TYPE",
  "TWITTER_CARD",
  "TWITTER_SITE",
  "TWITTER_CREATOR",
  "THEME_COLOR",
  "ROBOTS",
]

export function extractMetadata(lines: string[]): {
  metadata: OrgMetadata
  contentStartLine: number
} {
  const metadata: OrgMetadata = {
    options: {},
    properties: {},
    tags: [],
    keywords: [],
  }

  let i = 0
  let inPropertyDrawer = false
  const propertyDrawerProps: Record<string, string> = {}

  // Parse metadata lines at the top
  while (i < lines.length) {
    const line = lines[i].trim()

    // Property drawer
    if (line === ":PROPERTIES:") {
      inPropertyDrawer = true
      i++
      continue
    }

    if (line === ":END:" && inPropertyDrawer) {
      inPropertyDrawer = false
      metadata.properties = { ...metadata.properties, ...propertyDrawerProps }
      i++
      continue
    }

    if (inPropertyDrawer) {
      const propMatch = line.match(/^:(\w+):\s*(.*)$/)
      if (propMatch) {
        propertyDrawerProps[propMatch[1]] = propMatch[2]
      }
      i++
      continue
    }

    // Metadata lines
    const metaMatch = line.match(/^#\+(\w+):\s*(.*)$/i)
    if (metaMatch) {
      const key = metaMatch[1].toUpperCase()
      const value = metaMatch[2].trim()

      switch (key) {
        case "TITLE":
          metadata.title = value
          break
        case "AUTHOR":
          metadata.author = value
          break
        case "DATE":
          metadata.date = value
          break
        case "EMAIL":
          metadata.email = value
          break
        case "DESCRIPTION":
          metadata.description = value
          break
        case "KEYWORDS":
          metadata.keywords = value.split(",").map((k) => k.trim())
          break
        case "LANGUAGE":
          metadata.language = value
          break
        case "CATEGORY":
          metadata.category = value
          break
        case "FILETAGS":
          metadata.tags = parseFileTags(value)
          break
        case "OPTIONS":
          metadata.options = { ...metadata.options, ...parseOptions(value) }
          break
        case "CANONICAL":
          metadata.canonical = value
          break
        case "COVER_IMAGE":
          metadata.coverImage = value
          break
        case "OG_IMAGE":
          metadata.ogImage = value
          break
        case "OG_TITLE":
          metadata.ogTitle = value
          break
        case "OG_DESCRIPTION":
          metadata.ogDescription = value
          break
        case "OG_TYPE":
          metadata.ogType = value
          break
        case "TWITTER_CARD":
          metadata.twitterCard = value as any
          break
        case "TWITTER_SITE":
          metadata.twitterSite = value
          break
        case "TWITTER_CREATOR":
          metadata.twitterCreator = value
          break
        case "THEME_COLOR":
          metadata.themeColor = value
          break
        case "ROBOTS":
          metadata.robots = value
          break
        default:
          // Store unknown metadata
          if (!metadata.properties) metadata.properties = {}
          metadata.properties[key] = value
      }
      i++
      continue
    }

    // Stop when we hit content
    if (line && !line.startsWith("#") && !line.startsWith(":")) {
      break
    }

    i++
  }

  // Generate slug
  if (metadata.title) {
    metadata.slug = slugify(metadata.title, { lower: true, strict: true })
  }

  return { metadata, contentStartLine: i }
}

function parseFileTags(value: string): string[] {
  // Parse :tag1:tag2:tag3: format
  const tags = value.match(/:(\w+)/g)
  return tags ? tags.map((t) => t.substring(1)) : []
}

export function parseOptions(optionsString: string): OrgOptions {
  const options: OrgOptions = {}

  // Split by whitespace, handling quoted values
  const parts = optionsString.match(/(\w+):(\S+)/g) || []

  for (const part of parts) {
    const [key, value] = part.split(":")

    switch (key.toLowerCase()) {
      case "toc":
        options.toc = value === "nil" ? false : value === "t" ? true : Number.parseInt(value, 10)
        break
      case "num":
        options.num = value !== "nil"
        break
      case "date":
        options.date = value !== "nil"
        break
      case "h":
        options.H = Number.parseInt(value, 10)
        break
      case "author":
        options.author = value !== "nil"
        break
      case "email":
        options.email = value !== "nil"
        break
      case "title":
        options.title = value !== "nil"
        break
      case "_":
        options.subscript = value !== "nil"
        break
      case "^":
        options.superscript = value !== "nil"
        break
      case "tex":
        options.tex = value !== "nil"
        break
      default:
        // Store unknown options
        options[key] = value === "nil" ? false : value === "t" ? true : value
    }
  }

  return options
}

export function calculateReadingTime(text: string): number {
  const wordsPerMinute = 200
  const words = text.split(/\s+/).length
  return Math.ceil(words / wordsPerMinute)
}

export function extractExcerpt(text: string, maxLength = 160): string {
  const cleaned = text.replace(/\s+/g, " ").trim()
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.substring(0, maxLength).trim() + "..."
}
