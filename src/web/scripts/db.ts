/**
 * Supabase client and all social interaction functions (likes, bookmarks).
 * Device ID stored in localStorage identifies users without accounts.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

const DEVICE_KEY = "streetfood_device_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// ===== Likes =====

/**
 * Fetch like counts for multiple places in one query.
 */
export async function fetchLikeCounts(
  placeIds: string[]
): Promise<Record<string, number>> {
  if (placeIds.length === 0) return {};
  const { data } = await supabase
    .from("likes")
    .select("place_id")
    .in("place_id", placeIds);

  const counts: Record<string, number> = Object.fromEntries(
    placeIds.map((id) => [id, 0])
  );
  data?.forEach((r) => {
    counts[r.place_id] = (counts[r.place_id] ?? 0) + 1;
  });
  return counts;
}

/**
 * Fetch all social state for a single place page.
 */
export async function fetchPlaceSocial(placeId: string): Promise<{
  likeCount: number;
  bookmarkCount: number;
  liked: boolean;
  bookmarked: boolean;
}> {
  const deviceId = getDeviceId();
  const [likesRes, bookmarksRes] = await Promise.all([
    supabase.from("likes").select("device_id").eq("place_id", placeId),
    supabase.from("bookmarks").select("device_id").eq("place_id", placeId),
  ]);

  const likes = likesRes.data ?? [];
  const bookmarks = bookmarksRes.data ?? [];
  return {
    likeCount: likes.length,
    bookmarkCount: bookmarks.length,
    liked: likes.some((r) => r.device_id === deviceId),
    bookmarked: bookmarks.some((r) => r.device_id === deviceId),
  };
}

/**
 * Toggle like. Pass the current liked state so we know insert vs delete.
 */
export async function toggleLike(
  placeId: string,
  currentlyLiked: boolean
): Promise<{ count: number; liked: boolean }> {
  const deviceId = getDeviceId();

  if (currentlyLiked) {
    await supabase
      .from("likes")
      .delete()
      .eq("place_id", placeId)
      .eq("device_id", deviceId);
  } else {
    await supabase
      .from("likes")
      .upsert(
        { place_id: placeId, device_id: deviceId },
        { onConflict: "place_id,device_id", ignoreDuplicates: true }
      );
  }

  const { data } = await supabase
    .from("likes")
    .select("device_id")
    .eq("place_id", placeId);

  return { count: data?.length ?? 0, liked: !currentlyLiked };
}

// ===== Bookmarks =====

/**
 * Toggle bookmark. Pass the current bookmarked state.
 */
export async function toggleBookmark(
  placeId: string,
  currentlyBookmarked: boolean
): Promise<{ count: number; bookmarked: boolean }> {
  const deviceId = getDeviceId();

  if (currentlyBookmarked) {
    await supabase
      .from("bookmarks")
      .delete()
      .eq("place_id", placeId)
      .eq("device_id", deviceId);
  } else {
    await supabase
      .from("bookmarks")
      .upsert(
        { place_id: placeId, device_id: deviceId },
        { onConflict: "place_id,device_id", ignoreDuplicates: true }
      );
  }

  const { data } = await supabase
    .from("bookmarks")
    .select("device_id")
    .eq("place_id", placeId);

  return { count: data?.length ?? 0, bookmarked: !currentlyBookmarked };
}

// ===== Personal =====

/** All place IDs this device has liked. */
export async function getMyLikedIds(): Promise<string[]> {
  const { data } = await supabase
    .from("likes")
    .select("place_id")
    .eq("device_id", getDeviceId());
  return data?.map((r) => r.place_id) ?? [];
}

/** All place IDs this device has bookmarked. */
export async function getMyBookmarkedIds(): Promise<string[]> {
  const { data } = await supabase
    .from("bookmarks")
    .select("place_id")
    .eq("device_id", getDeviceId());
  return data?.map((r) => r.place_id) ?? [];
}
