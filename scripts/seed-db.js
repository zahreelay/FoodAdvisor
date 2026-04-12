/**
 * Seed script — pushes places.json and cities.json into Supabase.
 * Run once: node scripts/seed-db.js
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (Project Settings → API → service_role key)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

function loadJson(relPath) {
  return JSON.parse(readFileSync(resolve(__dirname, relPath), "utf-8"));
}

async function seedCities(cities) {
  console.log(`Seeding ${cities.length} cities...`);
  const rows = cities.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    state: c.state,
    lat: c.coordinates?.lat ?? null,
    lng: c.coordinates?.lng ?? null,
    place_count: c.placeCount ?? 0,
  }));

  const { error } = await supabase
    .from("cities")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    console.error("Cities seed error:", error.message);
    process.exit(1);
  }
  console.log(`✓ ${cities.length} cities seeded`);
}

async function seedPlaces(places) {
  console.log(`Seeding ${places.length} places...`);
  const rows = places.map((p) => ({
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
  }));

  // Upsert in batches of 100 to avoid request size limits
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("places")
      .upsert(batch, { onConflict: "id" });
    if (error) {
      console.error(`Places seed error (batch ${i / BATCH + 1}):`, error.message);
      process.exit(1);
    }
    console.log(`  ✓ batch ${Math.floor(i / BATCH) + 1}: ${batch.length} places`);
  }
  console.log(`✓ ${places.length} places seeded`);
}

async function main() {
  const placesData = loadJson("../src/web/public/data/places.json");
  const citiesData = loadJson("../src/web/public/data/cities.json");

  await seedCities(citiesData.cities);
  await seedPlaces(placesData.places);

  console.log("\nDone! Data is now in Supabase.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
