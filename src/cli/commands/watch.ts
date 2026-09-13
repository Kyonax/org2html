/*
 * Copyright (c) 2026 Cristian D. Moreno — @Kyonax
 * Distributed under the terms of GPL-3.0-only — see LICENSE.
 */

/*
 * src/cli/commands/watch.ts — Watch command.
 *
 * Chokidar-driven dev loop: an initial build, then a debounced,
 * single-flight rebuild of the whole tree on every add / change /
 * unlink. The lock coalesces bursts so two rebuilds never overlap,
 * and SIGINT / SIGTERM close the watcher before exiting cleanly.
 */

import chokidar from "chokidar"
import chalk from "chalk"
import { buildCommand, lastBuildDependencies } from "./build.js"

export async function watchCommand(input: string, options: any) {
  console.log(chalk.blue("Watching for changes...\n"))

  let building = false
  let pending = false
  let timer: NodeJS.Timeout | undefined
  // Assigned once the watcher exists; the initial build runs before that, so it
  // starts as a no-op rather than a temporal-dead-zone reference.
  let syncDependencies: () => void = () => {}

  const runBuild = async () => {
    if (building) {
      pending = true
      return
    }
    building = true
    try {
      await buildCommand(input, options)
      syncDependencies()
    } catch (err) {
      console.error(chalk.red("Rebuild failed:"), (err as Error).message)
    } finally {
      building = false
      if (pending) {
        pending = false
        schedule()
      }
    }
  }

  const schedule = () => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      void runBuild()
    }, 150)
  }

  await runBuild()

  const pattern = input.replace(/\\/g, "/").replace(/\/+$/, "")
  const watchGlob = pattern.endsWith(".org") ? pattern : `${pattern}/**/*.org`

  const watcher = chokidar.watch(watchGlob, {
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
  })

  // A #+SETUPFILE / #+INCLUDE target is usually OUTSIDE the watched tree (a
  // shared setupfile in another directory), so the glob alone would never see
  // it change. Track the include graph the last build reported and keep the
  // watch set in sync after every rebuild.
  const watchedDeps = new Set<string>()
  syncDependencies = () => {
    for (const dep of lastBuildDependencies) {
      if (watchedDeps.has(dep)) continue
      watchedDeps.add(dep)
      watcher.add(dep)
      console.log(chalk.gray(`Watching included file: ${dep}`))
    }
    for (const dep of [...watchedDeps]) {
      if (lastBuildDependencies.has(dep)) continue
      watchedDeps.delete(dep)
      watcher.unwatch(dep)
    }
  }
  syncDependencies()

  watcher
    .on("change", (path) => {
      console.log(chalk.yellow(`\n${path} changed, rebuilding...`))
      schedule()
    })
    .on("add", (path) => {
      console.log(chalk.green(`\n${path} added, rebuilding...`))
      schedule()
    })
    .on("unlink", (path) => {
      console.log(chalk.gray(`\n${path} removed, rebuilding...`))
      schedule()
    })
    .on("error", (err) => {
      console.error(chalk.red("Watcher error:"), (err as Error).message)
    })

  const shutdown = async (signal: string) => {
    console.error(chalk.gray(`\nReceived ${signal}, closing watcher...`))
    if (timer) {
      clearTimeout(timer)
    }
    await watcher.close()
    process.exit(0)
  }
  process.once("SIGINT", () => void shutdown("SIGINT"))
  process.once("SIGTERM", () => void shutdown("SIGTERM"))

  console.log(chalk.gray("\nPress Ctrl+C to stop watching"))
}
