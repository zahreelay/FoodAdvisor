/**
 * Google Places API integration for fetching reviews and images.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config as dotenvConfig } from "dotenv";

dotenvConfig({ path: new URL("../../.env.local", import.meta.url).pathname });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.YOUTUBE_API_KEY || "";
const PLACES_API_URL = "https://maps.googleapis.com/maps/api/place";

// Paths
const PROJECT_ROOT = join(__dirname, "..");
const PROCESSED_DATA_DIR = join(PROJECT_ROOT, "data/processed");
const PLACES_CACHE_FILE = join(PROCESSED_DATA_DIR, "google-places-cache.json");

// Rate limiting
const API_DELAY_MS = 200;

interface Place {
  id: string;
  name: string;
  city: string;
  citySlug: string;
  address: string;
  coordinates: { lat: number; lng: number } | null;
  googlePlaceId?: string;
  googleRating?: number;
  googleReviewCount?: number;
  googleReviews?: GoogleReview[];
  images?: string[];
}

interface PlacesData {
  generatedAt: string;
  totalPlaces: number;
  places: Place[];
}

export interface GoogleReview {
  authorName: string;
  rating: number;
  text: string;
  relativeTime: string;
  profilePhoto?: string;
}

interface PlacesCache {
  [placeId: string]: {
    googlePlaceId: string;
    rating: number;
    reviewCount: number;
    reviews: GoogleReview[];
    photos: string[];
    fetchedAt: string;
  };
}

interface PlaceSearchResult {
  candidates?: Array<{
    place_id: string;
    name: string;
    formatted_address: string;
    geometry?: {
      location: { lat: number; lng: number };
    };
  }>;
  status: string;
  error_message?: string;
}

interface PlaceDetailsResult {
  result?: {
    place_id: string;
    name: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: Array<{
      author_name: string;
      rating: number;
      text: string;
      relative_time_description: string;
      profile_photo_url?: string;
    }>;
    photos?: Array<{
      photo_reference: string;
      height: number;
      width: number;
    }>;
  };
  status: string;
  error_message?: string;
}

/**
 * Sleep for specified duration.
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
 * Load places cache.
 */
function loadCache(): PlacesCache {
  if (!existsSync(PLACES_CACHE_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(PLACES_CACHE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Save places cache.
 */
function saveCache(cache: PlacesCache): void {
  writeFileSync(PLACES_CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

/**
 * Search for a place using Google Places API.
 */
async function findPlace(name: string, city: string): Promise<string | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    return null;
  }

  const query = `${name} ${city} India`;
  const url = new URL(`${PLACES_API_URL}/findplacefromtext/json`);
  url.searchParams.set("input", query);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "place_id,name,formatted_address");
  url.searchParams.set("key", GOOGLE_PLACES_API_KEY);

  try {
    const response = await fetch(url.toString());
    const data = (await response.json()) as PlaceSearchResult;

    if (data.status === "OK" && data.candidates && data.candidates.length > 0) {
      return data.candidates[0].place_id;
    }

    if (data.error_message) {
      console.error(`Places search error: ${data.error_message}`);
    }

    return null;
  } catch (error) {
    console.error(`Failed to search for place "${name}":`, error);
    return null;
  }
}

/**
 * Get place details including reviews and photos.
 */
async function getPlaceDetails(placeId: string): Promise<{
  rating: number;
  reviewCount: number;
  reviews: GoogleReview[];
  photoRefs: string[];
} | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    return null;
  }

  const url = new URL(`${PLACES_API_URL}/details/json`);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "rating,user_ratings_total,reviews,photos");
  url.searchParams.set("key", GOOGLE_PLACES_API_KEY);

  try {
    const response = await fetch(url.toString());
    const data = (await response.json()) as PlaceDetailsResult;

    if (data.status === "OK" && data.result) {
      const result = data.result;

      const reviews: GoogleReview[] = (result.reviews || []).map((r) => ({
        authorName: r.author_name,
        rating: r.rating,
        text: r.text,
        relativeTime: r.relative_time_description,
        profilePhoto: r.profile_photo_url,
      }));

      const photoRefs = (result.photos || [])
        .slice(0, 4) // Limit to 4 photos
        .map((p) => p.photo_reference);

      return {
        rating: result.rating || 0,
        reviewCount: result.user_ratings_total || 0,
        reviews,
        photoRefs,
      };
    }

    if (data.error_message) {
      console.error(`Place details error: ${data.error_message}`);
    }

    return null;
  } catch (error) {
    console.error(`Failed to get place details for ${placeId}:`, error);
    return null;
  }
}

/**
 * Resolve a photo reference to a permanent CDN URL by following the API redirect.
 * This avoids storing the API key inside the image URL.
 */
async function resolvePhotoUrl(photoRef: string, maxWidth = 800): Promise<string | null> {
  const url = `${PLACES_API_URL}/photo?maxwidth=${maxWidth}&photo_reference=${photoRef}&key=${GOOGLE_PLACES_API_KEY}`;
  try {
    const res = await fetch(url);
    // After redirect, res.url is the final CDN URL (no API key)
    return res.url !== url ? res.url : url;
  } catch {
    return null;
  }
}

/**
 * Fetch Google Places data for all places.
 */
export async function fetchGooglePlacesData(options: {
  forceRefresh?: boolean;
  limit?: number;
} = {}): Promise<void> {
  const { forceRefresh = false, limit } = options;

  console.log("=== Google Places Data Fetcher ===\n");

  if (!GOOGLE_PLACES_API_KEY) {
    console.log("ERROR: GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY not set.");
    console.log("Add one of these to your .env file to fetch Google reviews and photos.\n");
    return;
  }

  const placesData = loadPlaces();
  if (!placesData) return;

  let cache = loadCache();
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
      continue;
    }

    console.log(`[${i + 1}/${placesToProcess.length}] ${place.name}, ${place.city}`);

    // Find place on Google
    const googlePlaceId = await findPlace(place.name, place.city);
    await sleep(API_DELAY_MS);

    if (!googlePlaceId) {
      console.log("  Not found on Google Places");
      failed++;
      continue;
    }

    // Get place details
    const details = await getPlaceDetails(googlePlaceId);
    await sleep(API_DELAY_MS);

    if (!details) {
      console.log("  Failed to get details");
      failed++;
      continue;
    }

    // Resolve photo refs to permanent CDN URLs
    const photos = (
      await Promise.all(details.photoRefs.map((ref) => resolvePhotoUrl(ref)))
    ).filter((u): u is string => u !== null);

    // Cache the result
    cache[place.id] = {
      googlePlaceId,
      rating: details.rating,
      reviewCount: details.reviewCount,
      reviews: details.reviews,
      photos,
      fetchedAt: new Date().toISOString(),
    };

    console.log(`  Rating: ${details.rating} (${details.reviewCount} reviews), ${photos.length} photos`);
    fetched++;

    // Save cache periodically
    if ((i + 1) % 5 === 0) {
      saveCache(cache);
    }
  }

  // Final save
  saveCache(cache);

  // Update places.json with Google data
  const updatedPlaces = placesData.places.map((place) => {
    const cachedData = cache[place.id];
    if (!cachedData) return place;

    return {
      ...place,
      googlePlaceId: cachedData.googlePlaceId,
      googleRating: cachedData.rating,
      googleReviewCount: cachedData.reviewCount,
      googleReviews: cachedData.reviews,
      images: cachedData.photos.length > 0 ? cachedData.photos : place.images,
    };
  });

  const updatedPlacesData: PlacesData = {
    ...placesData,
    places: updatedPlaces,
  };

  writeFileSync(
    join(PROCESSED_DATA_DIR, "places.json"),
    JSON.stringify(updatedPlacesData, null, 2),
    "utf-8"
  );

  console.log("\n=== Summary ===");
  console.log(`Total places: ${placesToProcess.length}`);
  console.log(`Fetched: ${fetched}`);
  console.log(`Cached: ${cached}`);
  console.log(`Failed: ${failed}`);
  console.log("\nUpdated places.json with Google data!");
}

// CLI entry point
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("googlePlaces.ts") ||
    process.argv[1].endsWith("googlePlaces.js"));

if (isMainModule) {
  const args = process.argv.slice(2);
  const forceRefresh = args.includes("--force");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  fetchGooglePlacesData({ forceRefresh, limit })
    .then(() => {
      console.log("\nGoogle Places fetch complete!");
    })
    .catch((error) => {
      console.error("Fetch failed:", error);
      process.exit(1);
    });
}
