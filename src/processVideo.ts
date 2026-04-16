/**
 * Single-video pipeline:
 *   1. Check videos.json — skip if already processed (unless --force)
 *   2. Fetch video metadata from YouTube API
 *   3. Fetch transcript via yt-dlp
 *   4. Extract all places with GPT-4o
 *   5. Geocode places
 *   6. Fetch Google Places images
 *   7. Save processed data + seed Supabase
 *
 * Usage:
 *   npm run process-video <videoId>           # skip if already processed
 *   npm run process-video <videoId> --force   # reprocess even if exists
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, "..");
const RAW_DATA_DIR = join(PROJECT_ROOT, "data/raw");
const PROCESSED_DATA_DIR = join(PROJECT_ROOT, "data/processed");
const VIDEOS_LOG_FILE = join(RAW_DATA_DIR, "videos.json");

mkdirSync(join(RAW_DATA_DIR, "transcripts"), { recursive: true });
mkdirSync(PROCESSED_DATA_DIR, { recursive: true });

// ── Imports ────────────────────────────────────────────────────────────────

import { YouTubeClient } from "./youtubeClient.js";
import { fetchTranscript, saveTranscript } from "./transcriptFetcher.js";
import { extractPlacesWithLLM } from "./processor/llmExtractor.js";
import { geocodePlaces } from "./processor/geocoder.js";
import { fetchGooglePlacesData } from "./googlePlaces.js";
import type { Place, PlacesData, City, CitiesData } from "./processor/types.js";
import { CITY_COORDINATES } from "./processor/types.js";

// ── Video log ──────────────────────────────────────────────────────────────

interface VideoRecord {
  id: string;
  title: string;
  description: string;
  tags: string[];
  channelTitle?: string;
  publishedAt?: string;
  duration?: string;
  viewCount?: string;
  processedAt: string;
  transcriptAvailable: boolean;
  placesExtracted: string[]; // place IDs
}

interface VideosLog {
  updatedAt: string;
  videos: VideoRecord[];
}

function loadVideosLog(): VideosLog {
  if (!existsSync(VIDEOS_LOG_FILE)) {
    return { updatedAt: new Date().toISOString(), videos: [] };
  }
  return JSON.parse(readFileSync(VIDEOS_LOG_FILE, "utf-8"));
}

function saveVideosLog(log: VideosLog): void {
  log.updatedAt = new Date().toISOString();
  writeFileSync(VIDEOS_LOG_FILE, JSON.stringify(log, null, 2), "utf-8");
}

function isAlreadyProcessed(videoId: string): VideoRecord | null {
  const log = loadVideosLog();
  return log.videos.find((v) => v.id === videoId) ?? null;
}

function upsertVideoRecord(record: VideoRecord): void {
  const log = loadVideosLog();
  const idx = log.videos.findIndex((v) => v.id === record.id);
  if (idx >= 0) {
    log.videos[idx] = record;
  } else {
    log.videos.push(record);
  }
  saveVideosLog(log);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function saveJson(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
  console.log(`Saved: ${path}`);
}

function generateCities(places: Place[]): City[] {
  const counts = new Map<string, number>();
  for (const p of places) counts.set(p.citySlug, (counts.get(p.citySlug) ?? 0) + 1);

  return [...counts.entries()]
    .map(([citySlug, placeCount]) => {
      const info = CITY_COORDINATES[citySlug];
      if (!info) return null;
      return {
        id: citySlug,
        name: citySlug.charAt(0).toUpperCase() + citySlug.slice(1),
        slug: citySlug,
        state: info.state,
        coordinates: info.coordinates,
        placeCount,
      } as City;
    })
    .filter((c): c is City => c !== null)
    .sort((a, b) => b.placeCount - a.placeCount);
}

async function seedToSupabase(places: Place[], cities: City[]): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("Supabase credentials missing — skipping DB seed");
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const cityRows = cities.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    state: c.state,
    lat: c.coordinates?.lat ?? null,
    lng: c.coordinates?.lng ?? null,
    place_count: c.placeCount ?? 0,
  }));

  const { error: citiesErr } = await supabase.from("cities").upsert(cityRows, { onConflict: "id" });
  if (citiesErr) throw new Error(`Cities upsert failed: ${citiesErr.message}`);
  console.log(`✓ ${cities.length} cities seeded`);

  const placeRows = places.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    city: p.city,
    city_slug: p.citySlug,
    address: p.address ?? null,
    cuisine: p.cuisine ?? [],
    lat: p.coordinates?.lat ?? null,
    lng: p.coordinates?.lng ?? null,
    dishes: p.dishes ?? [],
    price_range: p.priceRange ?? null,
    source_video_id: p.sourceVideoId ?? null,
    source_video_title: p.sourceVideoTitle ?? null,
    description: p.description ?? null,
    image_url: p.imageUrl ?? null,
    images: (p as any).images ?? null,
    google_place_id: (p as any).googlePlaceId ?? null,
    google_rating: (p as any).googleRating ?? null,
    google_review_count: (p as any).googleReviewCount ?? null,
  }));

  const BATCH = 100;
  for (let i = 0; i < placeRows.length; i += BATCH) {
    const { error } = await supabase
      .from("places")
      .upsert(placeRows.slice(i, i + BATCH), { onConflict: "slug" });
    if (error) throw new Error(`Places upsert failed: ${error.message}`);
  }
  console.log(`✓ ${places.length} places seeded`);
}

// ── Per-video pipeline ────────────────────────────────────────────────────

/**
 * Run the full pipeline for a single video ID.
 * Returns false if skipped (already processed and !force), true otherwise.
 */
async function processOneVideo(videoId: string, force: boolean): Promise<boolean> {
  // Check if already processed
  const existing = isAlreadyProcessed(videoId);
  if (existing && !force) {
    console.log(`\nSkipping (already processed): ${existing.title}`);
    console.log(`  Processed at: ${existing.processedAt} — ${existing.placesExtracted.length} places`);
    console.log(`  Run with --force to reprocess.`);
    return false;
  }

  if (existing && force) {
    console.log(`\n--- Force reprocessing: ${videoId} ---\n`);
  } else {
    console.log(`\n=== Processing video: ${videoId} ===\n`);
  }

  // 1. Fetch video metadata
  console.log("1. Fetching video metadata from YouTube...");
  const ytClient = new YouTubeClient();
  const videos = await ytClient.getVideoDetails([videoId]);
  if (videos.length === 0) {
    console.error(`   Video not found: ${videoId} — skipping`);
    return false;
  }
  const video = videos[0];
  console.log(`   Title: ${video.title}`);

  // 2. Fetch transcript
  console.log("\n2. Fetching transcript via yt-dlp...");
  const transcript = await fetchTranscript(videoId, video.title);
  saveTranscript(transcript);
  const transcriptAvailable = !("error" in transcript);
  if (!transcriptAvailable) {
    console.warn(`   Warning: ${(transcript as any).error} — proceeding with description only`);
  } else {
    console.log(`   Got ${(transcript as any).fullText.length} chars (${(transcript as any).language})`);
  }

  // 3. LLM extraction
  console.log("\n3. Extracting places with GPT-4o...");
  let places = await extractPlacesWithLLM({
    id: videoId,
    title: video.title,
    description: video.description || "",
    tags: video.tags || [],
  });
  console.log(`   Found ${places.length} places`);

  if (places.length === 0) {
    console.warn("   No places extracted — skipping DB seed for this video.");
    return true;
  }

  // 4. Geocode
  console.log("\n4. Geocoding places...");
  const useGoogleMaps = !!process.env.GOOGLE_MAPS_API_KEY;
  places = await geocodePlaces(places, useGoogleMaps);

  // 5. Merge with existing places.json (accumulate across videos)
  console.log("\n5. Saving processed data...");
  let allPlaces: Place[] = [];
  if (existsSync(join(PROCESSED_DATA_DIR, "places.json"))) {
    const existingData = JSON.parse(readFileSync(join(PROCESSED_DATA_DIR, "places.json"), "utf-8")) as PlacesData;
    // Remove any existing entry for this video OR same slug (new data wins)
    const newSlugs = new Set(places.map((p) => p.slug));
    allPlaces = existingData.places.filter(
      (p) => p.sourceVideoId !== videoId && !newSlugs.has(p.slug)
    );
  }
  allPlaces = [...allPlaces, ...places];

  const allCities = generateCities(allPlaces);

  saveJson(join(PROCESSED_DATA_DIR, "places.json"), {
    generatedAt: new Date().toISOString(),
    totalPlaces: allPlaces.length,
    places: allPlaces,
  } as PlacesData);
  saveJson(join(PROCESSED_DATA_DIR, "cities.json"), {
    generatedAt: new Date().toISOString(),
    totalCities: allCities.length,
    cities: allCities,
  } as CitiesData);

  // 6. Fetch Google Places images
  console.log("\n6. Fetching Google Places images...");
  await fetchGooglePlacesData({});

  // Reload places.json (googlePlaces updates it in place)
  const updatedPlacesData = JSON.parse(
    readFileSync(join(PROCESSED_DATA_DIR, "places.json"), "utf-8")
  ) as PlacesData;
  allPlaces = updatedPlacesData.places;

  // 7. Seed DB
  console.log("\n7. Seeding Supabase...");
  await seedToSupabase(allPlaces, allCities);

  // 8. Save video record
  upsertVideoRecord({
    id: videoId,
    title: video.title,
    description: video.description || "",
    tags: video.tags || [],
    channelTitle: video.channelTitle,
    publishedAt: video.publishedAt,
    duration: video.duration,
    viewCount: video.viewCount,
    processedAt: new Date().toISOString(),
    transcriptAvailable,
    placesExtracted: places.map((p) => p.id),
  });

  console.log(`\n--- Done: ${video.title} ---`);
  console.log(`Places: ${places.length}`);
  places.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.city}) — ${p.dishes.join(", ") || "no dishes"}`);
  });

  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");

  // --channel <handle> [--limit <n>] mode
  const channelIdx = args.indexOf("--channel");
  if (channelIdx !== -1) {
    const channelHandle = args[channelIdx + 1];
    if (!channelHandle || channelHandle.startsWith("--")) {
      console.error("Usage: npm run process-video --channel @handle [--limit N] [--force]");
      process.exit(1);
    }

    const limitIdx = args.indexOf("--limit");
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 10;

    console.log(`\nChannel mode: ${channelHandle}, limit=${limit}\n`);

    const ytClient = new YouTubeClient();
    const channel = await ytClient.resolveChannelHandle(channelHandle);
    if (!channel || !channel.uploadsPlaylistId) {
      console.error(`Could not resolve channel: ${channelHandle}`);
      process.exit(1);
    }

    console.log(`Channel: ${channel.title}`);
    console.log(`Fetching latest ${limit} videos...\n`);

    const videoIds: string[] = [];
    for await (const v of ytClient.getPlaylistVideos(channel.uploadsPlaylistId, limit)) {
      videoIds.push(v.id);
    }

    console.log(`Found ${videoIds.length} videos. Processing...\n`);
    await runBatch(videoIds, force, "Channel run");
    return;
  }

  // --playlist <playlistId> mode
  const playlistIdx = args.indexOf("--playlist");
  if (playlistIdx !== -1) {
    const playlistId = args[playlistIdx + 1];
    if (!playlistId || playlistId.startsWith("--")) {
      console.error("Usage: npm run process-video --playlist <playlistId> [--limit N] [--force]");
      process.exit(1);
    }

    const limitIdx = args.indexOf("--limit");
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : undefined;

    console.log(`\nPlaylist mode: ${playlistId}${limit ? `, limit=${limit}` : ""}\n`);

    const ytClient = new YouTubeClient();
    const videoIds: string[] = [];
    for await (const v of ytClient.getPlaylistVideos(playlistId, limit)) {
      videoIds.push(v.id);
    }

    console.log(`Found ${videoIds.length} videos. Processing...\n`);
    await runBatch(videoIds, force, "Playlist run");
    return;
  }

  // Video ID(s) mode — comma-separated or single
  const rawArg = args.find((a) => !a.startsWith("--"));
  if (!rawArg) {
    console.error(
      "Usage:\n" +
      "  npm run process-video <videoId>[,videoId2,...]  [--force]\n" +
      "  npm run process-video --channel @handle [--limit N] [--force]\n" +
      "  npm run process-video --playlist <playlistId> [--limit N] [--force]"
    );
    process.exit(1);
  }

  const videoIds = rawArg
    .split(",")
    .map((id) => id.trim().split("&")[0].split("?")[0])
    .filter(Boolean);

  await runBatch(videoIds, force, videoIds.length > 1 ? "Batch run" : undefined);
}

/**
 * Process a list of video IDs, skipping on any error or unexpected scenario.
 */
async function runBatch(videoIds: string[], force: boolean, label?: string): Promise<void> {
  const VIDEO_TIMEOUT_MS = 3 * 60 * 1000; // 3 min per video
  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < videoIds.length; i++) {
    console.log(`\n[${i + 1}/${videoIds.length}] ${videoIds[i]}`);
    try {
      const result = await Promise.race([
        processOneVideo(videoIds[i], force),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), VIDEO_TIMEOUT_MS)
        ),
      ]);
      result ? processed++ : skipped++;
    } catch (err: unknown) {
      const msg = (err as Error).message ?? String(err);
      console.error(`  Skipping ${videoIds[i]}: ${msg.slice(0, 120)}`);
      failed++;
    }
  }

  if (label) {
    const allPlaces = existsSync(join(PROCESSED_DATA_DIR, "places.json"))
      ? (JSON.parse(readFileSync(join(PROCESSED_DATA_DIR, "places.json"), "utf-8")) as PlacesData).places
      : [];
    const allCities = generateCities(allPlaces);
    console.log(`\n=== ${label} complete ===`);
    console.log(`Processed: ${processed} | Skipped (already done): ${skipped} | Failed/timeout: ${failed}`);
    console.log(`Total in DB: ${allPlaces.length} places across ${allCities.length} cities`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
