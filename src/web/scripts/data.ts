/**
 * Data loading — fetches places and cities from Supabase.
 */

import { supabase } from "./db";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  name: string;
  slug: string;
  city: string;
  citySlug: string;
  address: string;
  cuisine: string[];
  coordinates: Coordinates | null;
  dishes: string[];
  priceRange: string;
  sourceVideoId: string;
  sourceVideoTitle: string;
  description?: string;
  imageUrl?: string;
}

export interface PlacesData {
  generatedAt: string;
  totalPlaces: number;
  places: Place[];
}

export interface City {
  id: string;
  name: string;
  slug: string;
  state: string;
  coordinates: Coordinates;
  placeCount: number;
}

export interface CitiesData {
  generatedAt: string;
  totalCities: number;
  cities: City[];
}

// In-memory cache per session
let placesCache: Place[] | null = null;
let citiesCache: City[] | null = null;

function rowToPlace(r: Record<string, unknown>): Place {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    city: r.city as string,
    citySlug: r.city_slug as string,
    address: (r.address as string) ?? "",
    cuisine: (r.cuisine as string[]) ?? [],
    coordinates:
      r.lat != null && r.lng != null
        ? { lat: r.lat as number, lng: r.lng as number }
        : null,
    dishes: (r.dishes as string[]) ?? [],
    priceRange: (r.price_range as string) ?? "",
    sourceVideoId: (r.source_video_id as string) ?? "",
    sourceVideoTitle: (r.source_video_title as string) ?? "",
    description: r.description as string | undefined,
    imageUrl: r.image_url as string | undefined,
  };
}

function rowToCity(r: Record<string, unknown>): City {
  return {
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    state: (r.state as string) ?? "",
    coordinates: { lat: r.lat as number, lng: r.lng as number },
    placeCount: (r.place_count as number) ?? 0,
  };
}

export async function loadPlaces(): Promise<PlacesData> {
  if (!placesCache) {
    const { data, error } = await supabase.from("places").select("*");
    if (error) throw error;
    placesCache = (data ?? []).map(rowToPlace);
  }
  return {
    generatedAt: new Date().toISOString(),
    totalPlaces: placesCache.length,
    places: placesCache,
  };
}

export async function loadCities(): Promise<CitiesData> {
  if (!citiesCache) {
    const { data, error } = await supabase.from("cities").select("*");
    if (error) throw error;
    citiesCache = (data ?? []).map(rowToCity);
  }
  return {
    generatedAt: new Date().toISOString(),
    totalCities: citiesCache.length,
    cities: citiesCache,
  };
}

export async function getCityBySlug(slug: string): Promise<City | null> {
  const { data } = await supabase
    .from("cities")
    .select("*")
    .eq("slug", slug)
    .single();
  return data ? rowToCity(data) : null;
}

export async function getPlaceBySlug(slug: string): Promise<Place | null> {
  const { data } = await supabase
    .from("places")
    .select("*")
    .eq("slug", slug)
    .single();
  return data ? rowToPlace(data) : null;
}

export async function getPlacesByCity(citySlug: string): Promise<Place[]> {
  const { data } = await supabase
    .from("places")
    .select("*")
    .eq("city_slug", citySlug);
  return (data ?? []).map(rowToPlace);
}

export async function getSimilarPlaces(
  place: Place,
  limit = 5
): Promise<Place[]> {
  // Fetch all places in same city, score by shared cuisine
  const { data } = await supabase
    .from("places")
    .select("*")
    .eq("city_slug", place.citySlug)
    .neq("id", place.id);

  const places = (data ?? []).map(rowToPlace);

  return places
    .map((p) => {
      const common = p.cuisine.filter((c) => place.cuisine.includes(c)).length;
      const score = common * 3 + (p.priceRange === place.priceRange ? 2 : 0);
      return { place: p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.place);
}

// ===== URL Utils =====

export function getUrlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

// ===== Dish Utilities =====

export const DISH_EMOJIS: Record<string, string> = {
  Biryani: '🍚',
  Dosa: '🥞',
  Idli: '🫓',
  Vada: '🍩',
  Paratha: '🫓',
  Kebab: '🍢',
  Samosa: '🥟',
  'Chole Bhature': '🍛',
  'Vada Pav': '🍔',
  'Pani Puri': '🫧',
  Bhel: '🥗',
  'Sev Puri': '🌿',
  Lassi: '🥛',
  Kachori: '🥮',
  'Dal Makhani': '🫘',
  Kulcha: '🧇',
  Nihari: '🍲',
  Tikka: '🍡',
  Rolls: '🌯',
  'Chelo Kebab': '🍢',
  Rasgulla: '🍮',
  Sandesh: '🍬',
};

const DISH_ALIASES: Record<string, string> = {
  'masala dosa': 'Dosa',
  'plain dosa': 'Dosa',
  'rava dosa': 'Dosa',
  'seekh kebab': 'Kebab',
  'chicken kebab': 'Kebab',
  'mutton kebab': 'Kebab',
  'veg biryani': 'Biryani',
  'chicken biryani': 'Biryani',
  'mutton biryani': 'Biryani',
  'aloo paratha': 'Paratha',
  'stuffed paratha': 'Paratha',
};

export function normalizeDishName(dish: string): string {
  return DISH_ALIASES[dish.toLowerCase()] ?? dish;
}

export function getDishEmoji(dish: string): string {
  return DISH_EMOJIS[dish] ?? '🍽️';
}

export interface DishInfo {
  name: string;
  emoji: string;
  placeCount: number;
  cities: string[];
}

export async function getAllDishes(): Promise<DishInfo[]> {
  const data = await loadPlaces();
  const dishMap = new Map<string, { cities: Set<string>; count: number }>();

  for (const place of data.places) {
    for (const rawDish of place.dishes) {
      const dish = normalizeDishName(rawDish);
      if (!dishMap.has(dish)) {
        dishMap.set(dish, { cities: new Set(), count: 0 });
      }
      const entry = dishMap.get(dish)!;
      entry.count++;
      entry.cities.add(place.city);
    }
  }

  return Array.from(dishMap.entries())
    .map(([name, { cities, count }]) => ({
      name,
      emoji: getDishEmoji(name),
      placeCount: count,
      cities: Array.from(cities).sort(),
    }))
    .sort((a, b) => b.placeCount - a.placeCount || a.name.localeCompare(b.name));
}

export async function getPlacesByDish(dishName: string): Promise<Place[]> {
  // dishes is an array column — use Postgres @> (contains) operator
  const { data } = await supabase
    .from("places")
    .select("*")
    .contains("dishes", [dishName]);

  const places = (data ?? []).map(rowToPlace);

  // Also match aliases
  const aliasMatches = places.filter((p) =>
    p.dishes.some((d) => normalizeDishName(d) === dishName)
  );

  // Combine: direct DB match + alias fallback (deduplicated)
  if (aliasMatches.length > 0 && places.length === 0) {
    const allData = await loadPlaces();
    return allData.places.filter((p) =>
      p.dishes.some((d) => normalizeDishName(d) === dishName)
    );
  }

  return places;
}
