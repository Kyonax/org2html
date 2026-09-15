#!/usr/bin/env node
/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/index.ts — Commander setup.
 *
 * Wires the five CLI commands (build / watch / test / comments / help)
 * and a bespoke top-level help message. The version string is
 * injected at build time from package.json through the tsup
 * `__PACKAGE_VERSION__` define, so `--version` cannot drift.
 */

import { Command } from "commander";
import { buildCommand } from "./commands/build.js";
import { watchCommand } from "./commands/watch.js";
import { testCommand } from "./commands/test.js";
import { filterCommand } from "./commands/filter.js";
import { commentsCommand } from "./commands/comments.js";

const program = new Command();

// Wrap an async command action so any thrown/rejected error surfaces as a single
// clear line on stderr (not a raw stack) and sets a non-zero exit code — mirrors
// filter mode's .catch. [Stabilization S1-1]
function guarded<A extends unknown[]>(fn: (...args: A) => unknown | Promise<unknown>) {
    return async (...args: A): Promise<void> => {
        try {
            await fn(...args);
        } catch (err) {
            console.error(`org2html: ${(err as Error).message}`);
            process.exitCode = 1;
        }
    };
}

program
    .name("org2html")
    .description(
        "Convert Org-mode (.org) files into clean, customizable HTML pages.",
    )
    .version(__PACKAGE_VERSION__);

// Build command
program
    .command("build")
    .description("Build Org files to static HTML output.")
    .argument("<input>", "Input file or directory containing .org files")
    .option("-o, --output <dir>", "Output directory for HTML files", "dist")
    .option("-t, --template <file>", "Path to a custom HTML template file")
    .option(
        "--template-dir <dir>",
        "Path to a directory with templates and assets",
    )
    .option(
        "--no-sanitize",
        "Disable HTML sanitization for raw HTML in Org files",
    )
    .option("--no-highlight", "Disable syntax highlighting for code blocks")
    .option("--theme <name>", "Color theme on the root (e.g. light | dark)")
    .option(
        "--code-theme <name>",
        "Shiki theme for code blocks (default: css-variables)",
    )
    .option(
        "--class-prefix <prefix>",
        "Namespace for emitted class hooks (default: org-)",
    )
    .option("--font <stack>", "Body font-family stack (--host-font-editorial)")
    .option(
        "--css-var <pair...>",
        "Custom property override name=value (repeatable)",
    )
    .option("--css <file>", "Inline a CSS file, replacing the default stylesheet")
    .option(
        "--css-append <file>",
        "Inline a CSS file, appended after the default stylesheet",
    )
    .option(
        "--link-css <href...>",
        "Reference an external stylesheet via <link> (repeatable)",
    )
    .option("--style-book <ref>", "Swap the whole look via a Style Book (dir | npm | URL)")
    .option("--plugin <file...>", "Load a conversion-time plugin file (repeatable)")
    .option("--components <file>", "JSON map of component name -> import source")
    .option("--strict", "Error on an unknown component or an unresolved #+INCLUDE/#+SETUPFILE instead of warning")
    .option("--fetch-assets <mode>", "Resolve remote image dims: none | metadata | full", "none")
    // SEO: a canonical and a structured-data @id are IDENTITIES, so they need an absolute
    // URL. Without a base the canonical stays site-relative and the JSON-LD declines to
    // name a url at all, rather than publishing one a crawler cannot resolve.
    .option(
      "--base-url <url>",
      "Site origin (https://example.com) — makes the canonical and JSON-LD URLs absolute",
    )
    .option("--home-label <text>", "Label for the root crumb in relations.json", "Home")
    .option("--no-math", "Keep LaTeX fragments raw instead of typesetting them to MathML")
    .option("-q, --quiet", "Suppress non-error output")
    .option("-v, --verbose", "Print the resolved options and a per-document timing to stderr")
    .option("--no-default-styles", "Do not inline the engine's default stylesheet")
    .option("--link-styles", "Host the default stylesheet at /styles.css and link it (one cached file across pages) instead of inlining")
    .option(
        "--include-root <dir...>",
        "Extra directory a document may read #+SETUPFILE / #+INCLUDE from (repeatable)",
    )
    .option(
        "--no-resolve-includes",
        "Do not resolve #+SETUPFILE / #+INCLUDE / #+STARTUP",
    )
    .option(
        "--asset-base <path>",
        "Prefix for every root-absolute asset ref — for a non-root deploy (/my-project)",
    )
    .option(
        "--font-dir <dir>",
        "Directory of .woff2 faces to copy and preload (org2html ships no fonts)",
    )
    .option("--no-scripts", "Do not reference the default interactive runtime (/o2h.js)")
    .action(guarded(buildCommand));

// Watch command
program
    .command("watch")
    .description(
        "Watch Org files and rebuild automatically when changes are detected.",
    )
    .argument("<input>", "Input file or directory")
    .option("-o, --output <dir>", "Output directory for HTML files", "dist")
    .option("-t, --template <file>", "Path to a custom HTML template file")
    .option(
        "--template-dir <dir>",
        "Path to a directory with templates and assets",
    )
    .option("--no-sanitize", "Disable HTML sanitization for raw HTML in Org files")
    .option("--no-highlight", "Disable syntax highlighting for code blocks")
    .option("--theme <name>", "Color theme on the root (e.g. light | dark)")
    .option(
        "--code-theme <name>",
        "Shiki theme for code blocks (default: css-variables)",
    )
    .option(
        "--class-prefix <prefix>",
        "Namespace for emitted class hooks (default: org-)",
    )
    .option("--font <stack>", "Body font-family stack (--host-font-editorial)")
    .option(
        "--css-var <pair...>",
        "Custom property override name=value (repeatable)",
    )
    .option("--css <file>", "Inline a CSS file, replacing the default stylesheet")
    .option(
        "--css-append <file>",
        "Inline a CSS file, appended after the default stylesheet",
    )
    .option(
        "--link-css <href...>",
        "Reference an external stylesheet via <link> (repeatable)",
    )
    .option("--style-book <ref>", "Swap the whole look via a Style Book (dir | npm | URL)")
    .option("--plugin <file...>", "Load a conversion-time plugin file (repeatable)")
    .option("--components <file>", "JSON map of component name -> import source")
    .option("--strict", "Error on an unknown component or an unresolved #+INCLUDE/#+SETUPFILE instead of warning")
    .option("--fetch-assets <mode>", "Resolve remote image dims: none | metadata | full", "none")
    .option("-q, --quiet", "Suppress non-error output")
    .option("-v, --verbose", "Print the resolved options and a per-document timing to stderr")
    .option("--no-default-styles", "Do not inline the engine's default stylesheet")
    .option("--link-styles", "Host the default stylesheet at /styles.css and link it instead of inlining")
    .option(
        "--include-root <dir...>",
        "Extra directory a document may read #+SETUPFILE / #+INCLUDE from (repeatable)",
    )
    .option(
        "--no-resolve-includes",
        "Do not resolve #+SETUPFILE / #+INCLUDE / #+STARTUP",
    )
    .option(
        "--asset-base <path>",
        "Prefix for every root-absolute asset ref — for a non-root deploy (/my-project)",
    )
    .option(
        "--font-dir <dir>",
        "Directory of .woff2 faces to copy and preload (org2html ships no fonts)",
    )
    .option("--no-scripts", "Do not reference the default interactive runtime (/o2h.js)")
    .action(guarded(watchCommand));

// Test command
program
    .command("test")
    .description(
        "Test the Org parser and preview HTML output for a single file.",
    )
    .argument("<file>", "Path to the Org file to test")
    .action(testCommand);

// Comments command — the OTHER HALF of #+POST_URL, and deliberately not part of `build`.
// `build` records the announcement post as DATA and never calls X ([P-00]/[D-28]); this
// subcommand is the only thing in the package that reaches the network, which is what keeps
// "the engine makes no build-time network call" true while the feature still ships.
program
    .command("comments")
    .description(
        "Fetch, review and moderate the X replies to documents carrying #+POST_URL.",
    )
    .argument(
        "<action>",
        "fetch | sample | clear | review | rejudge | approve",
    )
    .argument("<built-dir>", "Directory a previous `org2html build` wrote")
    .argument("[id]", "Held reply id — required by `approve`")
    .option(
        "--cache <dir>",
        "Published thread cache; this directory is SERVED (default: comments)",
    )
    .option(
        "--held <dir>",
        "Quarantine for withheld replies; MUST be outside --cache (default: comments-held)",
    )
    .option("--slug <slug>", "Only the built document directory with this name")
    .option("--blocklist <file>", "Policy file with the project's own terms and limits")
    .option("-n, --dry-run", "Fetch and report, write nothing")
    .option("-f, --force", "Re-download cached avatars, rebuild the sprite, permit destruction")
    .option("-q, --quiet", "Suppress informational output")
    .action(guarded(commentsCommand));

// Custom help command
program
    .command("help [command]")
    .description(
        "Show help for all commands or details for a specific command.",
    )
    .action((commandName?: string) => {
        if (!commandName) {
            console.log(`
org2html - Convert Org-mode (.org) files into HTML

Usage:
  org2html <command> [options]

Commands:
  build <input>     Build Org files to static HTML output (main command for production builds)
  watch <input>     Watch files and rebuild automatically when changes occur (useful for development)
  test <file>       Test the Org parser and preview HTML output for a single file
  comments <action> <built-dir> [id]
                    Fetch and moderate the X replies to documents carrying #+POST_URL.
                    Never runs as part of 'build': the engine makes no build-time
                    network call, so this is the only command that reaches X.
                    Actions: fetch | sample | clear | review | rejudge | approve
  help [command]    Show this help message or detailed help for a specific command

Filter mode (stdin -> stdout):
  org2html --stdin  Convert one Org document from stdin and write it to stdout
  org2html -        Shorthand for --stdin
    --format <fmt>  Output format: html (default) or vue
    --fragment      Emit only the article fragment (no full HTML document)
    --include-root <dir>
                    Allow #+SETUPFILE / #+INCLUDE to read from <dir> (repeatable)
    --no-resolve-includes
                    Leave #+SETUPFILE / #+INCLUDE / #+STARTUP unresolved
                    All logs go to stderr, so stdout stays pipe-clean.

Assets and deployment:
  --asset-base <path>
                    Every asset org2html references (/styles.css, /o2h.js,
                    /favicon.svg, /manifest.json and url('/fonts/..') inside the
                    stylesheet) is ROOT-ABSOLUTE, so a deploy that is not at a
                    domain root 404s on all of them. --asset-base /my-project
                    prefixes them. The default is empty and leaves output
                    byte-identical.
  --font-dir <dir>  org2html ships NO webfonts: the default book names Geomanist
                    and a Nerd-patched Space Mono, and redistributing them is the
                    consuming project's licensing call. Point --font-dir at your
                    licensed .woff2 files and they are copied and preloaded.
                    Supply none and nothing is preloaded — the token layer's
                    system fallbacks apply and no page 404s.

Examples:
  org2html build notes.org -o site
  org2html watch ./docs
  org2html test example.org
  org2html comments sample site --cache site/comments
  org2html comments fetch site --cache public/comments --held quarantine
  cat post.org | org2html - > post.html
  org2html --stdin --format vue < post.org > Post.vue
  org2html build notes/ -o site --include-root ~/shared/org-setup
  org2html build docs/ -o site --asset-base /my-project --font-dir ./brand/fonts

File-layer keywords:
  #+SETUPFILE: path   Import another file's in-buffer settings (#+MACRO, #+LINK,
                      #+OPTIONS, ...). The document always wins on a conflict.
  #+INCLUDE: "path"   Splice a file in. Supports src <lang> / example /
                      export <backend>, :lines "5-10", :only-contents t,
                      :minlevel N, and "path::*Heading" / "path::#custom-id".
  #+STARTUP: ...      In-buffer switches; the ones with a rendered meaning map
                      onto #+OPTIONS.
  Both are confined to the document's own directory unless --include-root adds
  more, so an untrusted .org cannot read arbitrary files into your output.

Comments:
  The cache written by the comments command is a RECORD, not a mirror: X's reply endpoint
  only reaches back SEVEN DAYS, so a reply deleted from the cache can never be
  fetched again. Destructive actions refuse a real thread without --force.
  --held must resolve OUTSIDE --cache — the cache is served, so a withheld reply
  placed inside it would be published. That is refused, not warned about.
  X_BEARER_TOKEN supplies the app-only token; without it 'fetch' is a no-op,
  never a failure, because a build must not depend on a secret being set.
  sharp is an OPTIONAL install (npm i sharp) enabling the one-request avatar
  sprite. Without it the individual avatars still work and the tool says so.

Options:
  -V, --version     Output the version number
  -h, --help        Display global help

Description:
  org2html converts plain-text Org-mode documents into clean, accessible HTML.
  It supports templates, automatic rebuilds, and syntax highlighting for code blocks.

For detailed help about a command:
  org2html help <command>
`);
        } else {
            const cmd = program.commands.find(
                (c) =>
                    c.name() === commandName ||
                    c.aliases().includes(commandName),
            );
            if (cmd) {
                console.log(cmd.helpInformation());
            } else {
                console.error(`Unknown command '${commandName}'.\n`);
                program.outputHelp();
                process.exitCode = 1;
            }
        }
    });

const rawArgs = process.argv.slice(2);
const knownCommands = new Set(["build", "watch", "test", "comments", "help"]);
const firstArg = rawArgs[0];
const filterMode =
    firstArg !== undefined &&
    !knownCommands.has(firstArg) &&
    (rawArgs.includes("--stdin") || rawArgs.includes("-"));

if (filterMode) {
    const flag = (name: string) => rawArgs.includes(name);
    const value = (name: string) => {
        const i = rawArgs.indexOf(name);
        return i >= 0 ? rawArgs[i + 1] : undefined;
    };
    // Collect every occurrence of a repeatable flag (--link-css, --css-var).
    const values = (name: string) => {
        const out: string[] = [];
        for (let i = 0; i < rawArgs.length; i++) {
            if (rawArgs[i] === name && rawArgs[i + 1] !== undefined) out.push(rawArgs[i + 1]);
        }
        return out;
    };
    filterCommand({
        format: value("--format") ?? "html",
        fragment: flag("--fragment"),
        sanitize: !flag("--no-sanitize"),
        highlight: !flag("--no-highlight"),
        template: value("--template") ?? value("-t"),
        templateDir: value("--template-dir"),
        theme: value("--theme"),
        codeTheme: value("--code-theme"),
        classPrefix: value("--class-prefix"),
        font: value("--font"),
        css: value("--css"),
        cssAppend: value("--css-append"),
        cssVar: values("--css-var"),
        linkCss: values("--link-css"),
        styleBook: value("--style-book"),
        plugin: values("--plugin"),
        components: value("--components"),
        strict: flag("--strict"),
        quiet: flag("--quiet") || flag("-q"),
        defaultStyles: !flag("--no-default-styles"),
        includeRoot: values("--include-root"),
        resolveIncludes: !flag("--no-resolve-includes"),
    }).catch((err: unknown) => {
        console.error((err as Error).message);
        process.exit(1);
    });
} else {
    program.parse();
}
