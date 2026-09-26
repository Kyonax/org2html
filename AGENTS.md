# Code Review Rules

## TypeScript

Comments are forbidden in TypeScript source EXCEPT:

1. **License preamble** — the GPL-3.0-only header at the top of every file. Mandatory; gated by `scripts/check-license-headers.mjs` and CI.
2. **Filename + description block** — immediately following the license preamble. Format:
   ```ts
   /*
    * <relative-path>.ts — <one-line description>
    *
    * <optional context paragraph>
    */
   ```
3. **JSDoc on exported helpers, type definitions, and surprising algorithms** — preserved when it carries non-obvious WHY (constraints, invariants, workarounds). Description-of-WHAT is still discouraged; well-named identifiers beat narration.

Placeholder, status, "what this does" inline comments that do NOT carry hidden information must still be removed.

The exact header template for each file type lives in `LICENSING.org` §File headers.
