/**
 * Main scraper orchestration for Street Food Map pipeline.
 */

import type {
  ChannelInfo,
  PlaylistInfo,
  PlaylistsData,
  VideoInfo,
  VideosData,
  Progress,
  ScraperOptions,
} from "./types.js";
import { PLAYLISTS_FILE, VIDEOS_FILE } from "./config.js";
import {
  getLogger,
  loadJson,
  saveJson,
  loadProgress,
  saveProgress,
  nowIso,
  printSummary,
} from "./utils.js";
import { YouTubeClient, QuotaExceededError } from "./youtubeClient.js";
import { fetchTranscripts } from "./transcriptFetcher.js";

export class Scraper {
  private client: YouTubeClient;
  private progress: Progress;
  private options: ScraperOptions;
  private startTime: number = 0;

  constructor(options: ScraperOptions) {
    this.options = options;
    this.client = new YouTubeClient();
    this.progress = loadProgress();
  }

  /**
   * Run the full scraping pipeline.
   */
  async run(): Promise<void> {
    const log = getLogger();
    this.startTime = Date.now();

    try {
      log.info(`Starting scrape for channel: ${this.options.channel}`);

      if (this.options.dryRun) {
        log.info("DRY RUN MODE - No API calls will be made");
        await this.dryRun();
        return;
      }

      // Resolve channel
      const channel = await this.resolveChannel();
      if (!channel) {
        log.error(`Could not find channel: ${this.options.channel}`);
        return;
      }

      // Run specific step or full pipeline
      if (this.options.step) {
        await this.runStep(this.options.step, channel);
      } else {
        await this.runFullPipeline(channel);
      }
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        log.error(error.message);
        log.info("Progress has been saved. Run with --resume tomorrow to continue.");
      } else {
        throw error;
      }
    } finally {
      // Update quota tracking
      this.progress.quotaUsed += this.client.quotaUsed;
      saveProgress(this.progress);
    }
  }

  /**
   * Dry run - show what would be fetched without making API calls.
   */
  private async dryRun(): Promise<void> {
    const log = getLogger();

    log.info("Would perform the following operations:");
    log.info(`1. Resolve channel handle: ${this.options.channel}`);
    log.info("2. Fetch all playlists from channel");
    log.info("3. Fetch all videos from each playlist");
    log.info("4. Enrich videos with full metadata");
    log.info("5. Fetch transcripts for all videos");

    // Check existing data
    const existingPlaylists = loadJson<PlaylistsData>(PLAYLISTS_FILE);
    const existingVideos = loadJson<VideosData>(VIDEOS_FILE);

    if (existingPlaylists) {
      log.info(`Found existing playlists.json with ${existingPlaylists.playlists.length} playlists`);
    }

    if (existingVideos) {
      log.info(`Found existing videos.json with ${existingVideos.videos.length} videos`);
    }

    log.info(`Transcripts completed: ${this.progress.transcriptsCompleted.length}`);
    log.info(`Transcripts failed: ${this.progress.transcriptsFailed.length}`);
  }

  /**
   * Resolve channel handle to channel info.
   */
  private async resolveChannel(): Promise<ChannelInfo | null> {
    const log = getLogger();

    // Check if we're resuming with the same channel
    if (
      this.options.resume &&
      this.progress.channelHandle === this.options.channel &&
      this.progress.channelId
    ) {
      log.info(`Resuming with cached channel ID: ${this.progress.channelId}`);
      return this.client.getChannelDetails(this.progress.channelId);
    }

    const channel = await this.client.resolveChannelHandle(this.options.channel);

    if (channel) {
      this.progress.channelHandle = this.options.channel;
      this.progress.channelId = channel.id;
      saveProgress(this.progress);
    }

    return channel;
  }

  /**
   * Run a specific step of the pipeline.
   */
  private async runStep(
    step: "playlists" | "videos" | "transcripts",
    channel: ChannelInfo
  ): Promise<void> {
    const log = getLogger();

    switch (step) {
      case "playlists":
        await this.fetchPlaylists(channel);
        break;

      case "videos":
        await this.fetchVideos(channel);
        break;

      case "transcripts":
        await this.fetchAllTranscripts();
        break;

      default:
        log.error(`Unknown step: ${step}`);
    }
  }

  /**
   * Run the full pipeline.
   */
  private async runFullPipeline(channel: ChannelInfo): Promise<void> {
    const log = getLogger();

    // Step 1: Fetch playlists
    if (!this.options.resume || !this.progress.playlistsFetched) {
      await this.fetchPlaylists(channel);
    } else {
      log.info("Skipping playlists (already fetched)");
    }

    // Step 2: Fetch videos
    if (!this.options.resume || !this.progress.videosFetched) {
      await this.fetchVideos(channel);
    } else {
      log.info("Skipping videos (already fetched)");
    }

    // Step 3: Fetch transcripts
    await this.fetchAllTranscripts();

    // Print summary
    const playlistsData = loadJson<PlaylistsData>(PLAYLISTS_FILE);
    const videosData = loadJson<VideosData>(VIDEOS_FILE);

    printSummary(
      playlistsData?.playlists.length || 0,
      videosData?.videos.length || 0,
      this.progress.transcriptsCompleted.length,
      this.progress.transcriptsFailed.length,
      (Date.now() - this.startTime) / 1000,
      this.progress.quotaUsed + this.client.quotaUsed
    );
  }

  /**
   * Fetch all playlists for the channel.
   */
  private async fetchPlaylists(channel: ChannelInfo): Promise<void> {
    const log = getLogger();
    log.info("Fetching playlists...");

    const playlists: PlaylistInfo[] = [];

    for await (const playlist of this.client.getChannelPlaylists(channel.id)) {
      playlists.push(playlist);
    }

    // Also add the uploads playlist (contains all videos)
    if (channel.uploadsPlaylistId) {
      const uploadsPlaylist: PlaylistInfo = {
        id: channel.uploadsPlaylistId,
        title: "Uploads",
        description: "All uploaded videos",
        videoCount: parseInt(channel.videoCount || "0", 10),
        publishedAt: channel.publishedAt,
      };

      // Add if not already in list
      if (!playlists.find((p) => p.id === uploadsPlaylist.id)) {
        playlists.unshift(uploadsPlaylist);
      }
    }

    const playlistsData: PlaylistsData = {
      channelId: channel.id,
      channelHandle: this.options.channel,
      channelTitle: channel.title,
      fetchedAt: nowIso(),
      playlists,
    };

    saveJson(PLAYLISTS_FILE, playlistsData);
    this.progress.playlistsFetched = true;
    saveProgress(this.progress);

    log.info(`Saved ${playlists.length} playlists to playlists.json`);
  }

  /**
   * Fetch all videos from playlists.
   */
  private async fetchVideos(channel: ChannelInfo): Promise<void> {
    const log = getLogger();
    log.info("Fetching videos...");

    // Load playlists
    const playlistsData = loadJson<PlaylistsData>(PLAYLISTS_FILE);
    if (!playlistsData) {
      log.error("No playlists.json found. Run --step playlists first.");
      return;
    }

    // Use a map to deduplicate videos
    const videoMap = new Map<string, VideoInfo>();

    // Prefer to use the uploads playlist for completeness
    const uploadsPlaylist = playlistsData.playlists.find(
      (p) => p.id === channel.uploadsPlaylistId
    );

    const playlistsToProcess = uploadsPlaylist
      ? [uploadsPlaylist]
      : playlistsData.playlists;

    for (const playlist of playlistsToProcess) {
      log.info(`Processing playlist: ${playlist.title} (${playlist.videoCount} videos)`);

      for await (const video of this.client.getPlaylistVideos(playlist.id, this.options.limit)) {
        const existing = videoMap.get(video.id);

        if (existing) {
          // Add playlist association
          existing.playlists = existing.playlists || [];
          existing.playlists.push({ id: playlist.id, title: playlist.title });
        } else {
          video.playlists = [{ id: playlist.id, title: playlist.title }];
          videoMap.set(video.id, video);
        }
      }
    }

    log.info(`Found ${videoMap.size} unique videos`);

    // Enrich with full metadata
    let videos = Array.from(videoMap.values());
    videos = await this.client.enrichVideos(videos);

    const videosData: VideosData = {
      fetchedAt: nowIso(),
      totalVideos: videos.length,
      videos,
    };

    saveJson(VIDEOS_FILE, videosData);
    this.progress.videosFetched = true;
    saveProgress(this.progress);

    log.info(`Saved ${videos.length} videos to videos.json`);
  }

  /**
   * Fetch transcripts for all videos.
   */
  private async fetchAllTranscripts(): Promise<void> {
    const log = getLogger();
    log.info("Fetching transcripts...");

    // Load videos
    const videosData = loadJson<VideosData>(VIDEOS_FILE);
    if (!videosData) {
      log.error("No videos.json found. Run --step videos first.");
      return;
    }

    const videosToProcess = videosData.videos.map((v) => ({
      id: v.id,
      title: v.title,
    }));

    // Filter out already completed if resuming
    const skipExisting = this.options.resume;

    const { success, failed } = await fetchTranscripts(
      videosToProcess,
      skipExisting,
      (completed, total, videoId, isSuccess) => {
        // Update progress after each transcript
        if (isSuccess) {
          if (!this.progress.transcriptsCompleted.includes(videoId)) {
            this.progress.transcriptsCompleted.push(videoId);
          }
        } else {
          if (!this.progress.transcriptsFailed.includes(videoId)) {
            this.progress.transcriptsFailed.push(videoId);
          }
        }

        // Save progress periodically
        if (completed % 10 === 0) {
          saveProgress(this.progress);
        }

        log.info(`Transcript progress: ${completed}/${total}`);
      }
    );

    // Final progress save
    this.progress.transcriptsCompleted = success;
    this.progress.transcriptsFailed = failed;
    saveProgress(this.progress);
  }
}
