/**
 * Personal page — liked and bookmarked places, backed by Supabase.
 */

import { loadPlaces, type Place } from "./data";
import {
  getMyLikedIds,
  getMyBookmarkedIds,
  fetchLikeCounts,
  toggleLike,
  toggleBookmark,
} from "./db";

let allPlaces: Place[] = [];
let myLikedIds: Set<string> = new Set();
let myBookmarkedIds: Set<string> = new Set();
let likeCounts: Record<string, number> = {};

function showToast(message: string): void {
  const toast = document.getElementById("toast")!;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function getPlaceById(id: string): Place | undefined {
  return allPlaces.find((p) => p.id === id);
}

function renderPlaceCard(place: Place, mode: "likes" | "bookmarks"): string {
  const likes = likeCounts[place.id] ?? 0;
  const isLiked = myLikedIds.has(place.id);
  const isBookmarked = myBookmarkedIds.has(place.id);

  return `
    <div class="place-card personal-card" data-id="${place.id}" data-mode="${mode}">
      <div class="place-card-image">
        ${place.imageUrl ? `<img src="${place.imageUrl}" alt="${place.name}">` : "🍽️"}
      </div>
      <div class="place-card-content">
        <h3><a href="/place.html?place=${place.slug}">${place.name}</a></h3>
        <div class="place-card-meta">
          <span>${place.city}</span>
          <span>${place.priceRange}</span>
          ${likes > 0 ? `<span class="place-card-likes">♥ ${likes}</span>` : ""}
        </div>
        <div class="place-card-tags">
          ${place.cuisine
            .slice(0, 2)
            .map((c) => `<span class="tag">${c}</span>`)
            .join("")}
        </div>
        <div class="personal-card-actions">
          <button class="personal-action-btn like-action-btn ${isLiked ? "active" : ""}" data-id="${place.id}">
            ${isLiked ? "♥ Liked" : "♡ Like"}
          </button>
          <button class="personal-action-btn bookmark-action-btn ${isBookmarked ? "active" : ""}" data-id="${place.id}">
            ${isBookmarked ? "★ Saved" : "🔖 Save"}
          </button>
        </div>
      </div>
    </div>`;
}

function renderTab(tab: "likes" | "bookmarks"): void {
  const ids = [...(tab === "likes" ? myLikedIds : myBookmarkedIds)];
  const places = ids
    .map((id) => getPlaceById(id))
    .filter((p): p is Place => p !== undefined);

  const grid = document.getElementById(`${tab}-grid`)!;
  const empty = document.getElementById(`${tab}-empty`)!;
  const countEl = document.getElementById(`${tab}-count`)!;

  countEl.textContent = String(places.length);

  if (places.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
  } else {
    empty.classList.add("hidden");
    grid.innerHTML = places.map((p) => renderPlaceCard(p, tab)).join("");
  }
}

function setupTabSwitching(): void {
  document.querySelectorAll<HTMLButtonElement>(".personal-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".personal-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab as "likes" | "bookmarks";
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
      document.getElementById(`tab-${target}`)!.classList.remove("hidden");
    });
  });
}

function setupCardActions(): void {
  const handleGrid = (gridId: string) => {
    document.getElementById(gridId)!.addEventListener("click", async (e) => {
      const btn = (e.target as HTMLElement).closest("button[data-id]") as HTMLButtonElement | null;
      if (!btn) return;

      const placeId = btn.dataset.id!;
      const card = btn.closest(".personal-card") as HTMLElement;
      const mode = card.dataset.mode as "likes" | "bookmarks";

      if (btn.classList.contains("like-action-btn")) {
        const wasLiked = myLikedIds.has(placeId);
        // Optimistic update
        if (wasLiked) myLikedIds.delete(placeId);
        else myLikedIds.add(placeId);
        renderTab("likes");
        renderTab("bookmarks");
        showToast(wasLiked ? "Removed from likes" : "Added to likes");

        try {
          const { liked, count } = await toggleLike(placeId, wasLiked);
          likeCounts[placeId] = count;
          if (liked) myLikedIds.add(placeId);
          else myLikedIds.delete(placeId);
          renderTab("likes");
          renderTab("bookmarks");
        } catch {
          // Revert
          if (wasLiked) myLikedIds.add(placeId);
          else myLikedIds.delete(placeId);
          renderTab("likes");
          renderTab("bookmarks");
          showToast("Failed to update — please try again");
        }
      }

      if (btn.classList.contains("bookmark-action-btn")) {
        const wasBookmarked = myBookmarkedIds.has(placeId);
        if (wasBookmarked) myBookmarkedIds.delete(placeId);
        else myBookmarkedIds.add(placeId);
        renderTab("likes");
        renderTab("bookmarks");
        showToast(wasBookmarked ? "Removed from bookmarks" : "Saved to bookmarks");

        try {
          const { bookmarked, count } = await toggleBookmark(placeId, wasBookmarked);
          if (bookmarked) myBookmarkedIds.add(placeId);
          else myBookmarkedIds.delete(placeId);
          renderTab("likes");
          renderTab("bookmarks");
        } catch {
          if (wasBookmarked) myBookmarkedIds.add(placeId);
          else myBookmarkedIds.delete(placeId);
          renderTab("likes");
          renderTab("bookmarks");
          showToast("Failed to update — please try again");
        }
      }

      void mode; // used via data attribute above
    });
  };

  handleGrid("likes-grid");
  handleGrid("bookmarks-grid");
}

function showLoading(): void {
  ["likes-grid", "bookmarks-grid"].forEach((id) => {
    document.getElementById(id)!.innerHTML =
      '<p class="loading-text">Loading...</p>';
  });
}

async function init(): Promise<void> {
  showLoading();

  const [placesData, likedIds, bookmarkedIds] = await Promise.all([
    loadPlaces(),
    getMyLikedIds(),
    getMyBookmarkedIds(),
  ]);

  allPlaces = placesData.places;
  myLikedIds = new Set(likedIds);
  myBookmarkedIds = new Set(bookmarkedIds);

  // Batch fetch like counts for all relevant places
  const allIds = [...new Set([...likedIds, ...bookmarkedIds])];
  if (allIds.length > 0) {
    likeCounts = await fetchLikeCounts(allIds);
  }

  renderTab("likes");
  renderTab("bookmarks");
  setupTabSwitching();
  setupCardActions();
}

init();
