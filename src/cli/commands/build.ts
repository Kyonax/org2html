/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/commands/build.ts — Build command.
 *
 * fast-glob over the input pattern, render each .org file to
 * HTML + Vue SFC + metadata.json + og-metadata.json +
 * structured-data.json under <output>/<folder>/<slug>/, then
 * emit sitemap.json, feed.json, and a routes.js manifest of
 * lazy-loaded Vue route components.
 */

import { readFile, readdir, mkdir, copyFile, rm, rmdir } from "fs/promises"
import { join, dirname, basename, resolve } from "path"
import glob from "fast-glob"
import chalk from "chalk"
import { parse, renderToHtml, applyTemplate } from "../../index.js"
import { parseHeaderMetadata } from "../../parser/parser.js"
import { getDefaultStyles, normaliseAssetBase } from "../../renderer/template.js"
import { generateSlugFromMetadata, extractBaseDir, extractFolderPath, titleFromFilename } from "../utils.js"
import { existsSync, statSync } from "fs"
import { processComponentPlaceholders, buildVueSfc, stripDocumentWrapper } from "../vue-generator.js"
import { getTemplatesDir } from "../../paths.js"
import { resolveInside, writeFileAtomic } from "../fs-safe.js"
import { resolveStyling } from "../style-flags.js"
import { loadPlugins } from "../plugin-loader.js"
import { addImageDimensions } from "../../plugins/asset-fetcher.js"
import { computeRelations, type CorpusEntry } from "../relations.js"
import { absoluteUrl, resolveSeo, DEFAULT_THEME_COLOR } from "../../renderer/seo.js"
import { resolveOrgFileKeywords } from "../org-resolve.js"

/**
 * Files the LAST build pulled in through #+SETUPFILE / #+INCLUDE. `watch` adds
 * them to its watch set so editing a shared setupfile rebuilds the documents
 * that import it — without this a dev loop looks broken (edit the setupfile,
 * nothing happens).
 */
export const lastBuildDependencies = new Set<string>()

/*
 * The faces the DEFAULT book (kwo) wants preloaded — the two that paint first, the body and
 * the monospace regular. Not the bolds: preloading every weight fetches the bold before
 * anything needs it, which costs the very first render the preload exists to protect.
 * A Style Book overrides this with its own `preload` array in stylebook.json.
 */
const DEFAULT_PRELOAD_FONTS = ["GeomanistRegular.woff2", "SpaceMonoNerdFont-Regular.woff2"]

/**
 * Run `fn` with console.error prefixed by the document being processed.
 *
 * The engine's warners (lexer, parser, seo, shortcode) are pure and have no idea
 * which file they are working on, so `org2html: unknown component "Ghost"` used
 * to arrive with nothing to grep for in a corpus of hundreds. The CLI is the
 * layer that knows the path, so it is the layer that stamps it.
 */
async function withFileNamedWarnings<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const origErr = console.error
  console.error = (...a: unknown[]) => origErr(chalk.gray(file), ...a)
  try {
    return await fn()
  } finally {
    console.error = origErr
  }
}

export async function buildCommand(input: string, options: any) {
  // --quiet silences all info output; errors (console.error) always show. NO_COLOR
  // + TTY are already respected by chalk. [Stabilization S3-1]
  if (options.quiet) console.log = () => {}

  console.log(chalk.blue("Building Org files...\n"))

  // Resolve the full styling picture once (granular flags + optional
  // --style-book; reads --css/--css-append from disk) so the per-file loop
  // reuses one StyleOptions ([D-28]/[D-29]).
  const {
    styleOptions,
    classPrefix,
    componentMap: bookComponentMap,
    bookAssets,
  } = await resolveStyling(options)

  // Load any --plugin files once (conversion-time extension surface — R-07).
  const plugins = await loadPlugins(options.plugin ?? [])

  // Load the --components name→import-source map once ([R-13]/[D-28]); the Style
  // Book's map seeds it, --components overrides.
  let componentMap: Record<string, string> = { ...(bookComponentMap ?? {}) }
  if (options.components) {
    try {
      componentMap = { ...componentMap, ...JSON.parse(await readFile(options.components, "utf-8")) }
    } catch (err) {
      console.error(chalk.red(`Failed to read --components ${options.components}: ${(err as Error).message}`))
      process.exitCode = 1
      return
    }
  }

  const normalizedInput = input.replace(/\\/g, "/").replace(/\/+$/, "")
  const pattern = normalizedInput.endsWith(".org")
    ? normalizedInput
    : `${normalizedInput}/**/*.org`
  const files = await glob(pattern, { followSymbolicLinks: false, unique: true })

  if (files.length === 0) {
    console.error(chalk.red(`No .org files matched: ${input}`))
    process.exitCode = 1
    return
  }

  console.log(chalk.gray(`Found ${files.length} file(s)\n`))

  const baseDir = extractBaseDir(normalizedInput)
  console.log(chalk.gray(`Base directory: ${baseDir}\n`))

  // Pre-flight the output target: a path that exists as a FILE (not a dir) would
  // make mkdir/writes throw a cryptic ENOTDIR — surface a typed message instead.
  // [Stabilization S1-2]
  if (existsSync(options.output) && !statSync(options.output).isDirectory()) {
    throw new Error(`output path is not a directory: ${options.output}`)
  }

  // Create output directory
  await mkdir(options.output, { recursive: true })

  const sitemapEntries: any[] = []
  const feedEntries: any[] = []
  const usedPaths = new Map<string, string>()
  // Files pulled in by #+SETUPFILE / #+INCLUDE this run. `watch` reads them so
  // editing a shared setupfile rebuilds every document that imports it.
  const resolvedDeps = new Set<string>()
  let failures = 0

  /*
   * PASS ONE — the corpus index.
   *
   * Series, related reading and previous/next are facts about the CORPUS, and the render
   * loop below writes each page as it goes: by the time it knows what else exists, the
   * earlier pages are already on disk. So the metadata is collected first.
   *
   * This pass reads HEADERS ONLY — extractMetadata never tokenises a body — so the cost is
   * a file read and a keyword scan per document, not a second parse. The trade is stated
   * plainly: a macro-driven title that needs #+SETUPFILE resolution is not expanded here,
   * so a document whose TITLE comes from a macro appears in another page's series list
   * under its raw form. Every other field the index uses is a literal keyword.
   */
  /*
   * --verbose used to be accepted and read by nothing, which is worse than not
   * offering it: somebody passes it to find out why a build is slow or wrong and
   * concludes there is nothing to find out. It reports what the build actually
   * RESOLVED — flags after defaults and Style Book merging, not what was typed —
   * and what each document cost. On stderr, so --quiet cannot swallow a
   * diagnostic somebody asked for by name.
   */
  if (options.verbose) {
    const resolvedOptions = {
      input: baseDir,
      output: options.output,
      files: files.length,
      sanitize: options.sanitize !== false,
      highlight: options.highlight !== false,
      strict: Boolean(options.strict),
      resolveIncludes: options.resolveIncludes !== false,
      baseUrl: options.baseUrl ?? null,
      template: options.template ?? null,
      templateDir: options.templateDir ?? null,
      styleBook: options.styleBook ?? null,
      codeTheme: options.codeTheme ?? null,
      classPrefix: classPrefix || null,
      components: Object.keys(componentMap).length,
      plugins: plugins.length,
      fetchAssets: options.fetchAssets ?? "none",
    }
    console.error(chalk.cyan("verbose:"), chalk.gray("resolved options"))
    for (const [k, v] of Object.entries(resolvedOptions)) {
      console.error(chalk.gray(`  ${k.padEnd(16)} ${String(v)}`))
    }
  }

  const corpus: CorpusEntry[] = []
  // The SITE's name, for the one artefact that describes the site rather than a
  // page. First document that declares one wins; a corpus that declares none
  // keeps the template's name.
  let corpusSiteName: string | undefined
  for (const file of files) {
    try {
      const raw = await readFile(file, "utf-8")
      // Resolve the file layer here too. A #+TITLE built from a macro is not a
      // title until the macro is expanded, and the macro usually lives in a
      // #+SETUPFILE — so a header skim read the raw {{{name}}} and slugged a
      // route the render pass would never write. Warnings are deliberately
      // dropped: the render pass reports them, with the file name attached.
      const headResolved = await resolveOrgFileKeywords(raw, {
        baseDir: dirname(file),
        roots: options.includeRoot ?? [],
        enabled: options.resolveIncludes,
      })
      const head = parseHeaderMetadata(headResolved.content)
      corpusSiteName ??= head.siteName
      const folderPath = extractFolderPath(file, baseDir)
      // The render pass falls back to the FILE NAME for a document with no
      // #+TITLE, and titleFromFilename strips date and ordering prefixes
      // ("2026-08-21-my-post" reads as "My post"). Both passes must run the same
      // name through the same function or they slug different routes.
      const articleSlug = generateSlugFromMetadata(
        { ...head, title: head.title || titleFromFilename(file) },
        basename(file, ".org"),
      )
      const fullPath = folderPath ? `${folderPath}/${articleSlug}` : articleSlug
      corpus.push({
        url: `/${fullPath}`,
        slug: articleSlug,
        title: head.title || titleFromFilename(file),
        description: head.description,
        date: head.dateIso || head.date || "",
        series: head.series,
        seriesIndex: head.seriesIndex,
        categories: head.categories ?? (head.category ? [head.category] : []),
        // Header-declared only — see CorpusEntry.image for why a body `:main` mark cannot
        // reach this index.
        image: head.coverImage || head.ogImage || undefined,
        tags: head.tags ?? [],
        keywords: head.keywords ?? [],
        related: head.related,
        prevSlug: head.prevSlug,
        nextSlug: head.nextSlug,
      })
    } catch {
      // A file that cannot be read here will fail loudly in the render pass below, with
      // its own error and exit code; the index simply carries on without it.
    }
  }

  // Template assets are copied AFTER the corpus index and BEFORE the render loop.
  // The index is what knows the site's name, and manifest.json is a description
  // of the SITE — it may not be a verbatim copy of a template carrying a brand
  // colour and a name nobody chose. Note WHICH fonts landed: the {{fontPreload}}
  // slot is built from that list, so the head can only ever preload a face that
  // is really on disk ([#41]).
  const copiedFonts = await copyTemplateAssets(
    options.output,
    options.templateDir,
    options.fontDir,
    normaliseAssetBase(options.assetBase),
    bookAssets,
    { themeColor: styleOptions.bookThemeColor || DEFAULT_THEME_COLOR, siteName: corpusSiteName },
  )
  styleOptions.copiedFonts = copiedFonts
  // With no book selected, the default book's own two body faces are the preload set —
  // named here rather than in the template so the list stays intersected with reality.
  styleOptions.preloadFonts ??= DEFAULT_PRELOAD_FONTS
  if (copiedFonts.length === 0 && !options.quiet) {
    console.log(
      chalk.gray(
        "No webfonts found — nothing is preloaded and the token layer's system fallbacks apply.",
      ),
    )
    console.log(chalk.gray("Supply licensed faces with --font-dir <dir> to enable the book's."))
  }

  // Files are rendered SEQUENTIALLY on purpose (S3-4 decision): a corpus of 100+
  // builds comfortably, ordering stays deterministic, per-file try/catch isolates
  // a failure, and there is no shared-state race. Parallelism (a p-limit pool) is
  // deferred until a real large-corpus need appears — determinism first.
  for (const file of files) {
    const startedAt = options.verbose ? process.hrtime.bigint() : 0n
    try {
      const raw = await readFile(file, "utf-8")

      // Highlighting is where a very large document stops being linear: a
      // measured 40,051-line file peaks at 1.59 GB RSS with shiki and 0.72 GB
      // without. Say so before the machine finds out, and name the flag.
      const lineCount = raw.split("\n").length
      if (lineCount > 10_000) {
        console.error(
          chalk.yellow("⚠"),
          chalk.gray(file),
          chalk.yellow(
            `large document (${lineCount} lines) — highlighting a document this size can use >1 GB; consider --no-highlight`,
          ),
        )
      }

      // Resolve the file-layer keywords (#+SETUPFILE / #+INCLUDE / #+STARTUP)
      // BEFORE parsing — parse() is pure, everything that touches disk lives in
      // the CLI. Unresolved macro definitions used to leak {{{name}}} straight
      // into the output, which is exactly the silent corruption [D-26] forbids.
      const resolved = await resolveOrgFileKeywords(raw, {
        baseDir: dirname(file),
        roots: options.includeRoot ?? [],
        enabled: options.resolveIncludes,
      })
      for (const w of resolved.warnings) {
        console.error(chalk.yellow("⚠"), chalk.gray(file), chalk.yellow(w))
      }
      // --strict means "an unresolved reference is an error, not a hole in the
      // page". It used to cover unknown components only, so a #+INCLUDE that
      // silently resolved to nothing shipped a document with a gap in it and
      // exit 0 — under the very flag that exists to refuse exactly that.
      if (options.strict && resolved.warnings.length > 0) {
        throw new Error(`strict: ${resolved.warnings.join("; ")}`)
      }
      for (const dep of resolved.files) resolvedDeps.add(dep)
      const content = resolved.content

      // Parse + render (no applyTemplate) so we get only article/body HTML
      const renderResult = await withFileNamedWarnings(file, async () => {
        const ast = parse(content)
        return renderToHtml(ast, {
          sanitize: options.sanitize,
          codeHighlight: options.highlight,
          templateDir: options.templateDir,
          componentMap,
          strict: options.strict,
          theme: options.theme,
          codeTheme: options.codeTheme,
          classPrefix,
          plugins,
        })
      })

      // A document with no #+TITLE would slug to "untitled" — so a SECOND one
      // collides and fails the build — and would ship an empty <title>, which
      // for an SEO-focused converter is worse than the collision. Org falls back
      // to the file name; only the CLI knows it, so the fallback lands here.
      // Applied AFTER the render on purpose: it fixes the <title>, the slug and
      // the sidecars without injecting an <h1> the author never wrote.
      if (!renderResult.metadata.title) {
        renderResult.metadata.title = titleFromFilename(file)
      }

      // Stamp intrinsic <img> width/height (local probe; remote gated by
      // --fetch-assets) so the output reserves layout space ([R-12]).
      const dimensioned = await addImageDimensions(renderResult.html, {
        baseDir: dirname(file),
        fetchRemoteAssets: options.fetchAssets ?? "none",
      })
      renderResult.html = dimensioned.html
      if (dimensioned.assets.length > 0) renderResult.assets = dimensioned.assets

      // Extract only the article/body HTML (strip wrappers & unsafe tags)
      const articleHtml = stripDocumentWrapper(renderResult.html)

      const folderPath = extractFolderPath(file, baseDir) // e.g., "games" or "devs/favorite"
      const articleSlug = generateSlugFromMetadata(renderResult.metadata, basename(file, ".org")) // e.g., "2025-01-21-game-title"

      // Combine folder path with article slug for final route
      const fullPath = folderPath ? `${folderPath}/${articleSlug}` : articleSlug

      if (usedPaths.has(fullPath)) {
        console.error(
          chalk.red("✗"),
          chalk.gray(file),
          chalk.red(
            `output "${fullPath}" already produced by ${usedPaths.get(fullPath)} — resolve the duplicate #+TITLE/#+DATE`,
          ),
        )
        failures++
        continue
      }
      usedPaths.set(fullPath, file)

      // Stamp the resolved canonical onto the metadata ITSELF, not just into the
      // applyTemplate call. src/renderer/seo.ts exists so the static-HTML and Vue
      // heads stay in lockstep; setting it only on the template path meant the
      // .vue shipped without <link rel="canonical"> or og:url while the .html had
      // both — precisely the drift that module is there to prevent.
      if (!renderResult.metadata.canonical) {
        // --base-url makes it absolute, which is what a canonical is supposed to be and
        // what the structured data needs before it will name an @id at all.
        renderResult.metadata.canonical =
          absoluteUrl(options.baseUrl, `/${fullPath}`) || `/${fullPath}`
      }
      // The head's rel=prev/next need the same origin the canonical just used, or a deploy
      // under a path prefix gets a correct canonical beside a rel=next pointing at the domain
      // ROOT. relations.json itself stays SITE-RELATIVE ([P-00]) — the sidecar is data for the
      // host to route, while these two links are identities the engine publishes itself.
      renderResult.metadata.baseUrl = options.baseUrl

      // An empty route resolves to the output ROOT itself — resolveInside permits
      // it by design (the root is "inside" the root), so the page would overwrite
      // index.html at the top of --output and the next prune would delete the lot.
      // Refuse it here, inside the per-file try, so it counts as a named failure.
      if (!fullPath || fullPath === ".") {
        throw new Error("document resolves to an empty output path")
      }

      // Reject any slug/folder that would escape --output, then create the dir
      const outputDir = resolveInside(options.output, fullPath)
      await mkdir(outputDir, { recursive: true })

      // Relations are computed BEFORE the page is rendered, so the head can carry what
      // they imply — the series this post is part of, and prev/next as real link rels.
      const selfEntry = corpus.find((e) => e.url === `/${fullPath}`)
      const relations = selfEntry
        ? computeRelations(selfEntry, corpus, {
            homeLabel: options.homeLabel,
            baseUrl: options.baseUrl,
          })
        : undefined
      if (relations) renderResult.metadata.relations = relations

      const staticHtml = await withFileNamedWarnings(file, () =>
        applyTemplate(
          renderResult.html,
          renderResult.metadata,
          options.template,
          options.templateDir,
          styleOptions,
        ),
      )
      const htmlPath = join(outputDir, "index.html")
      await writeFileAtomic(htmlPath, staticHtml)

      // The resolved component map (Style Book + --components) seeds the Vue
      // import resolution; a templateDir components-map.json overrides ([D-29]).
      let componentsMap: Record<string, string> = { ...componentMap }
      if (options.templateDir) {
        try {
          const mapPath = join(options.templateDir, "components-map.json")
          if (existsSync(mapPath)) {
            const raw = await readFile(mapPath, "utf-8")
            componentsMap = { ...componentsMap, ...JSON.parse(raw) }
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
      await writeFileAtomic(vuePath, sfc)

      // One resolver for every output, so no two files can disagree about this document.
      const ogSeo = resolveSeo(renderResult.metadata)

      // Write metadata JSON
      const metaPath = join(outputDir, "metadata.json")
      // `relations` has its own sidecar; repeating it here would give consumers two copies
      // that can disagree after a partial rebuild.
      const { relations: _relations, ...metadataForFile } = renderResult.metadata
      /*
       * THE RESOLVED CARD IMAGE TRAVELS WITH THE DOCUMENT, not just in feed.json.
       * `mainImage` above is what the AUTHOR marked; `cardImage` is what a LISTING should
       * actually show, after #+COVER_IMAGE / the mark / #+OG_IMAGE have been ranked. A host
       * that had only the raw fields would have to re-implement that ranking to render a
       * card — and a fallback chain implemented twice is a fallback chain that disagrees
       * with itself the first time either side changes. The engine ranks; the host reads.
       */
      await writeFileAtomic(
        metaPath,
        JSON.stringify(
          {
            ...metadataForFile,
            cardImage: ogSeo.cardImage || undefined,
            cardImageAlt: ogSeo.cardImage ? ogSeo.cardImageAlt || undefined : undefined,
          },
          null,
          2,
        ),
      )

      // The relations sidecar (P-00): series, related reading, previous/next and the
      // breadcrumb trail, as DATA for the site shell to render. Written for every page so
      // a consumer can rely on the file existing, even when a document has no neighbours.
      if (relations) {
        await writeFileAtomic(
          join(outputDir, "relations.json"),
          JSON.stringify(relations, null, 2),
        )
      }

      const ogPath = join(outputDir, "og-metadata.json")
      await writeFileAtomic(
        ogPath,
        JSON.stringify(
          {
            title: renderResult.metadata.ogTitle || renderResult.metadata.title,
            description:
              renderResult.metadata.ogDescription || renderResult.metadata.description || renderResult.metadata.excerpt,
            type: renderResult.metadata.ogType || "article",
            url: renderResult.metadata.canonical || `/${fullPath}`,
            /*
             * RESOLVED, NOT RE-DEFAULTED — the same rule themeColor below already learned.
             * This used to fall back to a literal "/default-og-image.png", a file the
             * engine never writes and no consumer is promised: a host building its head
             * from this sidecar published a broken share image for every document that
             * declared none. An ABSENT field says "there is no picture", which is true and
             * which a consumer can act on; a path to nothing says there is one.
             */
            image: ogSeo.ogImage || undefined,
            imageAlt: ogSeo.ogImage ? ogSeo.ogImageAlt || undefined : undefined,
            // ISO or nothing. An Org timestamp (<2026-03-01 Sun>) is not a date a
            // crawler can read, and the head's JSON-LD has always published the
            // ISO form — ONE HEAD, TWO OUTPUTS, so the sidecar cannot say otherwise.
            ...(renderResult.metadata.dateIso ? { publishedTime: renderResult.metadata.dateIso } : {}),
            author: renderResult.metadata.author,
            tags: renderResult.metadata.tags,
            locale: renderResult.metadata.language || "en",
            /*
             * The SITE's name, never the article's — the same rule the head follows. This
             * sidecar was reporting the article title, so a host that built its head from
             * og-metadata.json reintroduced the exact defect the head had already fixed.
             */
            siteName: ogSeo.siteName || undefined,
            // Twitter Card metadata
            twitterCard: renderResult.metadata.twitterCard || "summary_large_image",
            twitterSite: renderResult.metadata.twitterSite,
            twitterCreator: renderResult.metadata.twitterCreator,
            // Additional SEO
            canonical: renderResult.metadata.canonical,
            robots: renderResult.metadata.robots || "index, follow",
            // Resolved, not re-defaulted: a second literal fallback here meant a swapped
            // style book recoloured the head and left this sidecar on the old brand.
            themeColor: ogSeo.themeColor,
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
        ...(renderResult.metadata.dateIso ? { datePublished: renderResult.metadata.dateIso } : {}),
        wordCount: renderResult.metadata.wordCount,
        keywords: renderResult.metadata.keywords?.join(", "),
      }
      const structuredDataPath = join(outputDir, "structured-data.json")
      await writeFileAtomic(structuredDataPath, JSON.stringify(structuredData, null, 2))

      sitemapEntries.push({
        url: `/${fullPath}`,
        // No wall clock. `new Date()` made an undated document's lastmod the day
        // the build ran, so two builds of the same source differed and THE BUILD
        // IS DETERMINISTIC stopped being true. An absent field is honest — the
        // same rule og-metadata.json already follows for images.
        ...(renderResult.metadata.dateIso ? { lastmod: renderResult.metadata.dateIso } : {}),
        priority: 0.8,
        changefreq: "monthly",
      })

      /*
       * feed.json is what an INDEX is built from — it is the only per-corpus file that
       * carries a document's own resolved fields rather than a header skim, so it is where
       * the card image belongs. `cardImage` and not `ogImage`: a listing is rendered by the
       * site itself, so a site-relative path is correct there and stays correct if the site
       * moves, while ogImage has been made absolute for crawlers that cannot resolve one.
       */
      feedEntries.push({
        title: renderResult.metadata.title,
        link: `/${fullPath}`,
        description: renderResult.metadata.description || renderResult.metadata.excerpt,
        ...(renderResult.metadata.dateIso ? { pubDate: renderResult.metadata.dateIso } : {}),
        author: renderResult.metadata.author,
        categories: renderResult.metadata.tags || [],
        image: ogSeo.cardImage || undefined,
        imageAlt: ogSeo.cardImage ? ogSeo.cardImageAlt || undefined : undefined,
      })

      console.log(chalk.green("✓"), chalk.gray(file), "→", chalk.cyan(outputDir))
      if (options.verbose) {
        const ms = Number(process.hrtime.bigint() - startedAt) / 1e6
        console.error(chalk.cyan("verbose:"), chalk.gray(file), chalk.gray(`${ms.toFixed(1)} ms`))
      }
    } catch (error) {
      console.error(chalk.red("✗"), chalk.gray(file), chalk.red((error as Error).message))
      // A document that FAILED is the one somebody most wants the timing for.
      if (options.verbose) {
        const ms = Number(process.hrtime.bigint() - startedAt) / 1e6
        console.error(
          chalk.cyan("verbose:"),
          chalk.gray(file),
          chalk.gray(`${ms.toFixed(1)} ms (failed)`),
        )
      }
      failures++
    }
  }

  // Publish this run's include graph for the watcher.
  lastBuildDependencies.clear()
  for (const dep of resolvedDeps) lastBuildDependencies.add(dep)

  // Generate sitemap.json
  const sitemapPath = join(options.output, "sitemap.json")
  await writeFileAtomic(sitemapPath, JSON.stringify(sitemapEntries, null, 2))

  // Generate feed.json
  const feedPath = join(options.output, "feed.json")
  await writeFileAtomic(feedPath, JSON.stringify(feedEntries, null, 2))

  // --- generate routes.js for lazy-loaded Vue route components ---
  try {
    const routeLines = sitemapEntries.map((entry) => {
      const path = entry.url
      const folder = path.startsWith("/") ? path.slice(1) : path
      return `  { path: '${path}', component: () => import('./${folder}/index.vue') }`
    })

    const routesContent = `export const blogRoutes = [\n${routeLines.join(",\n")}\n]\n`
    await writeFileAtomic(join(options.output, "routes.js"), routesContent)
    console.log(chalk.gray(`Generated routes.js with ${routeLines.length} entries`))
  } catch (err) {
    // THE ENGINE REFERENCES NO ASSET IT DID NOT WRITE. A missing routes.js is a
    // broken build, not a warning — and console.log is exactly what --quiet
    // replaces with a no-op, so this used to be zero bytes and exit 0.
    console.error(chalk.red("✗"), "Failed to generate routes.js:", (err as Error).message)
    process.exitCode = 1
  }

  // Prune stale output: page dirs a PREVIOUS run produced whose source is now
  // gone. Only paths recorded in our own .o2h-manifest.json are ever removed
  // (never user files), and resolveInside guards against escaping --output.
  // [Stabilization S3-2 — also fixes `watch` leaving orphans after an unlink]
  //
  // Deleting is the one thing a build does that cannot be undone by building
  // again, so every branch here is a REFUSAL to delete rather than a best guess:
  //
  //  · a build with FAILURES prunes nothing and does not rewrite the manifest —
  //    the manifest on disk still describes what a redeploy would serve, and the
  //    page we could not rebuild this run is exactly the one we must not remove.
  //  · a manifest written by a DIFFERENT input tree (two corpora sharing one
  //    --output) is not ours to act on: say so on stderr and keep the pages.
  //  · a stale entry is never removed with `rm -rf`. Only the six artefacts this
  //    engine writes are unlinked, then the directory is removed IF it is empty —
  //    so an operator's file inside a page dir, and a live child page nested under
  //    a stale parent's path, both survive.
  const manifestPath = join(options.output, ".o2h-manifest.json")
  const current = [...usedPaths.keys()]
  // Artefacts this engine writes into a page directory. Anything else in there
  // came from somewhere else and is not ours to delete.
  const ENGINE_ARTEFACTS = [
    "index.html",
    "index.vue",
    "metadata.json",
    "og-metadata.json",
    "structured-data.json",
    "relations.json",
  ]
  if (failures > 0) {
    console.error(
      chalk.yellow("⚠"),
      chalk.gray(`${failures} failure(s) — not pruning and leaving .o2h-manifest.json as it was`),
    )
  } else {
    try {
      const currentSet = new Set(current)
      const outputRoot = resolve(options.output)
      let previous: { version?: number; input?: string; pages: string[] } | null = null
      if (existsSync(manifestPath)) {
        try {
          const raw = JSON.parse(await readFile(manifestPath, "utf-8"))
          // v1 is an object; a bare ARRAY is the legacy shape, whose input is unknown.
          previous = Array.isArray(raw) ? { pages: raw } : { ...raw, pages: raw.pages ?? [] }
        } catch {
          previous = null
        }
      }

      const baseDirResolved = resolve(baseDir)
      if (previous && previous.input !== baseDirResolved) {
        console.error(
          chalk.yellow("⚠"),
          chalk.gray(
            `org2html: ${options.output} holds pages built from ${previous.input ?? "an unknown input"} — not pruning`,
          ),
        )
      } else if (previous) {
        let pruned = 0
        for (const stale of previous.pages) {
          // "" and "." both resolve to the output ROOT. Never.
          if (!stale || stale === "." || currentSet.has(stale)) continue
          try {
            const dir = resolveInside(options.output, stale)
            if (dir === outputRoot || !existsSync(dir)) continue
            for (const artefact of ENGINE_ARTEFACTS) {
              await rm(join(dir, artefact), { force: true })
            }
            // Only if nothing else is left — a nested live page or an operator's
            // file keeps the directory, and that is the correct outcome.
            await rmdir(dir).catch(() => {})
            pruned++
            console.log(chalk.gray(`Pruned stale output: ${stale}`))
          } catch {
            // ignore a path we cannot safely resolve/remove
          }
        }
        // console.log is silenced by --quiet; a deletion is never silent.
        if (pruned > 0) console.error(chalk.gray(`Pruned ${pruned} stale page(s)`))
      }

      await writeFileAtomic(
        manifestPath,
        JSON.stringify({ version: 1, input: baseDirResolved, pages: current }, null, 2),
      )
    } catch {
      // manifest is best-effort; never fail the build over pruning
    }
  }

  const succeeded = files.length - failures
  if (failures > 0) {
    console.error(
      chalk.red(
        `\nBuild finished with ${failures} failure(s); ${succeeded}/${files.length} file(s) written to ${options.output}`,
      ),
    )
    process.exitCode = 1
    return
  }

  // Per-asset, routes.js and font failures never increment `failures` — they are
  // not document failures — so the exit code is the only thing that knows. A
  // build that says "Build complete!" while exiting 1 is the silent wrong answer
  // this whole pass exists to remove.
  if (process.exitCode === 1) {
    console.error(
      chalk.red(
        `\nBuild finished with errors; ${succeeded} page(s) written to ${options.output}`,
      ),
    )
    return
  }

  console.log(chalk.green(`\nBuild complete! Output: ${options.output}`))
  console.log(chalk.gray(`Generated ${succeeded} page(s), sitemap.json, feed.json, and routes.js`))

  /*
   * Inline CSS is the DEFAULT and stays the default: one file that renders with
   * no second request is the right trade for a page, and NOTHING THE READER PAYS
   * FOR means the reader should not wait on a stylesheet to see text. But the
   * default book is about 200 KB, and inlining it into every page of a large
   * corpus is a cost nobody chose — it is just what happens. Measured on this
   * engine: a short document is ~203 KB inlined and ~3.9 KB linked, beside one
   * shared ~200 KB styles.css.
   *
   * So: a hint, not a change, and only where the arithmetic has clearly turned.
   */
  if (!options.linkStyles && succeeded > 50) {
    // Rounding to whole megabytes reported the linked total as "~0 MB", which
    // reads as a measurement failure rather than as "very small".
    const size = (bytes: number) =>
      bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`
    console.error(
      chalk.gray(
        `org2html: ${succeeded} pages inline the style book (~${size(succeeded * 203_000)} total); ` +
          `--link-styles ships one shared styles.css instead ` +
          `(~${size(succeeded * 3_900 + 200_000)})`,
      ),
    )
  }
}

/** The brand facts manifest.json must agree with the page head about. */
interface ManifestBrand {
  themeColor: string
  siteName?: string
}

async function copyTemplateAssets(
  outputDir: string,
  customTemplateDir?: string,
  fontDir?: string,
  assetBase = "",
  bookAssets?: string[],
  brand?: ManifestBrand,
): Promise<string[]> {
  const templateDir = customTemplateDir || getTemplatesDir()

  console.log(chalk.gray(`Copying template assets from: ${templateDir}`))

  // Assets to copy
  const assets = ["favicon.svg", "robots.txt", "manifest.json", "styles.css", "o2h.js"]

  // Webfonts referenced by the default book's @font-face rules. Copied as a
  // directory because the stylesheet points at /fonts/<file>.woff2; a build
  // whose fonts are missing still renders, on the system fallbacks the token
  // layer declares.
  const copiedFonts = await copyFontAssets(outputDir, templateDir, fontDir)

  // A Style Book's own `assets` array, finally consumed. Declared paths are relative to the
  // book directory and are THIRD-PARTY INPUT — a book resolved from npm or a URL is not this
  // repo's code — so every source is confined to the book and every destination to the
  // output. Anything already handled above is skipped rather than copied twice.
  if (bookAssets?.length) {
    await copyBookAssets(outputDir, templateDir, bookAssets, new Set(assets))
  }

  for (const asset of assets) {
    try {
      const sourcePath = join(templateDir, asset)
      const destPath = join(outputDir, asset)

      if (asset === "manifest.json" && brand) {
        // Composed, not copied. The template ships theme_color #FF5114 and the
        // name "Blog", and the generic copy branch put both on disk beside a head
        // resolving a completely different colour — the same drift already fixed
        // for og-metadata.json, in the one file an installed PWA reads.
        let base: Record<string, unknown> = {}
        try {
          base = JSON.parse(await readFile(sourcePath, "utf-8"))
        } catch {
          base = {
            short_name: "Blog",
            description: "A blog powered by org2html",
            start_url: "/",
            display: "standalone",
            background_color: "#ffffff",
            icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
          }
        }
        const composed = {
          ...base,
          ...(brand.siteName ? { name: brand.siteName, short_name: brand.siteName } : {}),
          theme_color: brand.themeColor,
        }
        await writeFileAtomic(destPath, JSON.stringify(composed, null, 2))
        console.log(chalk.green("✓"), chalk.gray("Wrote manifest.json (composed)"))
      } else if (asset === "styles.css") {
        // Write the COMPLETE bundle (token layer + shared constructs + book
        // layer), not the raw file — so the hosted /styles.css is
        // self-contained and matches the inline output, ready for
        // --link-styles. Composed with the SAME asset base the head uses, or a
        // linked sheet would point at /fonts/… while the page points at /base/fonts/….
        await writeFileAtomic(destPath, await getDefaultStyles(assetBase, copiedFonts))
        console.log(chalk.green("✓"), chalk.gray("Wrote styles.css (bundled)"))
      } else if (existsSync(sourcePath)) {
        await copyFile(sourcePath, destPath)
        console.log(chalk.green("✓"), chalk.gray(`Copied ${asset}`))
      } else {
        console.log(chalk.yellow("⚠"), chalk.gray(`${asset} not found, creating default...`))
        await createDefaultAsset(asset, destPath)
      }
    } catch (error) {
      // The head links these by name. An asset that failed to land is a 404 the
      // engine itself authored, so it fails the build rather than warning.
      console.error(chalk.red("✗"), chalk.gray(`Failed to copy ${asset}:`), (error as Error).message)
      process.exitCode = 1
    }
  }

  return copiedFonts
}

/**
 * Copy a Style Book's declared `assets`, confined at BOTH ends.
 *
 * A book can be a directory, an npm package or a URL ([D-28]), so its manifest is untrusted:
 * `"../../../.ssh/id_rsa"` in that array must read nothing, and a destination outside
 * --output must write nothing. resolveInside enforces both, and a refusal warns and skips
 * rather than failing the build — one bad entry in a third-party manifest should not cost a
 * site its pages.
 */
async function copyBookAssets(
  outputDir: string,
  bookDir: string,
  bookAssets: string[],
  alreadyCopied: Set<string>,
): Promise<void> {
  let copied = 0
  for (const entry of bookAssets) {
    const name = entry.split("/").pop() ?? entry
    if (alreadyCopied.has(name)) continue
    /* Fonts have their own directory-wide copy above, with their own preload bookkeeping. */
    if (name.endsWith(".woff2")) continue
    try {
      const src = resolveInside(bookDir, entry)
      if (!existsSync(src)) continue
      const dest = resolveInside(outputDir, name)
      await mkdir(dirname(dest), { recursive: true })
      await copyFile(src, dest)
      copied++
    } catch (error) {
      console.error(
        chalk.yellow("⚠"),
        chalk.gray(`Style Book asset refused (${entry}):`),
        (error as Error).message,
      )
    }
  }
  if (copied) console.log(chalk.green("✓"), chalk.gray(`Copied ${copied} Style Book asset(s)`))
}

/**
 * Copy the webfonts into <output>/fonts/ and RETURN WHAT WAS ACTUALLY COPIED.
 *
 * The return value is the whole point. templates/default.html used to preload two faces
 * unconditionally, while the published tarball ships ZERO .woff2 — org2html does not
 * redistribute Geomanist or the Nerd-patched Space Mono, because their licensing is the
 * consuming project's call ([#41]). So every page of every install emitted two preload 404s
 * plus four dead @font-face rules, silently, forever. THE DEFECT WAS THE UNCONDITIONAL
 * PRELOAD, NOT THE ABSENCE — and a preload list can only be honest if it is built from the
 * files that are really there.
 *
 * `--font-dir` is the supported way to supply licensed faces. It is searched AFTER the
 * template directory and wins on a name collision, so a project can override one weight
 * without vendoring the whole set.
 */
async function copyFontAssets(
  outputDir: string,
  templateDir: string,
  fontDir?: string,
): Promise<string[]> {
  const sources = [join(templateDir, "fonts"), ...(fontDir ? [fontDir] : [])].filter((d) =>
    existsSync(d),
  )
  if (sources.length === 0) return []

  const destDir = join(outputDir, "fonts")
  const copied = new Map<string, string>()
  try {
    for (const dir of sources) {
      for (const file of (await readdir(dir)).filter((f) => f.endsWith(".woff2"))) {
        /* A font directory is operator-supplied input and a filename is a path: a face called
         * "../../etc/x.woff2" must not escape the output. */
        resolveInside(destDir, file)
        copied.set(file, join(dir, file))
      }
    }
    if (copied.size === 0) return []
    await mkdir(destDir, { recursive: true })
    for (const [file, src] of copied) {
      await copyFile(src, join(destDir, file))
    }
    console.log(chalk.green("✓"), chalk.gray(`Copied ${copied.size} font file(s)`))
    return [...copied.keys()].sort()
  } catch (error) {
    // A warning, not a failure: the preload list is intersected with what really
    // landed ([#41]), so a missing face degrades honestly. It still belongs on
    // stderr, where --quiet cannot hide it.
    console.error(chalk.yellow("⚠"), chalk.gray("Failed to copy fonts:"), (error as Error).message)
    /* Report only what really landed — a half-finished copy must not license a preload. */
    return [...copied.keys()].filter((f) => existsSync(join(destDir, f))).sort()
  }
}

async function createDefaultAsset(assetName: string, destPath: string) {
  try {
    if (assetName === "robots.txt") {
      // No Sitemap line. The engine writes sitemap.JSON, never sitemap.xml, so
      // the template's `Sitemap: {{baseUrl}}/sitemap.xml` shipped verbatim (it is
      // copied, never templated) and pointed every crawler at a 404. A host that
      // composes a real sitemap.xml owns robots.txt through --template-dir.
      await writeFileAtomic(destPath, `User-agent: *\nAllow: /\n`)
    } else if (assetName === "manifest.json") {
      await writeFileAtomic(
        destPath,
        JSON.stringify(
          {
            name: "Blog",
            short_name: "Blog",
            description: "A blog powered by org2html",
            start_url: "/",
            display: "standalone",
            background_color: "#ffffff",
            theme_color: DEFAULT_THEME_COLOR,
            icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
          },
          null,
          2,
        ),
      )
    } else if (assetName === "styles.css") {
      await writeFileAtomic(
        destPath,
        `body { max-width: 800px; margin: 0 auto; padding: 2rem; font-family: system-ui; line-height: 1.6; }`,
      )
    }
    // Note: favicon.ico requires binary data, so we skip creating a default
  } catch (error) {
    // Same rule as the copy path: the default is written because the head is
    // about to reference it. Failing to write it is a failed build.
    console.error(
      chalk.red("✗"),
      chalk.gray(`Failed to write default ${assetName}:`),
      (error as Error).message,
    )
    process.exitCode = 1
  }
}
