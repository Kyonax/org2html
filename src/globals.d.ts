/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

declare const __PACKAGE_VERSION__: string;

// probe-image-size ships no types; we use width/height/type off its result.
declare module "probe-image-size" {
  interface ProbeResult {
    width: number
    height: number
    type?: string
    mime?: string
    [key: string]: unknown
  }
  function probe(src: unknown): Promise<ProbeResult>
  export default probe
}
