/**
 * YouTube transcript/CC fetcher using yt-dlp.
 *
 * Primary: yt-dlp auto-generated captions.
 * Fallback: download audio + OpenAI Whisper transcription/translation.
 * Uses cookies.txt if present; otherwise runs without auth (works for public videos).
 *
 * Requires: pip3 install yt-dlp  (already installed)
 */

import { execSync } from "child_process";
import { mkdirSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync, createReadStream } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import type { TranscriptData, TranscriptError, TranscriptSegment } from "./types.js";
import { TRANSCRIPTS_DIR, TRANSCRIPT_FETCH_DELAY } from "./config.js";
import { getLogger, sleep, nowIso, saveJson, loadJson } from "./utils.js";

dotenvConfig({ path: resolve(process.cwd(), ".env.local") });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COOKIES_FILE = join(process.cwd(), "cookies.txt");

/**
 * Return the yt-dlp cookie flag.
 * Uses cookies.txt if available; otherwise runs without cookies (public videos don't need auth).
 */
function cookieFlag(): string {
  if (existsSync(COOKIES_FILE)) {
    return `--cookies "${COOKIES_FILE}"`;
  }
  return "";
}

// Language priority: prefer Hindi (channel language), then English variants
const LANG_PRIORITY = ["hi", "en", "en-IN", "en-GB", "en-US"];

const LANG_NAMES: Record<string, string> = {
  hi: "Hindi",
  en: "English",
  "en-IN": "English (India)",
  "en-GB": "English (UK)",
  "en-US": "English (US)",
};

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Array<{ utf8: string }>;
}

interface Json3Data {
  events?: Json3Event[];
}

/**
 * Parse a yt-dlp JSON3 subtitle file into segments + full text.
 */
function parseJson3(filePath: string): { segments: TranscriptSegment[]; fullText: string } {
  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as Json3Data;
  const events = data.events ?? [];

  const segments: TranscriptSegment[] = events
    .filter((e) => e.segs && e.segs.length > 0)
    .map((e) => ({
      text: e.segs!.map((s) => s.utf8).join("").replace(/\n/g, " ").trim(),
      start: (e.tStartMs ?? 0) / 1000,
      duration: (e.dDurationMs ?? 0) / 1000,
    }))
    .filter((s) => s.text.length > 0);

  const fullText = segments.map((s) => s.text).join(" ");
  return { segments, fullText };
}

/**
 * Detect the language of a downloaded subtitle file from its filename.
 * yt-dlp names files: VIDEO_ID.LANG.json3
 */
function detectLang(filename: string, videoId: string): string {
  const prefix = `${videoId}.`;
  const suffix = ".json3";
  if (filename.startsWith(prefix) && filename.endsWith(suffix)) {
    return filename.slice(prefix.length, -suffix.length);
  }
  return "unknown";
}

/**
 * Download audio and transcribe via OpenAI Whisper (translate to English).
 * Used when no CC is available.
 */
async function fetchTranscriptViaWhisper(
  videoId: string,
  videoTitle: string
): Promise<TranscriptData | TranscriptError> {
  const log = getLogger();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { videoId, videoTitle, error: "OPENAI_API_KEY not set — cannot use Whisper fallback", fetchedAt: nowIso() };
  }

  const tmpDir = join(tmpdir(), `yt-audio-${videoId}`);
  mkdirSync(tmpDir, { recursive: true });
  const audioPath = join(tmpDir, `${videoId}.mp3`);

  try {
    log.info(`Downloading audio for Whisper: ${videoId}`);
    const dlCmd = [
      "python3 -m yt_dlp",
      cookieFlag(),
      "--extract-audio",
      "--audio-format mp3",
      "--audio-quality 4",   // ~65kbps — small file, sufficient for speech
      // Prefer non-SABR audio-only formats; fall back to worst video+audio mux
      "--format", '"18/bestaudio/best"',  // format 18 = legacy mp4, always available
      "--audio-quality 9",               // lowest bitrate (~45kbps) — keeps file small
      "--postprocessor-args", '"ffmpeg:-ar 16000 -ac 1"',  // 16kHz mono, ~2MB/min
      "--no-playlist",
      "--no-warnings",
      "--quiet",
      `-o "${audioPath}"`,
      `"https://www.youtube.com/watch?v=${videoId}"`,
    ].filter(Boolean).join(" ");

    execSync(dlCmd, { stdio: "pipe", timeout: 120_000 });

    if (!existsSync(audioPath)) {
      return { videoId, videoTitle, error: "audio_download_failed", fetchedAt: nowIso() };
    }

    log.info(`Sending audio to Whisper (translate to English)...`);

    const formData = new FormData();
    const audioBlob = new Blob([readFileSync(audioPath)], { type: "audio/mpeg" });
    formData.append("file", audioBlob, `${videoId}.mp3`);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");

    const res = await fetch("https://api.openai.com/v1/audio/translations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      return { videoId, videoTitle, error: `whisper_api_error: ${err.slice(0, 200)}`, fetchedAt: nowIso() };
    }

    const data = await res.json() as { text: string; segments?: Array<{ start: number; end: number; text: string }> };
    const fullText = data.text?.trim() ?? "";

    if (!fullText) {
      return { videoId, videoTitle, error: "whisper_empty_result", fetchedAt: nowIso() };
    }

    const segments: TranscriptSegment[] = (data.segments ?? []).map((s) => ({
      text: s.text.trim(),
      start: s.start,
      duration: s.end - s.start,
    }));

    log.info(`Whisper transcription: ${fullText.length} chars`);

    return {
      videoId,
      videoTitle,
      language: "en",
      languageName: "English (Whisper translation)",
      isAutoGenerated: false,
      fetchedAt: nowIso(),
      segments,
      fullText,
    };
  } catch (error: unknown) {
    const err = error as { message?: string; stderr?: Buffer };
    const msg = err.stderr?.toString() || err.message || "unknown_error";
    log.warn(`Whisper fallback failed for ${videoId}: ${msg.slice(0, 120)}`);
    return { videoId, videoTitle, error: msg.slice(0, 200), fetchedAt: nowIso() };
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Fetch CC/transcript for one video using yt-dlp.
 */
export async function fetchTranscript(
  videoId: string,
  videoTitle: string
): Promise<TranscriptData | TranscriptError> {
  const log = getLogger();

  const tmpDir = join(tmpdir(), `yt-cc-${videoId}`);
  mkdirSync(tmpDir, { recursive: true });

  try {
    const subLangs = LANG_PRIORITY.join(",");
    const cmd = [
      "python3 -m yt_dlp",
      cookieFlag(),
      "--skip-download",
      "--write-auto-subs",
      "--write-subs",
      `--sub-langs "${subLangs}"`,
      "--sub-format json3",
      "--no-warnings",
      "--quiet",
      `-o "${tmpDir}/%(id)s"`,
      `"https://www.youtube.com/watch?v=${videoId}"`,
    ].join(" ");

    execSync(cmd, { stdio: "pipe", timeout: 60_000 });

    // Find downloaded subtitle files
    const files = readdirSync(tmpDir).filter((f) => f.endsWith(".json3"));

    if (files.length === 0) {
      log.warn(`No CC found for ${videoId} — trying Whisper fallback`);
      return fetchTranscriptViaWhisper(videoId, videoTitle);
    }

    // Pick best language in priority order
    let bestFile: string | null = null;
    let bestLang = "unknown";

    for (const lang of LANG_PRIORITY) {
      const match = files.find((f) => {
        const detected = detectLang(f, videoId);
        return detected === lang || detected === `${lang}-orig`;
      });
      if (match) {
        bestFile = join(tmpDir, match);
        bestLang = lang;
        break;
      }
    }

    // Fallback: just take the first file
    if (!bestFile) {
      bestFile = join(tmpDir, files[0]);
      bestLang = detectLang(files[0], videoId);
    }

    const { segments, fullText } = parseJson3(bestFile);

    if (fullText.trim().length === 0) {
      return { videoId, videoTitle, error: "empty_transcript", fetchedAt: nowIso() };
    }

    log.info(`CC fetched for ${videoId} (${bestLang}, ${segments.length} segments, ${fullText.length} chars)`);

    return {
      videoId,
      videoTitle,
      language: bestLang,
      languageName: LANG_NAMES[bestLang] ?? bestLang,
      isAutoGenerated: true,
      fetchedAt: nowIso(),
      segments,
      fullText,
    };
  } catch (error: unknown) {
    const err = error as { message?: string; stderr?: Buffer };
    const msg = err.stderr?.toString() || err.message || "unknown_error";
    log.warn(`yt-dlp failed for ${videoId}: ${msg.slice(0, 120)}`);
    return { videoId, videoTitle, error: msg.slice(0, 200), fetchedAt: nowIso() };
  } finally {
    // Clean up temp files
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// ── Rest of the file unchanged ─────────────────────────────────────────────

export function getTranscriptPath(videoId: string): string {
  return join(TRANSCRIPTS_DIR, `${videoId}.json`);
}

export function transcriptExists(videoId: string): boolean {
  const path = getTranscriptPath(videoId);
  const data = loadJson<TranscriptData | TranscriptError>(path);
  return data !== null;
}

export function saveTranscript(data: TranscriptData | TranscriptError): void {
  saveJson(getTranscriptPath(data.videoId), data);
}

export function loadTranscript(videoId: string): TranscriptData | TranscriptError | null {
  return loadJson<TranscriptData | TranscriptError>(getTranscriptPath(videoId));
}

export function isTranscriptError(
  data: TranscriptData | TranscriptError
): data is TranscriptError {
  return "error" in data;
}

export async function fetchTranscripts(
  videos: Array<{ id: string; title: string }>,
  skipExisting: boolean = true,
  onProgress?: (completed: number, total: number, videoId: string, success: boolean) => void
): Promise<{ success: string[]; failed: string[] }> {
  const log = getLogger();
  const success: string[] = [];
  const failed: string[] = [];

  log.info(`Fetching CC for ${videos.length} videos via yt-dlp`);

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];

    if (skipExisting && transcriptExists(video.id)) {
      log.debug(`Skipping existing: ${video.id}`);
      const existing = loadTranscript(video.id);
      const ok = !isTranscriptError(existing!);
      (ok ? success : failed).push(video.id);
      onProgress?.(i + 1, videos.length, video.id, ok);
      continue;
    }

    const result = await fetchTranscript(video.id, video.title);
    saveTranscript(result);

    const ok = !isTranscriptError(result);
    (ok ? success : failed).push(video.id);
    onProgress?.(i + 1, videos.length, video.id, ok);

    if (i < videos.length - 1) {
      await sleep(TRANSCRIPT_FETCH_DELAY);
    }
  }

  log.info(`CC complete: ${success.length} ok, ${failed.length} failed`);
  return { success, failed };
}
