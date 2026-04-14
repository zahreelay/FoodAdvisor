/**
 * Main data processor - orchestrates extraction and transformation of YouTube data.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { VideosData, PlaylistsData } from "../types.js";
import type { Place, PlacesData, City, CitiesData } from "./types.js";
import { CITY_COORDINATES } from "./types.js";
import { extractPlacesFromVideos } from "./extractor.js";
import { geocodePlaces } from "./geocoder.js";
import { summarizeTranscripts, isOpenAIConfigured } from "./summarizer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const PROJECT_ROOT = join(__dirname, "../..");
const RAW_DATA_DIR = join(PROJECT_ROOT, "data/raw");
const PROCESSED_DATA_DIR = join(PROJECT_ROOT, "data/processed");

/**
 * Load JSON file.
 */
function loadJson<T>(filepath: string): T | null {
  try {
    const content = readFileSync(filepath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    console.error(`Failed to load ${filepath}:`, error);
    return null;
  }
}

/**
 * Save JSON file with pretty formatting.
 */
function saveJson<T>(filepath: string, data: T): void {
  writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`Saved: ${filepath}`);
}

/**
 * Generate cities from extracted places.
 */
function generateCities(places: Place[]): City[] {
  const cityPlaceCounts = new Map<string, number>();

  // Count places per city
  for (const place of places) {
    const count = cityPlaceCounts.get(place.citySlug) || 0;
    cityPlaceCounts.set(place.citySlug, count + 1);
  }

  // Create city objects
  const cities: City[] = [];

  for (const [citySlug, placeCount] of cityPlaceCounts) {
    const cityInfo = CITY_COORDINATES[citySlug];
    if (!cityInfo) continue;

    // Proper case for city name
    const cityName = citySlug.charAt(0).toUpperCase() + citySlug.slice(1);

    cities.push({
      id: citySlug,
      name: cityName,
      slug: citySlug,
      state: cityInfo.state,
      coordinates: cityInfo.coordinates,
      placeCount,
    });
  }

  // Sort by place count descending
  cities.sort((a, b) => b.placeCount - a.placeCount);

  return cities;
}

/**
 * Main processing function.
 */
export async function processData(options: {
  useGoogleMaps?: boolean;
  summarize?: boolean;
  dryRun?: boolean;
} = {}): Promise<{ places: Place[]; cities: City[] }> {
  const { useGoogleMaps = false, summarize = false, dryRun = false } = options;

  console.log("=== Street Food Data Processor ===\n");

  // Check for raw data
  const videosPath = join(RAW_DATA_DIR, "videos.json");
  const playlistsPath = join(RAW_DATA_DIR, "playlists.json");

  if (!existsSync(videosPath)) {
    console.log("No videos.json found. Using sample data for development.\n");
    return createSampleData(dryRun);
  }

  // Load raw data
  console.log("Loading raw data...");
  const videosData = loadJson<VideosData>(videosPath);
  const playlistsData = loadJson<PlaylistsData>(playlistsPath);

  if (!videosData || !playlistsData) {
    throw new Error("Failed to load raw data files");
  }

  console.log(`Found ${videosData.totalVideos} videos and ${playlistsData.playlists.length} playlists\n`);

  // Extract places from videos
  console.log("Extracting places from videos...");
  const allPlaces = extractPlacesFromVideos(videosData.videos, playlistsData.playlists);

  // Filter to target cities only
  const TARGET_CITIES = new Set(["delhi", "bangalore", "bengaluru", "mumbai", "kolkata", "hyderabad"]);
  let places = allPlaces.filter((p) => TARGET_CITIES.has(p.citySlug));
  console.log(`Extracted ${allPlaces.length} places total, ${places.length} in target cities\n`);

  // Geocode places
  console.log("Geocoding places...");
  places = await geocodePlaces(places, useGoogleMaps);
  console.log();

  // Summarize transcripts with OpenAI
  if (summarize) {
    console.log("Generating descriptions from transcripts...");
    if (!isOpenAIConfigured()) {
      console.log("OPENAI_API_KEY not set - using fallback descriptions\n");
    }
    const descriptions = await summarizeTranscripts(places);
    places = places.map((place) => ({
      ...place,
      description: descriptions.get(place.id) || place.description,
    }));
    console.log();
  }

  // Generate cities
  console.log("Generating cities...");
  const cities = generateCities(places);
  console.log(`Generated ${cities.length} cities\n`);

  // Save processed data
  if (!dryRun) {
    const placesData: PlacesData = {
      generatedAt: new Date().toISOString(),
      totalPlaces: places.length,
      places,
    };

    const citiesData: CitiesData = {
      generatedAt: new Date().toISOString(),
      totalCities: cities.length,
      cities,
    };

    saveJson(join(PROCESSED_DATA_DIR, "places.json"), placesData);
    saveJson(join(PROCESSED_DATA_DIR, "cities.json"), citiesData);
  } else {
    console.log("[Dry run] Would save places.json and cities.json");
  }

  // Print summary
  console.log("\n=== Summary ===");
  console.log(`Total places: ${places.length}`);
  console.log(`Total cities: ${cities.length}`);
  console.log("\nTop cities by place count:");
  cities.slice(0, 10).forEach((city, i) => {
    console.log(`  ${i + 1}. ${city.name}: ${city.placeCount} places`);
  });

  return { places, cities };
}

/**
 * Create sample data for development/testing.
 */
function createSampleData(dryRun: boolean): { places: Place[]; cities: City[] } {
  console.log("Creating sample data...\n");

  const samplePlaces: Place[] = [
    {
      id: "paranthe-wali-gali-delhi-abc123",
      name: "Paranthe Wali Gali",
      slug: "paranthe-wali-gali-delhi",
      city: "Delhi",
      citySlug: "delhi",
      address: "Chandni Chowk, Old Delhi",
      cuisine: ["North Indian", "Street Food"],
      coordinates: { lat: 28.6562, lng: 77.2307 },
      dishes: ["Paratha", "Lassi"],
      priceRange: "₹",
      sourceVideoId: "sample1",
      sourceVideoTitle: "Best Parathas in Delhi",
      description: "A legendary alley in Old Delhi where parathas have been served for over 150 years. The crispy, stuffed flatbreads come in varieties from classic aloo to exotic rabri, all cooked in pure desi ghee. Pair with tangy pickle and sweet lassi for the complete experience.",
    },
    {
      id: "sita-ram-chole-bhature-delhi-def456",
      name: "Sita Ram Diwan Chand",
      slug: "sita-ram-diwan-chand-delhi",
      city: "Delhi",
      citySlug: "delhi",
      address: "2243, Rajguru Marg, Chuna Mandi, Paharganj",
      cuisine: ["North Indian", "Street Food"],
      coordinates: { lat: 28.6447, lng: 77.2107 },
      dishes: ["Chole Bhature"],
      priceRange: "₹",
      sourceVideoId: "sample2",
      sourceVideoTitle: "Legendary Chole Bhature at Sita Ram",
      description: "Since 1955, this Paharganj institution has been serving what many consider Delhi's finest chole bhature. The fluffy, perfectly puffed bhature paired with spicy, tangy chole and their signature green chutney creates an unforgettable breakfast experience.",
    },
    {
      id: "karim-delhi-ghi789",
      name: "Karim's",
      slug: "karims-delhi",
      city: "Delhi",
      citySlug: "delhi",
      address: "16, Gali Kababian, Jama Masjid",
      cuisine: ["Mughlai", "North Indian"],
      coordinates: { lat: 28.6505, lng: 77.2337 },
      dishes: ["Kebab", "Biryani", "Nihari"],
      priceRange: "₹₹",
      sourceVideoId: "sample3",
      sourceVideoTitle: "Karim's - 100 Year Old Legacy",
      description: "Established in 1913 by descendants of royal Mughal chefs, Karim's is a pilgrimage for meat lovers. Their melt-in-mouth seekh kebabs, rich mutton korma, and slow-cooked nihari carry forward recipes from the Mughal court kitchens.",
    },
    {
      id: "bademiya-mumbai-jkl012",
      name: "Bademiya",
      slug: "bademiya-mumbai",
      city: "Mumbai",
      citySlug: "mumbai",
      address: "Tulloch Road, Behind Taj Mahal Hotel, Colaba",
      cuisine: ["Mughlai", "Street Food"],
      coordinates: { lat: 18.9217, lng: 72.8332 },
      dishes: ["Kebab", "Tikka", "Rolls"],
      priceRange: "₹₹",
      sourceVideoId: "sample4",
      sourceVideoTitle: "Best Late Night Kebabs at Bademiya",
      description: "Mumbai's most iconic late-night kebab destination, operating since 1946. Watch skilled cooks grill succulent seekh kebabs and tikkas over charcoal as the aroma fills the Colaba streets. The chicken rolls wrapped in roomali roti are legendary.",
    },
    {
      id: "ashok-vada-pav-mumbai-mno345",
      name: "Ashok Vada Pav",
      slug: "ashok-vada-pav-mumbai",
      city: "Mumbai",
      citySlug: "mumbai",
      address: "Kirti College, Dadar West",
      cuisine: ["Maharashtrian", "Street Food"],
      coordinates: { lat: 19.0226, lng: 72.8424 },
      dishes: ["Vada Pav"],
      priceRange: "₹",
      sourceVideoId: "sample5",
      sourceVideoTitle: "Iconic Vada Pav of Mumbai",
      description: "A Dadar institution serving what locals claim is Mumbai's best vada pav. The crispy, spiced potato vada nestled in soft pav with fiery dry garlic chutney has been perfected over decades. Simple, affordable, and absolutely addictive.",
    },
    {
      id: "chowpatty-bhel-mumbai-pqr678",
      name: "Chowpatty Beach Bhel",
      slug: "chowpatty-bhel-mumbai",
      city: "Mumbai",
      citySlug: "mumbai",
      address: "Marine Drive, Chowpatty Beach",
      cuisine: ["Chaat", "Street Food"],
      coordinates: { lat: 18.9548, lng: 72.8148 },
      dishes: ["Bhel", "Pani Puri", "Sev Puri"],
      priceRange: "₹",
      sourceVideoId: "sample6",
      sourceVideoTitle: "Chowpatty Chaat Experience",
      description: "No Mumbai visit is complete without bhel puri at Chowpatty Beach. The vendors here have perfected the art of mixing puffed rice, tangy chutneys, and crunchy sev into a flavor explosion. Best enjoyed watching the sunset over the Arabian Sea.",
    },
    {
      id: "vidyarthi-bhavan-bangalore-stu901",
      name: "Vidyarthi Bhavan",
      slug: "vidyarthi-bhavan-bangalore",
      city: "Bangalore",
      citySlug: "bangalore",
      address: "32, Gandhi Bazaar Main Road, Basavanagudi",
      cuisine: ["South Indian"],
      coordinates: { lat: 12.9432, lng: 77.5676 },
      dishes: ["Dosa", "Idli"],
      priceRange: "₹",
      sourceVideoId: "sample7",
      sourceVideoTitle: "Best Masala Dosa at Vidyarthi Bhavan",
      description: "Since 1943, this Basavanagudi landmark has been serving what many consider South India's perfect masala dosa. The crispy, ghee-roasted crepe with spiced potato filling, served with fresh coconut chutney, draws crowds willing to wait in long queues.",
    },
    {
      id: "ram-ki-bandi-hyderabad-vwx234",
      name: "Ram Ki Bandi",
      slug: "ram-ki-bandi-hyderabad",
      city: "Hyderabad",
      citySlug: "hyderabad",
      address: "Near Nampally Station, Mozamjahi Market",
      cuisine: ["South Indian", "Street Food"],
      coordinates: { lat: 17.3818, lng: 78.4736 },
      dishes: ["Dosa", "Idli", "Vada"],
      priceRange: "₹",
      sourceVideoId: "sample8",
      sourceVideoTitle: "Midnight Dosa at Ram Ki Bandi",
      description: "Hyderabad's beloved midnight food cart that opens only after 1 AM. Night owls and food enthusiasts queue up for their perfectly crispy dosas and fluffy idlis, making it a unique late-night culinary experience in the city.",
    },
    {
      id: "paradise-biryani-hyderabad-yza567",
      name: "Paradise Biryani",
      slug: "paradise-biryani-hyderabad",
      city: "Hyderabad",
      citySlug: "hyderabad",
      address: "MG Road, Secunderabad",
      cuisine: ["Biryani", "Mughlai"],
      coordinates: { lat: 17.4417, lng: 78.4894 },
      dishes: ["Biryani"],
      priceRange: "₹₹",
      sourceVideoId: "sample9",
      sourceVideoTitle: "Hyderabad's Famous Paradise Biryani",
      description: "An iconic name synonymous with Hyderabadi biryani since 1953. Their aromatic, slow-cooked dum biryani with tender meat and fragrant basmati rice, served with mirchi ka salan and raita, represents the pinnacle of this royal dish.",
    },
    {
      id: "lassiwala-jaipur-bcd890",
      name: "Lassiwala",
      slug: "lassiwala-jaipur",
      city: "Jaipur",
      citySlug: "jaipur",
      address: "MI Road, Jaipur",
      cuisine: ["Beverages", "Rajasthani"],
      coordinates: { lat: 26.9167, lng: 75.8007 },
      dishes: ["Lassi"],
      priceRange: "₹",
      sourceVideoId: "sample10",
      sourceVideoTitle: "Famous Lassi at MI Road",
      description: "The original Lassiwala on MI Road has been churning out thick, creamy lassi in traditional clay cups since 1944. Topped with a generous layer of malai, this refreshing yogurt drink is the perfect antidote to Jaipur's heat.",
    },
    {
      id: "pyaaz-kachori-jaipur-efg123",
      name: "Rawat Mishthan Bhandar",
      slug: "rawat-mishthan-bhandar-jaipur",
      city: "Jaipur",
      citySlug: "jaipur",
      address: "Station Road, Sindhi Camp",
      cuisine: ["Rajasthani", "Sweets", "Chaat"],
      coordinates: { lat: 26.9205, lng: 75.7854 },
      dishes: ["Kachori", "Samosa"],
      priceRange: "₹",
      sourceVideoId: "sample11",
      sourceVideoTitle: "Best Pyaaz Kachori in Jaipur",
      description: "Famous throughout Rajasthan for their pyaaz kachori - crispy, flaky shells stuffed with spiced onion filling, served with tangy tamarind chutney. The breakfast rush here is legendary, with locals lining up for these golden delights.",
    },
    {
      id: "kesar-da-dhaba-amritsar-hij456",
      name: "Kesar Da Dhaba",
      slug: "kesar-da-dhaba-amritsar",
      city: "Amritsar",
      citySlug: "amritsar",
      address: "Chowk Passian, Near Town Hall",
      cuisine: ["Punjabi", "North Indian"],
      coordinates: { lat: 31.6361, lng: 74.8736 },
      dishes: ["Dal Makhani", "Paratha"],
      priceRange: "₹",
      sourceVideoId: "sample12",
      sourceVideoTitle: "100 Year Old Kesar Da Dhaba",
      description: "Operating since 1916, this legendary dhaba serves what many consider Punjab's finest dal makhani - black lentils slow-cooked overnight with generous butter and cream. Their thalis offer an authentic taste of Amritsari cuisine.",
    },
    {
      id: "kulcha-land-amritsar-klm789",
      name: "Kulcha Land",
      slug: "kulcha-land-amritsar",
      city: "Amritsar",
      citySlug: "amritsar",
      address: "Ranjit Avenue C Block",
      cuisine: ["Punjabi", "Street Food"],
      coordinates: { lat: 31.6497, lng: 74.8588 },
      dishes: ["Kulcha"],
      priceRange: "₹",
      sourceVideoId: "sample13",
      sourceVideoTitle: "Amritsari Kulcha at Kulcha Land",
      description: "The definitive destination for Amritsari kulcha - crispy, tandoor-baked flatbread stuffed with spiced potatoes, served with chole and tangy chutney. Each kulcha is made fresh to order, ensuring perfect crispiness every time.",
    },
    {
      id: "peter-cat-kolkata-nop012",
      name: "Peter Cat",
      slug: "peter-cat-kolkata",
      city: "Kolkata",
      citySlug: "kolkata",
      address: "18A, Park Street",
      cuisine: ["Bengali", "Mughlai"],
      coordinates: { lat: 22.5512, lng: 88.3519 },
      dishes: ["Chelo Kebab"],
      priceRange: "₹₹₹",
      sourceVideoId: "sample14",
      sourceVideoTitle: "Iconic Chelo Kebab at Peter Cat",
      description: "A Park Street institution since 1975, famous for inventing the Chelo Kebab - sizzling mutton seekh kebabs served on a bed of buttered rice with a fried egg. The dramatic presentation and rich flavors make it Kolkata's most iconic dish.",
    },
    {
      id: "kc-das-kolkata-qrs345",
      name: "K.C. Das",
      slug: "kc-das-kolkata",
      city: "Kolkata",
      citySlug: "kolkata",
      address: "Esplanade Row",
      cuisine: ["Bengali", "Sweets"],
      coordinates: { lat: 22.5604, lng: 88.3517 },
      dishes: ["Rasgulla", "Sandesh"],
      priceRange: "₹₹",
      sourceVideoId: "sample15",
      sourceVideoTitle: "Legendary Rasgulla at K.C. Das",
      description: "The birthplace of the spongy, syrup-soaked rasgulla, invented by Nobin Chandra Das in 1868. K.C. Das continues this legacy with pillowy-soft rasgullas and delicate sandesh that melt in your mouth - essential Bengali sweet experiences.",
    },
  ];

  const cities = generateCities(samplePlaces);

  if (!dryRun) {
    const placesData: PlacesData = {
      generatedAt: new Date().toISOString(),
      totalPlaces: samplePlaces.length,
      places: samplePlaces,
    };

    const citiesData: CitiesData = {
      generatedAt: new Date().toISOString(),
      totalCities: cities.length,
      cities,
    };

    saveJson(join(PROCESSED_DATA_DIR, "places.json"), placesData);
    saveJson(join(PROCESSED_DATA_DIR, "cities.json"), citiesData);
  }

  console.log("Sample data created successfully!\n");
  console.log(`Total places: ${samplePlaces.length}`);
  console.log(`Total cities: ${cities.length}`);

  return { places: samplePlaces, cities };
}

// CLI entry point
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith("processor.ts") ||
  process.argv[1].endsWith("processor.js")
);

if (isMainModule) {
  const args = process.argv.slice(2);
  const useGoogleMaps = args.includes("--geocode");
  const summarize = args.includes("--summarize");
  const dryRun = args.includes("--dry-run");

  processData({ useGoogleMaps, summarize, dryRun })
    .then(() => {
      console.log("\nProcessing complete!");
    })
    .catch((error) => {
      console.error("Processing failed:", error);
      process.exit(1);
    });
}
