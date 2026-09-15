/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/assets/asset-handler.ts — local image/video metadata writer ([R-12]).
 *
 * Probes a LOCAL image file for its intrinsic width/height (via
 * probe-image-size over a read stream) so the renderer/build can stamp
 * <img width height> and reserve layout space (CLS win, WCAG-adjacent).
 * Remote assets are handled by asset-fetcher.ts. Failures are non-fatal:
 * a missing/unreadable/undecodable file returns null and the <img> is left
 * dimensionless rather than breaking the build.
 */

import { createReadStream, existsSync } from "fs"
import probe from "probe-image-size"

export interface ImageDimensions {
  width: number
  height: number
  type?: string
}

/** Probe a local image file for intrinsic dimensions; null on any failure. */
export async function probeLocalImage(filePath: string): Promise<ImageDimensions | null> {
  if (!existsSync(filePath)) return null
  try {
    const stream = createReadStream(filePath)
    try {
      const result = await probe(stream)
      return { width: result.width, height: result.height, type: result.type }
    } finally {
      stream.destroy()
    }
  } catch {
    return null
  }
}
