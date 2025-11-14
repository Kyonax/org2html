// src/cli/commands/build.ts
import { readFile, writeFile, mkdir, copyFile } from "fs/promises"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import glob from "fast-glob"
import chalk from "chalk"
import { parse, renderToHtml, applyTemplate } from "../../index.js" // use parse + renderToHtml + applyTemplate
import { generateSlugFromMetadata, extractBaseDir, extractFolderPath } from "../utils.js"
import { existsSync } from "fs"
import { processComponentPlaceholders, buildVueSfc, stripDocumentWrapper } from "../vue-generator.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export async function buildCommand(input: string, options: any) {
  console.log(chalk.blue("Building Org files...\n"))

  const files = await glob(input.endsWith(".org") ? input : `${input}/**/*.org`)

  if (files.length === 0) {
    console.log(chalk.yellow("No .org files found"))
    return
  }

  console.log(chalk.gray(`Found ${files.length} file(s)\n`))

  const baseDir = extractBaseDir(input)
  console.log(chalk.gray(`Base directory: ${baseDir}\n`))

  // Create output directory
  await mkdir(options.output, { recursive: true })

  // Copy template assets to root output directory FIRST
  await copyTemplateAssets(options.output, options.templateDir)

  const sitemapEntries: any[] = []
  const feedEntries: any[] = []

  for (const file of files) {
    try {
      const content = await readFile(file, "utf-8")

      // Parse + render (no applyTemplate) so we get only article/body HTML
      const ast = parse(content)
      const renderResult = await renderToHtml(ast, {
        sanitize: options.sanitize,
        codeHighlight: options.highlight,
        templateDir: options.templateDir,
        componentMap: options.componentMap,
      })

      // Extract only the article/body HTML (strip wrappers & unsafe tags)
      const articleHtml = stripDocumentWrapper(renderResult.html)

      const folderPath = extractFolderPath(file, baseDir) // e.g., "games" or "devs/favorite"
      const articleSlug = generateSlugFromMetadata(renderResult.metadata) // e.g., "2025-01-21-game-title"

      // Combine folder path with article slug for final route
      const fullPath = folderPath ? `${folderPath}/${articleSlug}` : articleSlug
      const outputDir = join(options.output, fullPath)

      // Create output directory
      await mkdir(outputDir, { recursive: true })

      const staticHtml = await applyTemplate(
        renderResult.html,
        {
          ...renderResult.metadata,
          canonical: renderResult.metadata.canonical || `/${fullPath}`,
        },
        options.template,
        options.templateDir,
      )
      const htmlPath = join(outputDir, "index.html")
      await writeFile(htmlPath, staticHtml, "utf-8")

      // Attempt to load components-map.json from templateDir if present
      let componentsMap: Record<string, string> = {}
      if (options.templateDir) {
        try {
          const mapPath = join(options.templateDir, "components-map.json")
          if (existsSync(mapPath)) {
            const raw = await readFile(mapPath, "utf-8")
            componentsMap = JSON.parse(raw)
            console.log(chalk.gray("Loaded components-map.json from templateDir"))
          }
        } catch {
          // ignore errors
        }
      }

      // Process placeholders in articleHtml -> get import lines + processed html
      // Process placeholders in articleHtml -> get import lines + processed html + props declarations
      const processed = processComponentPlaceholders(articleHtml, componentsMap)

      // Write index.vue with real <template> DOM
      const vuePath = join(outputDir, "index.vue")
      const sfc = buildVueSfc(renderResult.metadata, processed.html, processed.imports, processed.propsDeclarations)
      await writeFile(vuePath, sfc, "utf-8")

      // Write metadata JSON
      const metaPath = join(outputDir, "metadata.json")
      await writeFile(metaPath, JSON.stringify(renderResult.metadata, null, 2))

      const ogPath = join(outputDir, "og-metadata.json")
      await writeFile(
        ogPath,
        JSON.stringify(
          {
            title: renderResult.metadata.ogTitle || renderResult.metadata.title,
            description:
              renderResult.metadata.ogDescription || renderResult.metadata.description || renderResult.metadata.excerpt,
            type: renderResult.metadata.ogType || "article",
            url: renderResult.metadata.canonical || `/${fullPath}`,
            image: renderResult.metadata.ogImage || renderResult.metadata.coverImage || "/default-og-image.png",
            publishedTime: renderResult.metadata.date,
            author: renderResult.metadata.author,
            tags: renderResult.metadata.tags,
            locale: renderResult.metadata.language || "en",
            siteName: renderResult.metadata.title,
            // Twitter Card metadata
            twitterCard: renderResult.metadata.twitterCard || "summary_large_image",
            twitterSite: renderResult.metadata.twitterSite,
            twitterCreator: renderResult.metadata.twitterCreator,
            // Additional SEO
            canonical: renderResult.metadata.canonical,
            robots: renderResult.metadata.robots || "index, follow",
            themeColor: renderResult.metadata.themeColor || "#0066cc",
          },
          null,
          2,
        ),
      )

      // Write structured data (JSON-LD)
      const structuredData = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: renderResult.metadata.title,
        description: renderResult.metadata.description || renderResult.metadata.excerpt,
        author: {
          "@type": "Person",
          name: renderResult.metadata.author || "Unknown",
        },
        datePublished: renderResult.metadata.date,
        wordCount: renderResult.metadata.wordCount,
        keywords: renderResult.metadata.keywords?.join(", "),
      }
      const structuredDataPath = join(outputDir, "structured-data.json")
      await writeFile(structuredDataPath, JSON.stringify(structuredData, null, 2))

      sitemapEntries.push({
        url: `/${fullPath}`,
        lastmod: renderResult.metadata.date || new Date().toISOString().split("T")[0],
        priority: 0.8,
        changefreq: "monthly",
      })

      feedEntries.push({
        title: renderResult.metadata.title,
        link: `/${fullPath}`,
        description: renderResult.metadata.description || renderResult.metadata.excerpt,
        pubDate: renderResult.metadata.date,
        author: renderResult.metadata.author,
        categories: renderResult.metadata.tags || [],
      })

      console.log(chalk.green("✓"), chalk.gray(file), "→", chalk.cyan(outputDir))
    } catch (error) {
      console.log(chalk.red("✗"), chalk.gray(file), chalk.red((error as Error).message))
      console.error(error)
    }
  }

  // Generate sitemap.json
  const sitemapPath = join(options.output, "sitemap.json")
  await writeFile(sitemapPath, JSON.stringify(sitemapEntries, null, 2))

  // Generate feed.json
  const feedPath = join(options.output, "feed.json")
  await writeFile(feedPath, JSON.stringify(feedEntries, null, 2))

  // --- generate routes.js for lazy-loaded Vue route components ---
  try {
    const routeLines = sitemapEntries.map((entry) => {
      const path = entry.url
      const folder = path.startsWith("/") ? path.slice(1) : path
      return `  { path: '${path}', component: () => import('./${folder}/index.vue') }`
    })

    const routesContent = `export const blogRoutes = [\n${routeLines.join(",\n")}\n]\n`
    await writeFile(join(options.output, "routes.js"), routesContent, "utf-8")
    console.log(chalk.gray(`Generated routes.js with ${routeLines.length} entries`))
  } catch (err) {
    console.log(chalk.yellow("⚠"), "Failed to generate routes.js", (err as Error).message)
  }

  console.log(chalk.green(`\nBuild complete! Output: ${options.output}`))
  console.log(chalk.gray(`Generated ${files.length} pages, sitemap.json, feed.json, and routes.js`))
}

async function copyTemplateAssets(outputDir: string, customTemplateDir?: string) {
  const templateDir = customTemplateDir || join(__dirname, "../../../templates")

  console.log(chalk.gray(`Copying template assets from: ${templateDir}`))

  // Assets to copy
  const assets = ["favicon.ico", "robots.txt", "manifest.json", "styles.css"]

  for (const asset of assets) {
    try {
      const sourcePath = join(templateDir, asset)
      const destPath = join(outputDir, asset)

      if (existsSync(sourcePath)) {
        await copyFile(sourcePath, destPath)
        console.log(chalk.green("✓"), chalk.gray(`Copied ${asset}`))
      } else {
        console.log(chalk.yellow("⚠"), chalk.gray(`${asset} not found, creating default...`))
        await createDefaultAsset(asset, destPath)
      }
    } catch (error) {
      console.log(chalk.red("✗"), chalk.gray(`Failed to copy ${asset}:`), (error as Error).message)
    }
  }
}

async function createDefaultAsset(assetName: string, destPath: string) {
  try {
    if (assetName === "robots.txt") {
      await writeFile(destPath, `User-agent: *\nAllow: /\n\nSitemap: /sitemap.xml`)
    } else if (assetName === "manifest.json") {
      await writeFile(
        destPath,
        JSON.stringify(
          {
            name: "Blog",
            short_name: "Blog",
            description: "A blog powered by org2html",
            start_url: "/",
            display: "standalone",
            background_color: "#ffffff",
            theme_color: "#0066cc",
            icons: [],
          },
          null,
          2,
        ),
      )
    } else if (assetName === "styles.css") {
      await writeFile(
        destPath,
        `body { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: system-ui; line-height: 1.6; }`,
      )
    }
    // Note: favicon.ico requires binary data, so we skip creating a default
  } catch (error) {
    // Silently fail
  }
}
