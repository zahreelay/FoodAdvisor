/**
 * Supabase client and all social interaction functions (likes, bookmarks).
 *
 * Identity strategy:
 *  - Logged-in users   → identified by their Supabase user UUID
 *  - Guest users       → identified by a random UUID stored in localStorage
 *
 * Both values are stored in the same `device_id` column so no schema change
 * is needed. On first login, syncGuestToUser() migrates guest rows.
 */

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

const DEVICE_KEY = "streetfood_device_id";

/** Stable guest ID, generated once and persisted in localStorage. */
export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

/**
 * Returns the authenticated user's ID when signed in, falling back to the
 * guest device ID. Use this everywhere instead of getDeviceId() directly.
 */
export async function getEffectiveId(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? getDeviceId();
}

/**
 * After a user signs in for the first time on this device, copy any likes /
 * bookmarks recorded under their guest device ID over to their user ID.
 * The guest rows are left in place (they don't affect counts).
 */
export async function syncGuestToUser(
  guestId: string,
  userId: string
): Promise<void> {
  if (guestId === userId) return;

  const [{ data: guestLikes }, { data: guestBookmarks }] = await Promise.all([
    supabase.from("likes").select("place_id").eq("device_id", guestId),
    supabase.from("bookmarks").select("place_id").eq("device_id", guestId),
  ]);

  if (guestLikes && guestLikes.length > 0) {
    await supabase
      .from("likes")
      .upsert(
        guestLikes.map((r) => ({ place_id: r.place_id, device_id: userId })),
        { onConflict: "place_id,device_id", ignoreDuplicates: true }
      );
  }

  if (guestBookmarks && guestBookmarks.length > 0) {
    await supabase
      .from("bookmarks")
      .upsert(
        guestBookmarks.map((r) => ({
          place_id: r.place_id,
          device_id: userId,
        })),
        { onConflict: "place_id,device_id", ignoreDuplicates: true }
      );
  }
}

// ===== Likes =====

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

export async function fetchPlaceSocial(placeId: string): Promise<{
  likeCount: number;
  bookmarkCount: number;
  liked: boolean;
  bookmarked: boolean;
}> {
  const effectiveId = await getEffectiveId();

  const [likesRes, bookmarksRes] = await Promise.all([
    supabase.from("likes").select("device_id").eq("place_id", placeId),
    supabase.from("bookmarks").select("device_id").eq("place_id", placeId),
  ]);

  const likes = likesRes.data ?? [];
  const bookmarks = bookmarksRes.data ?? [];
  return {
    likeCount: likes.length,
    bookmarkCount: bookmarks.length,
    liked: likes.some((r) => r.device_id === effectiveId),
    bookmarked: bookmarks.some((r) => r.device_id === effectiveId),
  };
}

export async function toggleLike(
  placeId: string,
  currentlyLiked: boolean
): Promise<{ count: number; liked: boolean }> {
  const effectiveId = await getEffectiveId();

  if (currentlyLiked) {
    await supabase
      .from("likes")
      .delete()
      .eq("place_id", placeId)
      .eq("device_id", effectiveId);
  } else {
    await supabase
      .from("likes")
      .upsert(
        { place_id: placeId, device_id: effectiveId },
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

export async function toggleBookmark(
  placeId: string,
  currentlyBookmarked: boolean
): Promise<{ count: number; bookmarked: boolean }> {
  const effectiveId = await getEffectiveId();

  if (currentlyBookmarked) {
    await supabase
      .from("bookmarks")
      .delete()
      .eq("place_id", placeId)
      .eq("device_id", effectiveId);
  } else {
    await supabase
      .from("bookmarks")
      .upsert(
        { place_id: placeId, device_id: effectiveId },
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

export async function getMyLikedIds(): Promise<string[]> {
  const effectiveId = await getEffectiveId();
  const { data } = await supabase
    .from("likes")
    .select("place_id")
    .eq("device_id", effectiveId);
  return data?.map((r) => r.place_id) ?? [];
}

export async function getMyBookmarkedIds(): Promise<string[]> {
  const effectiveId = await getEffectiveId();
  const { data } = await supabase
    .from("bookmarks")
    .select("place_id")
    .eq("device_id", effectiveId);
  return data?.map((r) => r.place_id) ?? [];
}
