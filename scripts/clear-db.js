/**
 * Clear all data from Supabase tables.
 * Run: node scripts/clear-db.js
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
  // likes/bookmarks use bigint id; places/cities use text id
  const intTables = ["likes", "bookmarks"];
  for (const table of intTables) {
    const { error } = await supabase.from(table).delete().neq("id", 0);
    if (error && !error.message.includes("does not exist")) {
      console.error(`Error clearing ${table}:`, error.message);
    } else {
      console.log(`✓ cleared ${table}`);
    }
  }

  const textTables = ["places", "cities"];
  for (const table of textTables) {
    const { error } = await supabase.from(table).delete().neq("id", "__none__");
    if (error && !error.message.includes("does not exist")) {
      console.error(`Error clearing ${table}:`, error.message);
    } else {
      console.log(`✓ cleared ${table}`);
    }
  }
  console.log("Done.");
}

main().catch(console.error);
