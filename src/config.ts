/**
 * Configuration management for Street Food Map pipeline.
 */

import { config as dotenvConfig } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, existsSync } from "fs";

// Load environment variables
dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// API Configuration
export const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";

// Rate limiting (in milliseconds)
export const YOUTUBE_API_DELAY = parseInt(process.env.YOUTUBE_API_DELAY || "100", 10);
export const TRANSCRIPT_FETCH_DELAY = parseInt(process.env.TRANSCRIPT_FETCH_DELAY || "500", 10);

// Retry configuration
export const MAX_RETRIES = 3;
export const INITIAL_BACKOFF = 1000; // milliseconds
export const MAX_BACKOFF = 60000; // milliseconds

// Pagination
export const PLAYLISTS_PER_PAGE = 50;
export const VIDEOS_PER_PAGE = 50;

// Paths
export const PROJECT_ROOT = join(__dirname, "..");
export const DATA_DIR = join(PROJECT_ROOT, "data");
export const RAW_DATA_DIR = join(DATA_DIR, "raw");
export const TRANSCRIPTS_DIR = join(RAW_DATA_DIR, "transcripts");

// Output files
export const PLAYLISTS_FILE = join(RAW_DATA_DIR, "playlists.json");
export const VIDEOS_FILE = join(RAW_DATA_DIR, "videos.json");
export const PROGRESS_FILE = join(RAW_DATA_DIR, "progress.json");
export const LOG_FILE = join(RAW_DATA_DIR, "scrape.log");

// Transcript language priority: [language code, is_auto_generated]
export const TRANSCRIPT_LANGUAGE_PRIORITY: Array<[string, boolean]> = [
  ["hi", false], // Manual Hindi
  ["en", false], // Manual English
  ["hi", true],  // Auto-generated Hindi
  ["en", true],  // Auto-generated English
];

// YouTube API quota costs (for tracking)
export const QUOTA_COSTS: Record<string, number> = {
  "search.list": 100,
  "playlists.list": 1,
  "playlistItems.list": 1,
  "videos.list": 1,
  "channels.list": 1,
};

// Daily quota limit (default for YouTube Data API)
export const DAILY_QUOTA_LIMIT = 10000;

/**
 * Validate required configuration is present.
 */
export function validateConfig(): void {
  if (!YOUTUBE_API_KEY) {
    throw new Error(
      "YOUTUBE_API_KEY not found in environment.\n" +
      "Please create a .env file with your YouTube API key.\n" +
      "See: https://developers.google.com/youtube/v3/getting-started"
    );
  }
}

/**
 * Create necessary directories if they don't exist.
 */
export function ensureDirectories(): void {
  if (!existsSync(RAW_DATA_DIR)) {
    mkdirSync(RAW_DATA_DIR, { recursive: true });
  }
  if (!existsSync(TRANSCRIPTS_DIR)) {
    mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
  }
}
