/**
 * Utility functions for logging, file I/O, and common operations.
 */

import { createLogger, format, transports } from "winston";
import { readFileSync, writeFileSync, existsSync } from "fs";
import type { Progress } from "./types.js";
import { PROGRESS_FILE, LOG_FILE, ensureDirectories } from "./config.js";

let logger: ReturnType<typeof createLogger> | null = null;

/**
 * Configure logging to both console and file.
 */
export function setupLogging(verbose: boolean = false): ReturnType<typeof createLogger> {
  ensureDirectories();

  logger = createLogger({
    level: verbose ? "debug" : "info",
    format: format.combine(
      format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      format.errors({ stack: true }),
      format.printf(({ level, message, timestamp }) => {
        return `${timestamp} | ${level.toUpperCase().padEnd(7)} | ${message}`;
      })
    ),
    transports: [
      new transports.Console({
        format: format.combine(
          format.colorize(),
          format.timestamp({ format: "HH:mm:ss" }),
          format.printf(({ level, message, timestamp }) => {
            return `${timestamp} | ${level.padEnd(17)} | ${message}`;
          })
        ),
      }),
      new transports.File({
        filename: LOG_FILE,
        format: format.combine(
          format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          format.printf(({ level, message, timestamp }) => {
            return `${timestamp} | ${level.toUpperCase().padEnd(7)} | ${message}`;
          })
        ),
      }),
    ],
  });

  return logger;
}

/**
 * Get the configured logger.
 */
export function getLogger(): ReturnType<typeof createLogger> {
  if (!logger) {
    logger = setupLogging();
  }
  return logger;
}

/**
 * Return current timestamp in ISO8601 format.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Load JSON from file, return null if file doesn't exist.
 */
export function loadJson<T>(path: string): T | null {
  if (!existsSync(path)) {
    return null;
  }
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Save data as JSON to file.
 */
export function saveJson(path: string, data: unknown, indent: number = 2): void {
  ensureDirectories();
  writeFileSync(path, JSON.stringify(data, null, indent), "utf-8");
}

/**
 * Load progress tracking data.
 */
export function loadProgress(): Progress {
  const progress = loadJson<Progress>(PROGRESS_FILE);
  if (progress === null) {
    return {
      lastRun: null,
      channelHandle: null,
      channelId: null,
      playlistsFetched: false,
      videosFetched: false,
      transcriptsCompleted: [],
      transcriptsFailed: [],
      quotaUsed: 0,
    };
  }
  return progress;
}

/**
 * Save progress tracking data.
 */
export function saveProgress(progress: Progress): void {
  progress.lastRun = nowIso();
  saveJson(PROGRESS_FILE, progress);
}

/**
 * Format duration in human-readable form.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Sleep for a specified number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Print a summary of the scraping run.
 */
export function printSummary(
  playlistsCount: number,
  videosCount: number,
  transcriptsSuccess: number,
  transcriptsFailed: number,
  durationSeconds: number,
  quotaUsed: number
): void {
  const log = getLogger();

  log.info("=".repeat(50));
  log.info("SCRAPE SUMMARY");
  log.info("=".repeat(50));
  log.info(`Playlists fetched:     ${playlistsCount}`);
  log.info(`Videos fetched:        ${videosCount}`);
  log.info(`Transcripts success:   ${transcriptsSuccess}`);
  log.info(`Transcripts failed:    ${transcriptsFailed}`);

  if (videosCount > 0) {
    const successRate = (transcriptsSuccess / videosCount) * 100;
    log.info(`Transcript success rate: ${successRate.toFixed(1)}%`);
  }

  log.info(`Duration:              ${formatDuration(durationSeconds)}`);
  log.info(`API quota used:        ${quotaUsed}`);
  log.info("=".repeat(50));
}
