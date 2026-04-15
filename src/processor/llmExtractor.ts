/**
 * Claude-powered place extractor.
 * Reads a video's transcript + description and returns all food places mentioned.
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Place } from "./types.js";
import { CITY_COORDINATES } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, "../../.env.local") });

const PROJECT_ROOT = join(__dirname, "../..");
const TRANSCRIPTS_DIR = join(PROJECT_ROOT, "data/raw/transcripts");

interface LLMPlace {
  name: string;
  address: string;
  city: string;
  citySlug: string;
  dishes: string[];
  cuisine: string[];
  priceRange: string;
  description: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadTranscriptText(videoId: string): string | null {
  const path = join(TRANSCRIPTS_DIR, `${videoId}.json`);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    if (data.error) return null;
    return (data.fullText as string) || null;
  } catch {
    return null;
  }
}

/**
 * Extract all food places from a video using Claude.
 */
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = `You are a data extraction assistant for a street food guide app covering Indian cities.

Given a YouTube food walk video's title, description, and transcript, extract every distinct food establishment (restaurant, dhaba, stall, cart, sweet shop, chai stall, etc.) that is actually visited or reviewed in the video.

Rules:
- Only include places that are specifically visited/reviewed, not just mentioned in passing
- Extract the exact name as used in the video
- For city: only use delhi, mumbai, kolkata, hyderabad, bangalore (lowercase)
- For citySlug: same as city but always lowercase
- For address: extract from description/transcript if available, else leave empty string
- For dishes: list specific dishes tried at that place (not generic)
- For cuisine: pick from [North Indian, South Indian, Mughlai, Chaat, Biryani, Bengali, Punjabi, Maharashtrian, Street Food, Sweets, Beverages, Chinese, Seafood]
- For priceRange: ₹ (<100/person), ₹₹ (100-300), ₹₹₹ (300-700), ₹₹₹₹ (700+)
- For description: write 4-6 sentences of vivid, evocative marketing copy that makes a reader desperate to visit. Use sensory details — smells, textures, sounds, colours. Capture the atmosphere, the legacy, what makes this place unmissable. Make it feel like the best food writing you've ever read. Do NOT mention YouTube, videos, cameras, or vloggers. Write in present tense.

Return ONLY a valid JSON array. No markdown, no explanation.

Example output:
[
  {
    "name": "Qureshi Kabab Corner",
    "address": "Matia Mahal, Jama Masjid, Old Delhi",
    "city": "Delhi",
    "citySlug": "delhi",
    "dishes": ["Seekh Kebab", "Shammi Kebab"],
    "cuisine": ["Mughlai", "Street Food"],
    "priceRange": "₹",
    "description": "Tucked into the labyrinthine lanes of Matia Mahal, Qureshi Kabab Corner has been perfuming Old Delhi's air with the intoxicating char of coal-grilled meat for generations. The seekh kebabs arrive sizzling on skewers — coarsely minced mutton packed with ginger, green chilli, and a whisper of mace, the outside kissed to a smoky crust while the inside stays impossibly juicy. Their shammi kabab is a different kind of miracle: a silken disc of slow-cooked meat and chana dal so finely blended it dissolves on your tongue before you've had a chance to savour it. During Ramzan, when the whole neighbourhood erupts into a festival of lights and longing, a plate here with a warm sheermal is the closest thing to a religious experience that food can offer."
  }
]`;

export async function extractPlacesWithLLM(video: {
  id: string;
  title: string;
  description: string;
  tags?: string[];
}): Promise<Place[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set in .env.local");
  }

  const transcript = loadTranscriptText(video.id);
  const tagsText = (video.tags || []).join(", ");

  const contentParts: string[] = [
    `VIDEO TITLE: ${video.title}`,
    tagsText ? `TAGS: ${tagsText}` : "",
    `\nDESCRIPTION:\n${video.description.slice(0, 2000)}`,
  ];

  if (transcript) {
    const t = transcript.length > 6000 ? transcript.slice(0, 6000) + "..." : transcript;
    contentParts.push(`\nTRANSCRIPT:\n${t}`);
  }

  const userContent = contentParts.filter(Boolean).join("\n");

  console.log(`Sending to GPT-4o: ${video.title}`);
  console.log(`  Transcript: ${transcript ? transcript.length + " chars" : "not available"}`);

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 4096,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`OpenAI error: ${data.error.message}`);

  const rawText = data.choices?.[0]?.message?.content ?? "";

  // Parse the JSON response
  let llmPlaces: LLMPlace[];
  try {
    // Strip any accidental markdown fences
    const clean = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    llmPlaces = JSON.parse(clean);
    if (!Array.isArray(llmPlaces)) throw new Error("Not an array");
  } catch (err) {
    console.error("Failed to parse LLM response:", rawText.slice(0, 500));
    throw new Error(`LLM returned invalid JSON: ${err}`);
  }

  console.log(`  Extracted ${llmPlaces.length} places`);

  // Convert to Place objects
  const places: Place[] = llmPlaces
    .filter((p) => p.name && p.citySlug && CITY_COORDINATES[p.citySlug.toLowerCase()])
    .map((p) => {
      const citySlug = p.citySlug.toLowerCase();
      const cityInfo = CITY_COORDINATES[citySlug]!;
      const slug = slugify(`${p.name}-${citySlug}`);
      const id = `${slug}-${video.id.slice(0, 6)}`;

      return {
        id,
        name: p.name,
        slug,
        city: p.city || (citySlug.charAt(0).toUpperCase() + citySlug.slice(1)),
        citySlug,
        address: p.address || "",
        cuisine: Array.isArray(p.cuisine) ? p.cuisine.slice(0, 3) : ["Street Food"],
        coordinates: null, // filled by geocoder
        dishes: Array.isArray(p.dishes) ? p.dishes.slice(0, 6) : [],
        priceRange: p.priceRange || "₹",
        sourceVideoId: video.id,
        sourceVideoTitle: video.title,
        description: p.description || "",
      };
    });

  return places;
}
