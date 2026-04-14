#!/usr/bin/env node
/**
 * Street Food Map - Data Ingestion Pipeline
 *
 * Extracts video metadata and transcripts from Indian food vlog YouTube channels.
 *
 * Usage:
 *   npm run dev -- --channel @delhifoodwalks
 *   npm run dev -- --channel @delhifoodwalks --step playlists
 *   npm run dev -- --channel @delhifoodwalks --resume
 *   npm run dev -- --channel @delhifoodwalks --dry-run
 */

import { Command } from "commander";
import { setupLogging, getLogger } from "./utils.js";
import { ensureDirectories } from "./config.js";
import { Scraper } from "./scraper.js";
import type { ScraperOptions } from "./types.js";

const program = new Command();

program
  .name("street-food-map")
  .description("Extract video metadata and transcripts from YouTube food vlog channels")
  .version("1.0.0");

program
  .requiredOption("-c, --channel <handle>", "YouTube channel handle (e.g., @delhifoodwalks)")
  .option(
    "-s, --step <step>",
    "Run specific step only (playlists, videos, transcripts)",
    undefined
  )
  .option("-r, --resume", "Resume interrupted run", false)
  .option("-d, --dry-run", "Show what would be fetched without making API calls", false)
  .option("-v, --verbose", "Enable verbose logging", false)
  .option("-l, --limit <n>", "Only scrape the latest N videos", undefined);

program.parse(process.argv);

const opts = program.opts();

async function main(): Promise<void> {
  // Setup logging
  const log = setupLogging(opts.verbose);

  // Ensure directories exist
  ensureDirectories();

  // Validate step option
  const validSteps = ["playlists", "videos", "transcripts"];
  if (opts.step && !validSteps.includes(opts.step)) {
    log.error(`Invalid step: ${opts.step}. Valid steps are: ${validSteps.join(", ")}`);
    process.exit(1);
  }

  // Build options
  const options: ScraperOptions = {
    channel: opts.channel,
    step: opts.step as "playlists" | "videos" | "transcripts" | undefined,
    resume: opts.resume,
    dryRun: opts.dryRun,
    verbose: opts.verbose,
    limit: opts.limit ? parseInt(opts.limit as string, 10) : undefined,
  };

  // Run scraper
  try {
    const scraper = new Scraper(options);
    await scraper.run();
    log.info("Done!");
  } catch (error: unknown) {
    const err = error as Error;
    log.error(`Fatal error: ${err.message}`);
    if (opts.verbose && err.stack) {
      log.error(err.stack);
    }
    process.exit(1);
  }
}

main();
