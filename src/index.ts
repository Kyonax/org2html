export { parse } from "./parser/parser.js";
export { renderToHtml } from "./renderer/html-renderer.js";
export { applyTemplate } from "./renderer/template.js";
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

  // Always apply template (default or custom)
  // COde Documentation here
  result.html = await applyTemplate(
    result.html,
    result.metadata,
    options.template,
    options.templateDir,
  );

  return result;
}
