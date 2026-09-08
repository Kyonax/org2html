/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/plugins/asset-fetcher.ts — image dimension resolver ([R-12]/[D-12]).
 *
 * Resolves the intrinsic width/height of the <img> elements in rendered HTML
 * so the output can reserve layout space. LOCAL images are probed from disk
 * (relative to the source .org file). REMOTE (http/https) images are only
 * touched when fetchRemoteAssets is 'metadata' or 'full' — 'metadata' probes
 * just enough bytes for the dimensions, 'full' downloads the whole body.
 * 'none' (the default) leaves remote images alone. Everything is best-effort:
 * a probe failure leaves the <img> untouched, never failing the build.
 */

import { isAbsolute, join } from "path"
import probe from "probe-image-size"
import type { AssetMetadata } from "../types.js"
import { probeLocalImage } from "../assets/asset-handler.js"

export type FetchMode = "none" | "metadata" | "full"

export interface AssetResolveOptions {
  /** Directory the source .org file lives in (to resolve relative img src). */
  baseDir?: string
  /** How to treat remote (http/https) images. Default 'none'. */
  fetchRemoteAssets?: FetchMode
}

const isRemote = (src: string) => /^https?:\/\//i.test(src)

async function probeRemote(url: string, mode: FetchMode): Promise<AssetMetadata | null> {
  if (mode === "none") return null
  try {
    // probe-image-size reads only the leading bytes for 'metadata'; 'full' still
    // resolves the same dimensions but is allowed to pull the whole body.
    const result: any = await (probe as any)(url)
    return { url, width: result.width, height: result.height, type: result.type }
  } catch {
    return null
  }
}

/** Resolve one image src to its dimensions (local probe or gated remote fetch). */
export async function resolveImageDimensions(
  src: string,
  opts: AssetResolveOptions = {},
): Promise<AssetMetadata | null> {
  if (isRemote(src)) return probeRemote(src, opts.fetchRemoteAssets ?? "none")
  // Local: resolve against the source directory (root-absolute srcs like
  // /img/x.png are site paths, not filesystem paths — skip them).
  if (src.startsWith("/")) return null
  const filePath = isAbsolute(src) ? src : join(opts.baseDir ?? process.cwd(), src)
  const dims = await probeLocalImage(filePath)
  return dims ? { url: src, width: dims.width, height: dims.height, type: dims.type } : null
}

/**
 * Scan rendered HTML for <img> without width/height and stamp the resolved
 * intrinsic dimensions. Returns the updated HTML + the collected metadata.
 */
export async function addImageDimensions(
  html: string,
  opts: AssetResolveOptions = {},
): Promise<{ html: string; assets: AssetMetadata[] }> {
  const assets: AssetMetadata[] = []
  const imgRe = /<img\b[^>]*>/gi
  const matches = html.match(imgRe) ?? []
  let out = html

  for (const tag of matches) {
    if (/\bwidth=/.test(tag) || /\bheight=/.test(tag)) continue
    const srcMatch = tag.match(/\bsrc=["']([^"']+)["']/i)
    if (!srcMatch) continue
    const meta = await resolveImageDimensions(srcMatch[1], opts)
    if (!meta?.width || !meta?.height) continue
    assets.push(meta)
    const stamped = tag.replace(/<img\b/i, `<img width="${meta.width}" height="${meta.height}"`)
    out = out.replace(tag, stamped)
  }

  return { html: out, assets }
}
