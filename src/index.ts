/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/index.ts — Public library API.
 *
 * Re-exports parse / renderToHtml / applyTemplate and the
 * default async org2html() that chains all three. applyTemplate
 * is always called: callers who only want the article fragment
 * should call parse + renderToHtml directly.
 */

export { parse } from "./parser/parser.js";
export { renderToHtml } from "./renderer/html-renderer.js";
export { applyTemplate } from "./renderer/template.js";
export { resolveStyleBook, KNOWN_CONSTRUCTS } from "./renderer/style-book.js";
export { PluginRegistry, codeHighlightPlugin } from "./plugins/plugin-api.js";
export { renderComponentPlaceholder, parseComponentArgs, parseComponentBody } from "./plugins/shortcode.js";
export { addImageDimensions, resolveImageDimensions } from "./plugins/asset-fetcher.js";
export { probeLocalImage } from "./assets/asset-handler.js";
export { resolveOrgFileKeywords, parseIncludeSpec, startupToOptions } from "./cli/org-resolve.js";
export { titleFromFilename } from "./cli/utils.js";
export type * from "./types.js";

import { parse } from "./parser/parser.js";
import { renderToHtml } from "./renderer/html-renderer.js";
import { applyTemplate } from "./renderer/template.js";
import type { RenderOptions, RenderResult } from "./types.js";

export async function org2html(
  orgContent: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const ast = parse(orgContent);
  const result = await renderToHtml(ast, options);

  result.html = await applyTemplate(
    result.html,
    result.metadata,
    options.template,
    options.templateDir,
    {
      injectDefaultStyles: options.injectDefaultStyles,
      styleMode: options.styleMode,
      cssVars: options.cssVars,
      fontStack: options.fontStack,
    },
  );

  return result;
}
