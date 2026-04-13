/**
 * Image fetcher - downloads images for food places using Google Custom Search API.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config as dotenvConfig } from "dotenv";

dotenvConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY || "";
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX || "";
const SEARCH_API_URL = "https://www.googleapis.com/customsearch/v1";

// Paths
const PROJECT_ROOT = join(__dirname, "..");
const PROCESSED_DATA_DIR = join(PROJECT_ROOT, "data/processed");
const IMAGES_DIR = join(PROJECT_ROOT, "data/images");
const IMAGE_CACHE_FILE = join(PROCESSED_DATA_DIR, "image-cache.json");

// Rate limiting
const FETCH_DELAY_MS = 1000; // 1 second between requests

interface Place {
  id: string;
  name: string;
  slug: string;
  city: string;
  citySlug: string;
  dishes: string[];
  imageUrl?: string;
}

interface PlacesData {
  generatedAt: string;
  totalPlaces: number;
  places: Place[];
}

interface ImageCache {
  [placeId: string]: {
    url: string;
    fetchedAt: string;
  };
}

interface SearchResult {
  items?: Array<{
    link: string;
    image?: {
      thumbnailLink?: string;
    };
  }>;
  error?: {
    message: string;
  };
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load places data.
 */
function loadPlaces(): PlacesData | null {
  const filepath = join(PROCESSED_DATA_DIR, "places.json");
  if (!existsSync(filepath)) {
    console.error("places.json not found. Run processor first.");
    return null;
  }
  return JSON.parse(readFileSync(filepath, "utf-8"));
}

/**
 * Load image cache.
 */
function loadImageCache(): ImageCache {
  if (!existsSync(IMAGE_CACHE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(IMAGE_CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Save image cache.
 */
function saveImageCache(cache: ImageCache): void {
  writeFileSync(IMAGE_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Search for an image using Google Custom Search API.
 */
async function searchImage(query: string): Promise<string | null> {
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
    console.warn("Google Search API credentials not configured");
    return null;
  }

  const url = new URL(SEARCH_API_URL);
  url.searchParams.set("key", GOOGLE_SEARCH_API_KEY);
  url.searchParams.set("cx", GOOGLE_SEARCH_CX);
  url.searchParams.set("q", query);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("num", "1");
  url.searchParams.set("safe", "active");
  url.searchParams.set("imgSize", "medium");

  try {
    const response = await fetch(url.toString());
    const data = (await response.json()) as SearchResult;

    if (data.error) {
      console.error(`Search error: ${data.error.message}`);
      return null;
    }

    if (data.items && data.items.length > 0) {
      return data.items[0].link;
    }

    return null;
  } catch (error) {
    console.error(`Failed to search for "${query}":`, error);
    return null;
  }
}

/**
 * Generate search query for a place.
 */
function generateSearchQuery(place: Place): string {
  const parts = [place.name];

  // Add top dish if available
  if (place.dishes.length > 0) {
    parts.push(place.dishes[0]);
  }

  // Add city
  parts.push(place.city);

  // Add "food" to help find relevant images
  parts.push("food");

  return parts.join(" ");
}

/**
 * Fetch images for all places.
 */
async function fetchImages(options: {
  dryRun?: boolean;
  forceRefresh?: boolean;
  limit?: number;
} = {}): Promise<void> {
  const { dryRun = false, forceRefresh = false, limit } = options;

  console.log("=== Image Fetcher ===\n");

  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
    console.log("WARNING: Google Search API credentials not configured.");
    console.log("Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX in .env\n");
    console.log("Running in placeholder mode (no images will be fetched).\n");
  }

  // Ensure directories exist
  if (!existsSync(IMAGES_DIR)) {
    mkdirSync(IMAGES_DIR, { recursive: true });
  }

  // Load data
  const placesData = loadPlaces();
  if (!placesData) return;

  let cache = loadImageCache();
  if (forceRefresh) {
    console.log("Force refresh enabled - clearing cache\n");
    cache = {};
  }

  const placesToProcess = limit
    ? placesData.places.slice(0, limit)
    : placesData.places;

  console.log(`Processing ${placesToProcess.length} places...\n`);

  let fetched = 0;
  let cached = 0;
  let failed = 0;

  for (let i = 0; i < placesToProcess.length; i++) {
    const place = placesToProcess[i];

    // Check cache
    if (cache[place.id] && !forceRefresh) {
      cached++;
      place.imageUrl = cache[place.id].url;
      continue;
    }

    // Generate search query
    const query = generateSearchQuery(place);

    if (dryRun) {
      console.log(`[Dry run] Would search for: ${query}`);
      continue;
    }

    console.log(`[${i + 1}/${placesToProcess.length}] Searching: ${query}`);

    // Search for image
    const imageUrl = await searchImage(query);

    if (imageUrl) {
      cache[place.id] = {
        url: imageUrl,
        fetchedAt: new Date().toISOString(),
      };
      place.imageUrl = imageUrl;
      fetched++;
      console.log(`  Found: ${imageUrl.slice(0, 60)}...`);
    } else {
      failed++;
      console.log("  No image found");
    }

    // Rate limiting
    if (i < placesToProcess.length - 1) {
      await sleep(FETCH_DELAY_MS);
    }

    // Save cache periodically
    if ((i + 1) % 10 === 0) {
      saveImageCache(cache);
    }
  }

  // Final save
  if (!dryRun) {
    saveImageCache(cache);

    // Update places.json with image URLs
    const updatedPlacesData: PlacesData = {
      ...placesData,
      places: placesData.places.map((p) => ({
        ...p,
        imageUrl: cache[p.id]?.url,
      })),
    };
    writeFileSync(
      join(PROCESSED_DATA_DIR, "places.json"),
      JSON.stringify(updatedPlacesData, null, 2),
      "utf-8"
    );
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Total places: ${placesToProcess.length}`);
  console.log(`Cached: ${cached}`);
  console.log(`Fetched: ${fetched}`);
  console.log(`Failed: ${failed}`);
}

// CLI entry point
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("imageFetcher.ts") ||
    process.argv[1].endsWith("imageFetcher.js"));

if (isMainModule) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const forceRefresh = args.includes("--force");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  fetchImages({ dryRun, forceRefresh, limit })
    .then(() => {
      console.log("\nImage fetching complete!");
    })
    .catch((error) => {
      console.error("Image fetching failed:", error);
      process.exit(1);
    });
}

export { fetchImages };
