/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

let cachedTemplatesDir: string | undefined;

export function getTemplatesDir(): string {
  if (cachedTemplatesDir) return cachedTemplatesDir;

  const start = dirname(fileURLToPath(import.meta.url));
  let dir = start;

  for (let depth = 0; depth < 10; depth++) {
    const candidate = join(dir, "templates");
    if (existsSync(join(candidate, "default.html"))) {
      cachedTemplatesDir = candidate;
      return cachedTemplatesDir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  cachedTemplatesDir = join(start, "..", "templates");
  return cachedTemplatesDir;
}
