/**
 * OpenAI-powered transcript summarizer for generating place descriptions.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini"; // Cost-effective model for summarization

// Rate limiting
const SUMMARIZE_DELAY_MS = 500; // 2 requests per second

// Paths
const PROJECT_ROOT = join(__dirname, "../..");
const TRANSCRIPTS_DIR = join(PROJECT_ROOT, "data/raw/transcripts");

interface TranscriptData {
  videoId: string;
  videoTitle: string;
  language: string;
  fullText: string;
}

interface TranscriptError {
  videoId: string;
  error: string;
}

interface OpenAIResponse {
  choices?: Array<{
    message: {
      content: string;
    };
  }>;
  error?: {
    message: string;
  };
}

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load transcript for a video.
 */
export function loadTranscript(videoId: string): TranscriptData | null {
  const filepath = join(TRANSCRIPTS_DIR, `${videoId}.json`);

  if (!existsSync(filepath)) {
    return null;
  }

  try {
    const content = readFileSync(filepath, "utf-8");
    const data = JSON.parse(content);

    // Check if it's an error file
    if (data.error) {
      return null;
    }

    return data as TranscriptData;
  } catch {
    return null;
  }
}

/**
 * Check if transcripts directory exists and has files.
 */
export function hasTranscripts(): boolean {
  return existsSync(TRANSCRIPTS_DIR);
}

/**
 * Summarize a transcript using OpenAI.
 */
async function summarizeWithOpenAI(
  transcript: string,
  videoTitle: string,
  placeName: string,
  city: string
): Promise<string | null> {
  if (!OPENAI_API_KEY) {
    return null;
  }

  // Truncate transcript if too long (keep ~4000 chars for context)
  const maxLength = 4000;
  const truncatedTranscript = transcript.length > maxLength
    ? transcript.slice(0, maxLength) + "..."
    : transcript;

  const systemPrompt = `You are a food critic writing concise, engaging descriptions for a street food guide website.
Write in a warm, inviting tone that makes readers want to visit the place.
Focus on: the food specialties, what makes this place unique, the atmosphere, and any notable history.
Do NOT mention YouTube, videos, vloggers, or any video-related content.
Keep the description to 2-3 sentences (50-80 words).`;

  const userPrompt = `Based on this food review transcript, write a brief description for "${placeName}" in ${city}:

Video Title: ${videoTitle}

Transcript:
${truncatedTranscript}

Write a concise, engaging description (2-3 sentences) highlighting what makes this place special.`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    });

    const data = (await response.json()) as OpenAIResponse;

    if (data.error) {
      console.error(`OpenAI error: ${data.error.message}`);
      return null;
    }

    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content.trim();
    }

    return null;
  } catch (error) {
    console.error("OpenAI API call failed:", error);
    return null;
  }
}

/**
 * Generate a fallback description from video title.
 */
function generateFallbackDescription(
  videoTitle: string,
  placeName: string,
  city: string,
  dishes: string[]
): string {
  const dishText = dishes.length > 0
    ? `Known for their ${dishes.slice(0, 2).join(" and ")}.`
    : "";

  return `A popular street food destination in ${city}. ${dishText} Visit to experience authentic local flavors.`.trim();
}

/**
 * Summarize transcripts for places and generate descriptions.
 */
export async function summarizeTranscripts(
  places: Array<{
    id: string;
    name: string;
    city: string;
    dishes: string[];
    sourceVideoId: string;
    sourceVideoTitle: string;
    description?: string;
  }>,
  options: {
    forceRefresh?: boolean;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<Map<string, string>> {
  const { forceRefresh = false, onProgress } = options;
  const descriptions = new Map<string, string>();

  if (!OPENAI_API_KEY) {
    console.log("OPENAI_API_KEY not set. Using fallback descriptions.\n");

    for (const place of places) {
      const fallback = generateFallbackDescription(
        place.sourceVideoTitle,
        place.name,
        place.city,
        place.dishes
      );
      descriptions.set(place.id, fallback);
    }

    return descriptions;
  }

  console.log(`Summarizing transcripts for ${places.length} places using OpenAI...\n`);

  let summarized = 0;
  let fallbacks = 0;
  let skipped = 0;

  for (let i = 0; i < places.length; i++) {
    const place = places[i];

    // Skip if already has description and not forcing refresh
    if (place.description && !forceRefresh) {
      descriptions.set(place.id, place.description);
      skipped++;
      continue;
    }

    // Load transcript
    const transcript = loadTranscript(place.sourceVideoId);

    if (transcript && transcript.fullText) {
      // Summarize with OpenAI
      const summary = await summarizeWithOpenAI(
        transcript.fullText,
        place.sourceVideoTitle,
        place.name,
        place.city
      );

      if (summary) {
        descriptions.set(place.id, summary);
        summarized++;
        console.log(`[${i + 1}/${places.length}] Summarized: ${place.name}`);
      } else {
        // Fallback if OpenAI fails
        const fallback = generateFallbackDescription(
          place.sourceVideoTitle,
          place.name,
          place.city,
          place.dishes
        );
        descriptions.set(place.id, fallback);
        fallbacks++;
        console.log(`[${i + 1}/${places.length}] Fallback: ${place.name}`);
      }

      // Rate limiting
      await sleep(SUMMARIZE_DELAY_MS);
    } else {
      // No transcript available
      const fallback = generateFallbackDescription(
        place.sourceVideoTitle,
        place.name,
        place.city,
        place.dishes
      );
      descriptions.set(place.id, fallback);
      fallbacks++;
      console.log(`[${i + 1}/${places.length}] No transcript: ${place.name}`);
    }

    if (onProgress) {
      onProgress(i + 1, places.length);
    }
  }

  console.log(`\nSummary: ${summarized} summarized, ${fallbacks} fallbacks, ${skipped} skipped`);

  return descriptions;
}

/**
 * Check if OpenAI is configured.
 */
export function isOpenAIConfigured(): boolean {
  return !!OPENAI_API_KEY;
}
