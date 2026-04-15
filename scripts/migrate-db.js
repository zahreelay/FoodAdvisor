/**
 * Add missing columns to Supabase tables.
 * Run: node scripts/migrate-db.js
 */
import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // Add images column via raw SQL using the REST API
  const migrations = [
    `ALTER TABLE places ADD COLUMN IF NOT EXISTS images text[]`,
    `ALTER TABLE places ADD COLUMN IF NOT EXISTS google_place_id text`,
    `ALTER TABLE places ADD COLUMN IF NOT EXISTS google_rating numeric`,
    `ALTER TABLE places ADD COLUMN IF NOT EXISTS google_review_count integer`,
  ];

  for (const sql of migrations) {
    const { error } = await supabase.rpc("exec_sql", { sql });
    if (error) {
      // exec_sql may not exist — try direct REST
      console.log(`Note: ${error.message}`);
    }
  }

  // Test by trying to upsert a row with images field
  const { error: testErr } = await supabase
    .from("places")
    .update({ images: null })
    .eq("id", "__test_nonexistent__");

  if (testErr && testErr.message.includes("images")) {
    console.error("images column missing. Please run this SQL in Supabase SQL editor:");
    console.error("ALTER TABLE places ADD COLUMN IF NOT EXISTS images text[];");
    console.error("ALTER TABLE places ADD COLUMN IF NOT EXISTS google_place_id text;");
    console.error("ALTER TABLE places ADD COLUMN IF NOT EXISTS google_rating numeric;");
    console.error("ALTER TABLE places ADD COLUMN IF NOT EXISTS google_review_count integer;");
  } else {
    console.log("✓ Schema looks good");
  }
}

main().catch(console.error);
