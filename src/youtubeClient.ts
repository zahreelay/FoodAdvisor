/**
 * YouTube Data API client wrapper with rate limiting and error handling.
 */

import { google, youtube_v3 } from "googleapis";
import type { ChannelInfo, PlaylistInfo, VideoInfo } from "./types.js";
import {
  YOUTUBE_API_KEY,
  YOUTUBE_API_DELAY,
  MAX_RETRIES,
  INITIAL_BACKOFF,
  MAX_BACKOFF,
  PLAYLISTS_PER_PAGE,
  VIDEOS_PER_PAGE,
  QUOTA_COSTS,
  DAILY_QUOTA_LIMIT,
  validateConfig,
} from "./config.js";
import { getLogger, sleep } from "./utils.js";

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export class YouTubeClient {
  private youtube: youtube_v3.Youtube;
  public quotaUsed: number = 0;

  constructor() {
    validateConfig();
    this.youtube = google.youtube({
      version: "v3",
      auth: YOUTUBE_API_KEY,
    });
  }

  private trackQuota(operation: string): void {
    const cost = QUOTA_COSTS[operation] || 1;
    this.quotaUsed += cost;

    const log = getLogger();

    if (this.quotaUsed >= DAILY_QUOTA_LIMIT * 0.9) {
      log.warn(`Approaching quota limit: ${this.quotaUsed}/${DAILY_QUOTA_LIMIT}`);
    }

    if (this.quotaUsed >= DAILY_QUOTA_LIMIT) {
      throw new QuotaExceededError(
        `Daily quota limit (${DAILY_QUOTA_LIMIT}) exceeded. Please try again tomorrow.`
      );
    }
  }

  private async rateLimit(): Promise<void> {
    await sleep(YOUTUBE_API_DELAY);
  }

  private async executeWithRetry<T>(
    operation: string,
    request: () => Promise<T>
  ): Promise<T> {
    const log = getLogger();
    let backoff = INITIAL_BACKOFF;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await this.rateLimit();
        this.trackQuota(operation);
        return await request();
      } catch (error: unknown) {
        const err = error as { code?: number; message?: string; errors?: Array<{ reason?: string }> };

        // Check for quota exceeded
        if (err.code === 403) {
          const isQuotaError = err.errors?.some(
            (e) => e.reason === "quotaExceeded" || e.reason === "dailyLimitExceeded"
          );
          if (isQuotaError) {
            throw new QuotaExceededError(
              "Daily quota limit exceeded. Please try again tomorrow."
            );
          }
        }

        // Rate limited - exponential backoff
        if (err.code === 429) {
          log.warn(`Rate limited, backing off ${backoff}ms (attempt ${attempt + 1})`);
          await sleep(backoff);
          backoff = Math.min(backoff * 2, MAX_BACKOFF);
          continue;
        }

        // Server errors - retry
        if (err.code && err.code >= 500 && err.code < 600) {
          log.warn(`Server error ${err.code}, retrying (attempt ${attempt + 1})`);
          await sleep(backoff);
          backoff = Math.min(backoff * 2, MAX_BACKOFF);
          continue;
        }

        // Network errors - retry
        if (err.message && (err.message.includes("ECONNRESET") || err.message.includes("ETIMEDOUT"))) {
          log.warn(`Network error, retrying (attempt ${attempt + 1})`);
          await sleep(backoff);
          backoff = Math.min(backoff * 2, MAX_BACKOFF);
          continue;
        }

        // Other errors - don't retry
        throw error;
      }
    }

    throw new Error(`Max retries (${MAX_RETRIES}) exceeded`);
  }

  /**
   * Resolve a YouTube channel handle to channel info.
   */
  async resolveChannelHandle(handle: string): Promise<ChannelInfo | null> {
    const log = getLogger();

    // Normalize handle
    if (handle.startsWith("@")) {
      handle = handle.slice(1);
    }

    log.info(`Resolving channel handle: @${handle}`);

    // Use search API to find channel
    const response = await this.executeWithRetry("search.list", () =>
      this.youtube.search.list({
        part: ["snippet"],
        q: `@${handle}`,
        type: ["channel"],
        maxResults: 5,
      })
    );

    const items = response.data.items || [];

    // Find exact match - search result snippets don't have customUrl, need to check channel details
    for (const item of items) {
      const channelId = item.snippet?.channelId;
      if (channelId) {
        // Get channel details to check customUrl
        const channelDetails = await this.getChannelDetails(channelId);
        const channelHandle = channelDetails.customUrl || "";

        // Check for handle match (case-insensitive)
        if (channelHandle && channelHandle.toLowerCase().replace("@", "") === handle.toLowerCase()) {
          return channelDetails;
        }
      }
    }

    // If no exact match found, try the first result
    if (items.length > 0) {
      log.warn("No exact handle match found, using first search result");
      const channelId = items[0].snippet?.channelId;
      if (channelId) {
        return this.getChannelDetails(channelId);
      }
    }

    log.error(`Channel not found: @${handle}`);
    return null;
  }

  /**
   * Get detailed channel information.
   */
  async getChannelDetails(channelId: string): Promise<ChannelInfo> {
    const response = await this.executeWithRetry("channels.list", () =>
      this.youtube.channels.list({
        part: ["snippet", "statistics", "contentDetails"],
        id: [channelId],
      })
    );

    const items = response.data.items || [];
    if (items.length === 0) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    const item = items[0];
    const snippet = item.snippet || {};
    const stats = item.statistics || {};
    const content = item.contentDetails || {};

    return {
      id: channelId,
      title: snippet.title || "",
      description: snippet.description || "",
      customUrl: snippet.customUrl ?? undefined,
      publishedAt: snippet.publishedAt || "",
      thumbnailUrl: snippet.thumbnails?.high?.url ?? undefined,
      subscriberCount: stats.subscriberCount ?? undefined,
      videoCount: stats.videoCount ?? undefined,
      viewCount: stats.viewCount ?? undefined,
      uploadsPlaylistId: content.relatedPlaylists?.uploads ?? undefined,
    };
  }

  /**
   * Fetch all playlists for a channel.
   */
  async *getChannelPlaylists(channelId: string): AsyncGenerator<PlaylistInfo> {
    const log = getLogger();
    log.info(`Fetching playlists for channel: ${channelId}`);

    let pageToken: string | undefined;
    let total = 0;

    do {
      const response = await this.executeWithRetry("playlists.list", () =>
        this.youtube.playlists.list({
          part: ["snippet", "contentDetails"],
          channelId: channelId,
          maxResults: PLAYLISTS_PER_PAGE,
          pageToken: pageToken,
        })
      );

      const items = response.data.items || [];

      for (const item of items) {
        const snippet = item.snippet || {};
        const content = item.contentDetails || {};

        total++;
        yield {
          id: item.id || "",
          title: snippet.title || "",
          description: snippet.description || "",
          videoCount: content.itemCount || 0,
          publishedAt: snippet.publishedAt || "",
          thumbnailUrl: snippet.thumbnails?.high?.url ?? undefined,
        };
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    log.info(`Found ${total} playlists`);
  }

  /**
   * Fetch all videos from a playlist.
   */
  async *getPlaylistVideos(playlistId: string): AsyncGenerator<VideoInfo> {
    const log = getLogger();
    let pageToken: string | undefined;

    do {
      let response;
      try {
        response = await this.executeWithRetry("playlistItems.list", () =>
          this.youtube.playlistItems.list({
            part: ["snippet", "contentDetails"],
            playlistId: playlistId,
            maxResults: VIDEOS_PER_PAGE,
            pageToken: pageToken,
          })
        );
      } catch (error: unknown) {
        const err = error as { code?: number };
        if (err.code === 404) {
          log.warn(`Playlist not found or private: ${playlistId}`);
          return;
        }
        throw error;
      }

      const items = response.data.items || [];

      for (const item of items) {
        const snippet = item.snippet || {};
        const content = item.contentDetails || {};

        // Skip deleted/private videos
        if (snippet.title === "Deleted video" || snippet.title === "Private video") {
          continue;
        }

        yield {
          id: content.videoId || "",
          title: snippet.title || "",
          description: snippet.description || "",
          publishedAt: snippet.publishedAt || "",
          thumbnailUrl: snippet.thumbnails?.high?.url ?? undefined,
          channelId: snippet.channelId ?? undefined,
          channelTitle: snippet.channelTitle ?? undefined,
        };
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  /**
   * Get detailed information for multiple videos.
   */
  async getVideoDetails(videoIds: string[]): Promise<VideoInfo[]> {
    if (videoIds.length === 0) {
      return [];
    }

    // API allows max 50 videos per request
    const batchIds = videoIds.slice(0, 50);

    const response = await this.executeWithRetry("videos.list", () =>
      this.youtube.videos.list({
        part: ["snippet", "contentDetails", "statistics"],
        id: batchIds,
      })
    );

    const items = response.data.items || [];
    const results: VideoInfo[] = [];

    for (const item of items) {
      const snippet = item.snippet || {};
      const content = item.contentDetails || {};
      const stats = item.statistics || {};

      results.push({
        id: item.id || "",
        title: snippet.title || "",
        description: snippet.description || "",
        publishedAt: snippet.publishedAt || "",
        thumbnailUrl: snippet.thumbnails?.high?.url ?? undefined,
        channelId: snippet.channelId ?? undefined,
        channelTitle: snippet.channelTitle ?? undefined,
        tags: snippet.tags || [],
        duration: content.duration ?? undefined,
        viewCount: stats.viewCount ?? undefined,
        likeCount: stats.likeCount ?? undefined,
        commentCount: stats.commentCount ?? undefined,
      });
    }

    return results;
  }

  /**
   * Enrich video list with full details from videos.list API.
   */
  async enrichVideos(videos: VideoInfo[]): Promise<VideoInfo[]> {
    const log = getLogger();
    log.info(`Enriching ${videos.length} videos with full metadata`);

    // Create lookup map
    const videoMap = new Map<string, VideoInfo>();
    for (const v of videos) {
      videoMap.set(v.id, v);
    }

    // Fetch in batches of 50
    const enriched: VideoInfo[] = [];
    const videoIds = Array.from(videoMap.keys());

    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const details = await this.getVideoDetails(batch);

      for (const detail of details) {
        const existing = videoMap.get(detail.id);
        // Merge with existing data (keep playlist associations)
        const merged: VideoInfo = { ...existing, ...detail };
        if (existing?.playlists) {
          merged.playlists = existing.playlists;
        }
        enriched.push(merged);
      }

      log.info(`Enriched ${Math.min(i + 50, videoIds.length)}/${videoIds.length} videos`);
    }

    return enriched;
  }
}
