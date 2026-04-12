/**
 * Copy processed data files to the web public directory.
 */

import { copyFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, "..");
const processedDataDir = join(projectRoot, "data/processed");
const webPublicDataDir = join(projectRoot, "src/web/public/data");

// Ensure target directory exists
if (!existsSync(webPublicDataDir)) {
  mkdirSync(webPublicDataDir, { recursive: true });
}

const files = ["places.json", "cities.json"];

for (const file of files) {
  const src = join(processedDataDir, file);
  const dest = join(webPublicDataDir, file);

  if (existsSync(src)) {
    copyFileSync(src, dest);
    console.log(`Copied ${file} to web public directory`);
  } else {
    console.log(`Warning: ${file} not found in processed data directory`);
  }
}

console.log("Data copy complete!");
