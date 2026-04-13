/**
 * Geocoding service for converting addresses to coordinates.
 */

import type { Coordinates, Place } from "./types.js";
import { CITY_COORDINATES } from "./types.js";

// Google Maps Geocoding API configuration
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json";

// Rate limiting
const GEOCODE_DELAY_MS = 200; // 5 requests per second max

interface GeocodeResult {
  results: Array<{
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    formatted_address: string;
  }>;
  status: string;
  error_message?: string;
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Geocode an address to coordinates using Google Maps API.
 */
async function geocodeAddress(address: string, city: string): Promise<Coordinates | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.warn("GOOGLE_MAPS_API_KEY not set, using city center coordinates");
    return null;
  }

  const fullAddress = address ? `${address}, ${city}, India` : `${city}, India`;
  const url = new URL(GEOCODING_API_URL);
  url.searchParams.set("address", fullAddress);
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);
  url.searchParams.set("region", "in"); // Bias towards India

  try {
    const response = await fetch(url.toString());
    const data = (await response.json()) as GeocodeResult;

    if (data.status === "OK" && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
      };
    }

    if (data.status === "ZERO_RESULTS") {
      console.warn(`No results for address: ${fullAddress}`);
      return null;
    }

    if (data.error_message) {
      console.error(`Geocoding error: ${data.error_message}`);
    }

    return null;
  } catch (error) {
    console.error(`Geocoding failed for ${fullAddress}:`, error);
    return null;
  }
}

/**
 * Add slight random offset to coordinates to prevent overlapping markers.
 */
function addRandomOffset(coords: Coordinates): Coordinates {
  // Add random offset of ~100m
  const offset = 0.001;
  return {
    lat: coords.lat + (Math.random() - 0.5) * offset,
    lng: coords.lng + (Math.random() - 0.5) * offset,
  };
}

/**
 * Get city center coordinates with optional random offset.
 */
export function getCityCenterCoordinates(citySlug: string, addOffset = true): Coordinates | null {
  const cityInfo = CITY_COORDINATES[citySlug];
  if (!cityInfo) {
    return null;
  }

  if (addOffset) {
    return addRandomOffset(cityInfo.coordinates);
  }

  return { ...cityInfo.coordinates };
}

/**
 * Geocode places - either using Google Maps API or falling back to city center.
 */
export async function geocodePlaces(
  places: Place[],
  useGoogleMaps = false
): Promise<Place[]> {
  const geocodedPlaces: Place[] = [];

  for (let i = 0; i < places.length; i++) {
    const place = places[i];

    let coordinates: Coordinates | null = null;

    if (useGoogleMaps && place.address) {
      // Try to geocode using Google Maps
      coordinates = await geocodeAddress(place.address, place.city);
      await sleep(GEOCODE_DELAY_MS);
    }

    // Fall back to city center with random offset
    if (!coordinates) {
      coordinates = getCityCenterCoordinates(place.citySlug, true);
    }

    geocodedPlaces.push({
      ...place,
      coordinates,
    });

    // Progress logging
    if ((i + 1) % 50 === 0 || i === places.length - 1) {
      console.log(`Geocoded ${i + 1}/${places.length} places`);
    }
  }

  return geocodedPlaces;
}
