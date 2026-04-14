/**
 * Extract place information from YouTube video data.
 */

import type { VideoInfo, PlaylistInfo } from "../types.js";
import type { Place } from "./types.js";
import { CUISINE_KEYWORDS, CITY_COORDINATES } from "./types.js";

/**
 * Generate a URL-friendly slug from a string.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special chars
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens
    .replace(/^-|-$/g, ""); // Trim hyphens
}

/**
 * Extract city name from playlist title or video title.
 */
export function extractCity(playlistTitle: string, videoTitle: string): string | null {
  const cityPatterns = [
    /(\w+)\s+(?:street\s+)?food/i,
    /(\w+)\s+(?:food\s+)?tour/i,
    /best\s+of\s+(\w+)/i,
    /exploring\s+(\w+)/i,
    /(\w+)\s+street\s+food/i,
  ];

  // Check playlist title first
  for (const pattern of cityPatterns) {
    const match = playlistTitle.match(pattern);
    if (match) {
      const city = match[1].toLowerCase();
      if (CITY_COORDINATES[city]) {
        return city;
      }
    }
  }

  // Check video title
  for (const pattern of cityPatterns) {
    const match = videoTitle.match(pattern);
    if (match) {
      const city = match[1].toLowerCase();
      if (CITY_COORDINATES[city]) {
        return city;
      }
    }
  }

  // Direct city name matching
  const combinedText = `${playlistTitle} ${videoTitle}`.toLowerCase();
  for (const city of Object.keys(CITY_COORDINATES)) {
    if (combinedText.includes(city)) {
      return city;
    }
  }

  return null;
}

/**
 * Extract place name from video title.
 * Common patterns: "Place Name | City", "Best X at Place Name", "Place Name - Famous Dish"
 */
export function extractPlaceName(videoTitle: string): string {
  // Remove common prefixes/suffixes
  let name = videoTitle
    .replace(/\|.*$/, "") // Remove everything after |
    .replace(/-\s*[A-Z][\w\s]+$/, "") // Remove city suffix like "- Delhi"
    .replace(/\s*\(.*?\)\s*/g, "") // Remove parenthetical info
    .replace(/best\s+/i, "")
    .replace(/famous\s+/i, "")
    .replace(/street\s+food\s+/i, "")
    .replace(/food\s+tour\s*/i, "")
    .replace(/₹[\d,]+\s*/g, "") // Remove price mentions
    .replace(/rs\.?\s*[\d,]+\s*/gi, "")
    .trim();

  // Extract shop name if pattern like "Dish at Shop Name" or "Dish, Shop Name"
  const atPattern = /(?:at|@)\s+(.+)$/i;
  const atMatch = name.match(atPattern);
  if (atMatch) {
    name = atMatch[1].trim();
  }

  // If name is too long, take first part before comma
  if (name.length > 50) {
    const parts = name.split(",");
    name = parts[0].trim();
  }

  return name || videoTitle.slice(0, 50);
}

/**
 * Extract address from video description.
 */
export function extractAddress(description: string): string {
  // Common address patterns
  const addressPatterns = [
    /address[:\s]+([^\n]+)/i,
    /location[:\s]+([^\n]+)/i,
    /where[:\s]+([^\n]+)/i,
    /find\s+(?:us|it|them)\s+(?:at|in)[:\s]+([^\n]+)/i,
    /shop\s+no\.?\s*:?\s*([^\n]+)/i,
    /near[:\s]+([^\n]+)/i,
  ];

  for (const pattern of addressPatterns) {
    const match = description.match(pattern);
    if (match) {
      // Clean up the address
      let address = match[1]
        .replace(/https?:\/\/[^\s]+/g, "") // Remove URLs
        .replace(/\s+/g, " ")
        .trim();

      if (address.length > 10 && address.length < 200) {
        return address;
      }
    }
  }

  return "";
}

/**
 * Extract dishes mentioned in video title or description.
 */
export function extractDishes(videoTitle: string, description: string): string[] {
  const dishes: Set<string> = new Set();
  const text = `${videoTitle} ${description}`.toLowerCase();

  // Common dish patterns
  const dishPatterns = [
    /chole\s*bhature/i,
    /pani\s*puri/i,
    /gol\s*gappa/i,
    /vada\s*pav/i,
    /pav\s*bhaji/i,
    /butter\s*chicken/i,
    /dal\s*makhani/i,
    /aloo\s*paratha/i,
    /masala\s*dosa/i,
    /samosa/i,
    /jalebi/i,
    /biryani/i,
    /kebab/i,
    /tikka/i,
    /momos?/i,
    /thali/i,
    /paratha/i,
    /kulcha/i,
    /lassi/i,
    /chai/i,
    /poha/i,
    /kachori/i,
    /chaat/i,
    /pakora/i,
    /bhatura/i,
    /naan/i,
    /roti/i,
    /curry/i,
    /paneer/i,
    /rajma/i,
    /chana/i,
    /idli/i,
    /dosa/i,
    /vada/i,
    /upma/i,
    /uttapam/i,
    /halwa/i,
    /kheer/i,
    /gulab\s*jamun/i,
    /rasgulla/i,
    /kulfi/i,
    /falooda/i,
    /nihari/i,
    /haleem/i,
    /pulao/i,
    /korma/i,
  ];

  for (const pattern of dishPatterns) {
    const match = text.match(pattern);
    if (match) {
      // Capitalize properly
      const dish = match[0]
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      dishes.add(dish);
    }
  }

  return Array.from(dishes).slice(0, 5); // Limit to 5 dishes
}

/**
 * Determine cuisine types based on video content.
 */
export function extractCuisine(videoTitle: string, description: string, dishes: string[]): string[] {
  const cuisines: Set<string> = new Set();
  const text = `${videoTitle} ${description} ${dishes.join(" ")}`.toLowerCase();

  for (const [cuisine, keywords] of Object.entries(CUISINE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        cuisines.add(cuisine);
        break;
      }
    }
  }

  // Default to Street Food if no cuisine found
  if (cuisines.size === 0) {
    cuisines.add("Street Food");
  }

  return Array.from(cuisines).slice(0, 3); // Limit to 3 cuisines
}

/**
 * Extract price range from video content.
 */
export function extractPriceRange(videoTitle: string, description: string): string {
  const text = `${videoTitle} ${description}`;

  // Look for price mentions
  const pricePattern = /₹\s*([\d,]+)|rs\.?\s*([\d,]+)/gi;
  const prices: number[] = [];

  let match;
  while ((match = pricePattern.exec(text)) !== null) {
    const price = parseInt((match[1] || match[2]).replace(/,/g, ""), 10);
    if (price > 0 && price < 10000) {
      prices.push(price);
    }
  }

  if (prices.length === 0) {
    return "₹"; // Default to budget
  }

  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  if (avgPrice < 50) return "₹";
  if (avgPrice < 150) return "₹₹";
  if (avgPrice < 400) return "₹₹₹";
  return "₹₹₹₹";
}

/**
 * Extract place data from a video.
 */
export function extractPlaceFromVideo(
  video: VideoInfo,
  playlists: PlaylistInfo[]
): Place | null {
  // Get playlist titles for city extraction
  const videoPlaylists = video.playlists || [];
  const playlistTitle = videoPlaylists
    .map(p => {
      const playlist = playlists.find(pl => pl.id === p.id);
      return playlist?.title || p.title || "";
    })
    .join(" ");

  // Tags are set explicitly by creators — treat them as high-signal text
  const tagsText = (video.tags || []).join(" ");

  // Extract city — check tags first as they're explicit
  const city = extractCity(playlistTitle, `${video.title} ${tagsText}`);
  if (!city) {
    return null; // Skip videos without identifiable city
  }

  const cityInfo = CITY_COORDINATES[city];
  if (!cityInfo) {
    return null;
  }

  // Extract place details — include tags in all extraction passes
  const name = extractPlaceName(video.title);
  const address = extractAddress(video.description);
  const dishes = extractDishes(video.title, `${video.description} ${tagsText}`);
  const cuisine = extractCuisine(video.title, `${video.description} ${tagsText}`, dishes);
  const priceRange = extractPriceRange(video.title, `${video.description} ${tagsText}`);

  // Generate unique ID and slug
  const slug = slugify(`${name}-${city}`);
  const id = `${slug}-${video.id.slice(0, 6)}`;

  return {
    id,
    name,
    slug,
    city: cityInfo.state === "Delhi" ? "Delhi" : city.charAt(0).toUpperCase() + city.slice(1),
    citySlug: city,
    address,
    cuisine,
    coordinates: null, // Will be geocoded later
    dishes,
    priceRange,
    sourceVideoId: video.id,
    sourceVideoTitle: video.title,
  };
}

/**
 * Process all videos and extract places.
 */
export function extractPlacesFromVideos(
  videos: VideoInfo[],
  playlists: PlaylistInfo[]
): Place[] {
  const places: Place[] = [];
  const seenSlugs = new Set<string>();

  for (const video of videos) {
    const place = extractPlaceFromVideo(video, playlists);

    if (place && !seenSlugs.has(place.slug)) {
      places.push(place);
      seenSlugs.add(place.slug);
    }
  }

  return places;
}
