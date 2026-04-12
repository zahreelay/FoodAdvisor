/**
 * Data loading and management for the Street Food India website.
 */

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

// Cache for loaded data
let placesCache: PlacesData | null = null;
let citiesCache: CitiesData | null = null;

/**
 * Load cities data from JSON.
 */
export async function loadCities(): Promise<CitiesData> {
  if (citiesCache) return citiesCache;

  try {
    const response = await fetch("/data/cities.json");
    if (!response.ok) throw new Error("Failed to load cities");
    citiesCache = await response.json();
    return citiesCache!;
  } catch (error) {
    console.error("Error loading cities:", error);
    // Return embedded sample data as fallback
    return getSampleCitiesData();
  }
}

/**
 * Load places data from JSON.
 */
export async function loadPlaces(): Promise<PlacesData> {
  if (placesCache) return placesCache;

  try {
    const response = await fetch("/data/places.json");
    if (!response.ok) throw new Error("Failed to load places");
    placesCache = await response.json();
    return placesCache!;
  } catch (error) {
    console.error("Error loading places:", error);
    // Return embedded sample data as fallback
    return getSamplePlacesData();
  }
}

/**
 * Get a city by slug.
 */
export async function getCityBySlug(slug: string): Promise<City | null> {
  const data = await loadCities();
  return data.cities.find((c) => c.slug === slug) || null;
}

/**
 * Get a place by slug.
 */
export async function getPlaceBySlug(slug: string): Promise<Place | null> {
  const data = await loadPlaces();
  return data.places.find((p) => p.slug === slug) || null;
}

/**
 * Get places for a specific city.
 */
export async function getPlacesByCity(citySlug: string): Promise<Place[]> {
  const data = await loadPlaces();
  return data.places.filter((p) => p.citySlug === citySlug);
}

/**
 * Get similar places (same city, similar cuisine).
 */
export async function getSimilarPlaces(
  place: Place,
  limit = 5
): Promise<Place[]> {
  const data = await loadPlaces();

  // Score each place based on similarity
  const scored = data.places
    .filter((p) => p.id !== place.id)
    .map((p) => {
      let score = 0;

      // Same city gets highest score
      if (p.citySlug === place.citySlug) score += 10;

      // Overlapping cuisines
      const commonCuisines = p.cuisine.filter((c) =>
        place.cuisine.includes(c)
      );
      score += commonCuisines.length * 3;

      // Similar price range
      if (p.priceRange === place.priceRange) score += 2;

      return { place: p, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((s) => s.place);
}

// ===== Helper Functions =====

/**
 * Get URL parameter from query string.
 */
export function getUrlParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
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
  const data = await loadPlaces();
  return data.places.filter((p) =>
    p.dishes.some((d) => normalizeDishName(d) === dishName)
  );
}

// ===== Sample Data =====

function getSampleCitiesData(): CitiesData {
  return {
    generatedAt: new Date().toISOString(),
    totalCities: 7,
    cities: [
      { id: "delhi", name: "Delhi", slug: "delhi", state: "Delhi", coordinates: { lat: 28.6139, lng: 77.209 }, placeCount: 3 },
      { id: "mumbai", name: "Mumbai", slug: "mumbai", state: "Maharashtra", coordinates: { lat: 19.076, lng: 72.8777 }, placeCount: 3 },
      { id: "bangalore", name: "Bangalore", slug: "bangalore", state: "Karnataka", coordinates: { lat: 12.9716, lng: 77.5946 }, placeCount: 1 },
      { id: "hyderabad", name: "Hyderabad", slug: "hyderabad", state: "Telangana", coordinates: { lat: 17.385, lng: 78.4867 }, placeCount: 2 },
      { id: "jaipur", name: "Jaipur", slug: "jaipur", state: "Rajasthan", coordinates: { lat: 26.9124, lng: 75.7873 }, placeCount: 2 },
      { id: "amritsar", name: "Amritsar", slug: "amritsar", state: "Punjab", coordinates: { lat: 31.634, lng: 74.8723 }, placeCount: 2 },
      { id: "kolkata", name: "Kolkata", slug: "kolkata", state: "West Bengal", coordinates: { lat: 22.5726, lng: 88.3639 }, placeCount: 2 },
    ],
  };
}

function getSamplePlacesData(): PlacesData {
  return {
    generatedAt: new Date().toISOString(),
    totalPlaces: 15,
    places: [
      { id: "paranthe-wali-gali-delhi-abc123", name: "Paranthe Wali Gali", slug: "paranthe-wali-gali-delhi", city: "Delhi", citySlug: "delhi", address: "Chandni Chowk, Old Delhi", cuisine: ["North Indian", "Street Food"], coordinates: { lat: 28.6562, lng: 77.2307 }, dishes: ["Paratha", "Lassi"], priceRange: "₹", sourceVideoId: "sample1", sourceVideoTitle: "Best Parathas in Delhi", description: "A legendary alley in Old Delhi where parathas have been served for over 150 years. The crispy, stuffed flatbreads come in varieties from classic aloo to exotic rabri, all cooked in pure desi ghee." },
      { id: "sita-ram-chole-bhature-delhi-def456", name: "Sita Ram Diwan Chand", slug: "sita-ram-diwan-chand-delhi", city: "Delhi", citySlug: "delhi", address: "2243, Rajguru Marg, Chuna Mandi, Paharganj", cuisine: ["North Indian", "Street Food"], coordinates: { lat: 28.6447, lng: 77.2107 }, dishes: ["Chole Bhature"], priceRange: "₹", sourceVideoId: "sample2", sourceVideoTitle: "Legendary Chole Bhature at Sita Ram", description: "Since 1955, this Paharganj institution has been serving what many consider Delhi's finest chole bhature. The fluffy, perfectly puffed bhature paired with spicy, tangy chole creates an unforgettable breakfast experience." },
      { id: "karim-delhi-ghi789", name: "Karim's", slug: "karims-delhi", city: "Delhi", citySlug: "delhi", address: "16, Gali Kababian, Jama Masjid", cuisine: ["Mughlai", "North Indian"], coordinates: { lat: 28.6505, lng: 77.2337 }, dishes: ["Kebab", "Biryani", "Nihari"], priceRange: "₹₹", sourceVideoId: "sample3", sourceVideoTitle: "Karim's - 100 Year Old Legacy", description: "Established in 1913 by descendants of royal Mughal chefs, Karim's is a pilgrimage for meat lovers. Their melt-in-mouth seekh kebabs, rich mutton korma, and slow-cooked nihari carry forward recipes from the Mughal court kitchens." },
      { id: "bademiya-mumbai-jkl012", name: "Bademiya", slug: "bademiya-mumbai", city: "Mumbai", citySlug: "mumbai", address: "Tulloch Road, Behind Taj Mahal Hotel, Colaba", cuisine: ["Mughlai", "Street Food"], coordinates: { lat: 18.9217, lng: 72.8332 }, dishes: ["Kebab", "Tikka", "Rolls"], priceRange: "₹₹", sourceVideoId: "sample4", sourceVideoTitle: "Best Late Night Kebabs at Bademiya", description: "Mumbai's most iconic late-night kebab destination, operating since 1946. Watch skilled cooks grill succulent seekh kebabs and tikkas over charcoal. The chicken rolls wrapped in roomali roti are legendary." },
      { id: "ashok-vada-pav-mumbai-mno345", name: "Ashok Vada Pav", slug: "ashok-vada-pav-mumbai", city: "Mumbai", citySlug: "mumbai", address: "Kirti College, Dadar West", cuisine: ["Maharashtrian", "Street Food"], coordinates: { lat: 19.0226, lng: 72.8424 }, dishes: ["Vada Pav"], priceRange: "₹", sourceVideoId: "sample5", sourceVideoTitle: "Iconic Vada Pav of Mumbai", description: "A Dadar institution serving what locals claim is Mumbai's best vada pav. The crispy, spiced potato vada nestled in soft pav with fiery dry garlic chutney has been perfected over decades." },
      { id: "chowpatty-bhel-mumbai-pqr678", name: "Chowpatty Beach Bhel", slug: "chowpatty-bhel-mumbai", city: "Mumbai", citySlug: "mumbai", address: "Marine Drive, Chowpatty Beach", cuisine: ["Chaat", "Street Food"], coordinates: { lat: 18.9548, lng: 72.8148 }, dishes: ["Bhel", "Pani Puri", "Sev Puri"], priceRange: "₹", sourceVideoId: "sample6", sourceVideoTitle: "Chowpatty Chaat Experience", description: "No Mumbai visit is complete without bhel puri at Chowpatty Beach. The vendors here have perfected the art of mixing puffed rice, tangy chutneys, and crunchy sev into a flavor explosion." },
      { id: "vidyarthi-bhavan-bangalore-stu901", name: "Vidyarthi Bhavan", slug: "vidyarthi-bhavan-bangalore", city: "Bangalore", citySlug: "bangalore", address: "32, Gandhi Bazaar Main Road, Basavanagudi", cuisine: ["South Indian"], coordinates: { lat: 12.9432, lng: 77.5676 }, dishes: ["Dosa", "Idli"], priceRange: "₹", sourceVideoId: "sample7", sourceVideoTitle: "Best Masala Dosa at Vidyarthi Bhavan", description: "Since 1943, this Basavanagudi landmark has been serving what many consider South India's perfect masala dosa. The crispy, ghee-roasted crepe with spiced potato filling draws crowds willing to wait in long queues." },
      { id: "ram-ki-bandi-hyderabad-vwx234", name: "Ram Ki Bandi", slug: "ram-ki-bandi-hyderabad", city: "Hyderabad", citySlug: "hyderabad", address: "Near Nampally Station, Mozamjahi Market", cuisine: ["South Indian", "Street Food"], coordinates: { lat: 17.3818, lng: 78.4736 }, dishes: ["Dosa", "Idli", "Vada"], priceRange: "₹", sourceVideoId: "sample8", sourceVideoTitle: "Midnight Dosa at Ram Ki Bandi", description: "Hyderabad's beloved midnight food cart that opens only after 1 AM. Night owls and food enthusiasts queue up for their perfectly crispy dosas and fluffy idlis, making it a unique late-night culinary experience." },
      { id: "paradise-biryani-hyderabad-yza567", name: "Paradise Biryani", slug: "paradise-biryani-hyderabad", city: "Hyderabad", citySlug: "hyderabad", address: "MG Road, Secunderabad", cuisine: ["Biryani", "Mughlai"], coordinates: { lat: 17.4417, lng: 78.4894 }, dishes: ["Biryani"], priceRange: "₹₹", sourceVideoId: "sample9", sourceVideoTitle: "Hyderabad's Famous Paradise Biryani", description: "An iconic name synonymous with Hyderabadi biryani since 1953. Their aromatic, slow-cooked dum biryani with tender meat and fragrant basmati rice represents the pinnacle of this royal dish." },
      { id: "lassiwala-jaipur-bcd890", name: "Lassiwala", slug: "lassiwala-jaipur", city: "Jaipur", citySlug: "jaipur", address: "MI Road, Jaipur", cuisine: ["Beverages", "Rajasthani"], coordinates: { lat: 26.9167, lng: 75.8007 }, dishes: ["Lassi"], priceRange: "₹", sourceVideoId: "sample10", sourceVideoTitle: "Famous Lassi at MI Road", description: "The original Lassiwala on MI Road has been churning out thick, creamy lassi in traditional clay cups since 1944. Topped with a generous layer of malai, this is the perfect antidote to Jaipur's heat." },
      { id: "pyaaz-kachori-jaipur-efg123", name: "Rawat Mishthan Bhandar", slug: "rawat-mishthan-bhandar-jaipur", city: "Jaipur", citySlug: "jaipur", address: "Station Road, Sindhi Camp", cuisine: ["Rajasthani", "Sweets", "Chaat"], coordinates: { lat: 26.9205, lng: 75.7854 }, dishes: ["Kachori", "Samosa"], priceRange: "₹", sourceVideoId: "sample11", sourceVideoTitle: "Best Pyaaz Kachori in Jaipur", description: "Famous throughout Rajasthan for their pyaaz kachori - crispy, flaky shells stuffed with spiced onion filling, served with tangy tamarind chutney. The breakfast rush here is legendary." },
      { id: "kesar-da-dhaba-amritsar-hij456", name: "Kesar Da Dhaba", slug: "kesar-da-dhaba-amritsar", city: "Amritsar", citySlug: "amritsar", address: "Chowk Passian, Near Town Hall", cuisine: ["Punjabi", "North Indian"], coordinates: { lat: 31.6361, lng: 74.8736 }, dishes: ["Dal Makhani", "Paratha"], priceRange: "₹", sourceVideoId: "sample12", sourceVideoTitle: "100 Year Old Kesar Da Dhaba", description: "Operating since 1916, this legendary dhaba serves what many consider Punjab's finest dal makhani - black lentils slow-cooked overnight with generous butter and cream." },
      { id: "kulcha-land-amritsar-klm789", name: "Kulcha Land", slug: "kulcha-land-amritsar", city: "Amritsar", citySlug: "amritsar", address: "Ranjit Avenue C Block", cuisine: ["Punjabi", "Street Food"], coordinates: { lat: 31.6497, lng: 74.8588 }, dishes: ["Kulcha"], priceRange: "₹", sourceVideoId: "sample13", sourceVideoTitle: "Amritsari Kulcha at Kulcha Land", description: "The definitive destination for Amritsari kulcha - crispy, tandoor-baked flatbread stuffed with spiced potatoes, served with chole and tangy chutney. Each kulcha is made fresh to order." },
      { id: "peter-cat-kolkata-nop012", name: "Peter Cat", slug: "peter-cat-kolkata", city: "Kolkata", citySlug: "kolkata", address: "18A, Park Street", cuisine: ["Bengali", "Mughlai"], coordinates: { lat: 22.5512, lng: 88.3519 }, dishes: ["Chelo Kebab"], priceRange: "₹₹₹", sourceVideoId: "sample14", sourceVideoTitle: "Iconic Chelo Kebab at Peter Cat", description: "A Park Street institution since 1975, famous for inventing the Chelo Kebab - sizzling mutton seekh kebabs served on a bed of buttered rice with a fried egg. The dramatic presentation makes it Kolkata's most iconic dish." },
      { id: "kc-das-kolkata-qrs345", name: "K.C. Das", slug: "kc-das-kolkata", city: "Kolkata", citySlug: "kolkata", address: "Esplanade Row", cuisine: ["Bengali", "Sweets"], coordinates: { lat: 22.5604, lng: 88.3517 }, dishes: ["Rasgulla", "Sandesh"], priceRange: "₹₹", sourceVideoId: "sample15", sourceVideoTitle: "Legendary Rasgulla at K.C. Das", description: "The birthplace of the spongy, syrup-soaked rasgulla, invented by Nobin Chandra Das in 1868. K.C. Das continues this legacy with pillowy-soft rasgullas and delicate sandesh that melt in your mouth." },
    ],
  };
}
