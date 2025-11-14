#!/usr/bin/env node

import { Command } from "commander";
import { buildCommand } from "./commands/build.js";
import { watchCommand } from "./commands/watch.js";
import { testCommand } from "./commands/test.js";

const program = new Command();

program
    .name("org2html")
    .description(
        "Convert Org-mode (.org) files into clean, customizable HTML pages.",
    )
    .version("1.0.0");

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
    .action(buildCommand);

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
    .action(watchCommand);

// Test command
program
    .command("test")
    .description(
        "Test the Org parser and preview HTML output for a single file.",
    )
    .argument("<file>", "Path to the Org file to test")
    .action(testCommand);

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
  help [command]    Show this help message or detailed help for a specific command

Examples:
  org2html build notes.org -o site
  org2html watch ./docs
  org2html test example.org
  org2html help build

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

program.parse();
