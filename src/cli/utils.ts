import type { OrgMetadata } from "../types.js"
import slugify from "slugify"
import { relative, dirname, sep } from "path"

export function generateSlugFromMetadata(metadata: OrgMetadata): string {
  // Extract date or generate current timestamp
  let datePrefix = ""

  if (metadata.date) {
    // Parse date and format as YYYY-MM-DD
    const date = new Date(metadata.date)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, "0")
      const day = String(date.getDate()).padStart(2, "0")
      datePrefix = `${year}-${month}-${day}`
    }
  }

  // If no valid date, generate timestamp: YYYY-MM-DD-HH
  if (!datePrefix) {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    const hour = String(now.getHours()).padStart(2, "0")
    datePrefix = `${year}-${month}-${day}-${hour}`
  }

  // Generate slug from title
  const titleSlug = metadata.title ? slugify(metadata.title, { lower: true, strict: true }) : "untitled"

  return `${datePrefix}-${titleSlug}`
}

export function generatePathFromFile(filePath: string, baseDir: string): string {
  // Get relative path from base directory
  const relativePath = relative(baseDir, filePath)

  // Remove .org extension
  const withoutExt = relativePath.replace(/\.org$/, "")

  // Normalize path separators to forward slashes for URLs
  const normalizedPath = withoutExt.split(sep).join("/")

  return normalizedPath
}

export function extractFolderPath(filePath: string, baseDir: string): string {
  // Get relative path from base directory
  const relativePath = relative(baseDir, filePath)

  // Get directory name (without filename)
  const folderPath = dirname(relativePath)

  // Normalize path separators to forward slashes for URLs
  const normalizedPath = folderPath.split(sep).join("/")

  // Return empty string if it's the root (current directory)
  return normalizedPath === "." ? "" : normalizedPath
}

export function extractBaseDir(pattern: string): string {
  // If it's a specific file, return its directory
  if (pattern.endsWith(".org")) {
    return dirname(pattern)
  }

  // If it's a glob pattern like "content/**/*.org", extract "content"
  const parts = pattern.split("/")
  const globIndex = parts.findIndex((part) => part.includes("*"))

  if (globIndex > 0) {
    return parts.slice(0, globIndex).join("/")
  }

  // Default to the pattern itself (directory)
  return pattern.replace(/\/?\*\*?\/?\*?\.org$/, "") || "."
}
