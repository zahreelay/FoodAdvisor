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
      .upsert(placeRows.slice(i, i + BATCH), { onConflict: "id" });
    if (error) throw new Error(`Places upsert failed: ${error.message}`);
  }
  console.log(`✓ ${places.length} places seeded`);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const rawVideoId = args.find((a) => !a.startsWith("--"));
  const force = args.includes("--force");

  if (!rawVideoId) {
    console.error("Usage: npm run process-video <videoId> [--force]");
    process.exit(1);
  }

  // Strip query params like &t=19s
  const videoId = rawVideoId.split("&")[0].split("?")[0];

  // Check if already processed
  const existing = isAlreadyProcessed(videoId);
  if (existing && !force) {
    console.log(`\n⏭  Already processed: ${existing.title}`);
    console.log(`   Processed at: ${existing.processedAt}`);
    console.log(`   Places: ${existing.placesExtracted.length}`);
    console.log(`\nRun with --force to reprocess.`);
    return;
  }

  if (existing && force) {
    console.log(`\n🔁 Force reprocessing: ${existing.title}\n`);
  } else {
    console.log(`\n=== Processing video: ${videoId} ===\n`);
  }

  // 1. Fetch video metadata
  console.log("1. Fetching video metadata from YouTube...");
  const ytClient = new YouTubeClient();
  const videos = await ytClient.getVideoDetails([videoId]);
  if (videos.length === 0) {
    console.error(`Video not found: ${videoId}`);
    process.exit(1);
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
    console.error("No places extracted. Exiting.");
    process.exit(1);
  }

  // 4. Geocode
  console.log("\n4. Geocoding places...");
  const useGoogleMaps = !!process.env.GOOGLE_MAPS_API_KEY;
  places = await geocodePlaces(places, useGoogleMaps);

  // 5. Merge with existing places.json (accumulate across videos)
  console.log("\n5. Saving processed data...");
  let allPlaces: Place[] = [];
  if (existsSync(join(PROCESSED_DATA_DIR, "places.json"))) {
    const existing = JSON.parse(readFileSync(join(PROCESSED_DATA_DIR, "places.json"), "utf-8")) as PlacesData;
    // Remove old entries from this video, then add new ones
    allPlaces = existing.places.filter((p) => p.sourceVideoId !== videoId);
  }
  allPlaces = [...allPlaces, ...places];

  const allCities = generateCities(allPlaces);

  const placesData: PlacesData = {
    generatedAt: new Date().toISOString(),
    totalPlaces: allPlaces.length,
    places: allPlaces,
  };
  const citiesData: CitiesData = {
    generatedAt: new Date().toISOString(),
    totalCities: allCities.length,
    cities: allCities,
  };
  saveJson(join(PROCESSED_DATA_DIR, "places.json"), placesData);
  saveJson(join(PROCESSED_DATA_DIR, "cities.json"), citiesData);

  // 6. Fetch Google Places images
  console.log("\n6. Fetching Google Places images...");
  await fetchGooglePlacesData({});

  // Reload places.json (googlePlaces updates it in place)
  const updatedPlacesData = JSON.parse(
    readFileSync(join(PROCESSED_DATA_DIR, "places.json"), "utf-8")
  ) as PlacesData;
  allPlaces = updatedPlacesData.places;

  // 7. Seed DB (full upsert — safe to re-run)
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
  console.log(`   Saved to videos.json`);

  // Summary
  console.log("\n=== Done ===");
  console.log(`Places extracted: ${places.length}`);
  places.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} (${p.city}) — ${p.dishes.join(", ") || "no dishes"}`);
  });
  console.log(`\nTotal in DB: ${allPlaces.length} places across ${allCities.length} cities`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
