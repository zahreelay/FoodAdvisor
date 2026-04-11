/**
 * Personal page — liked and bookmarked places.
 */

import {
  loadPlaces,
  initSocialData,
  getMyLikedIds,
  getMyBookmarkedIds,
  getLikeCount,
  getBookmarkCount,
  hasLiked,
  hasBookmarked,
  toggleLike,
  toggleBookmark,
  type Place,
} from "./data";

let allPlaces: Place[] = [];

function showToast(message: string): void {
  const toast = document.getElementById("toast")!;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function renderPlaceCard(place: Place, mode: "likes" | "bookmarks"): string {
  const likes = getLikeCount(place.id);
  const isLiked = hasLiked(place.id);
  const isBookmarked = hasBookmarked(place.id);

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
          <button class="personal-action-btn like-action-btn ${isLiked ? "active" : ""}" data-id="${place.id}" title="${isLiked ? "Unlike" : "Like"}">
            ${isLiked ? "♥" : "♡"} ${isLiked ? "Liked" : "Like"}
          </button>
          <button class="personal-action-btn bookmark-action-btn ${isBookmarked ? "active" : ""}" data-id="${place.id}" title="${isBookmarked ? "Unsave" : "Save"}">
            ${isBookmarked ? "★ Saved" : "🔖 Save"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function getPlacesForIds(ids: string[]): Place[] {
  return ids
    .map((id) => allPlaces.find((p) => p.id === id))
    .filter((p): p is Place => p !== undefined);
}

function renderTab(tab: "likes" | "bookmarks"): void {
  const ids = tab === "likes" ? getMyLikedIds() : getMyBookmarkedIds();
  const places = getPlacesForIds(ids);
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
  const tabs = document.querySelectorAll<HTMLButtonElement>(".personal-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const target = tab.dataset.tab as "likes" | "bookmarks";
      document
        .querySelectorAll(".tab-panel")
        .forEach((p) => p.classList.add("hidden"));
      document.getElementById(`tab-${target}`)!.classList.remove("hidden");
    });
  });
}

function setupCardActions(): void {
  // Event delegation on both grids
  ["likes-grid", "bookmarks-grid"].forEach((gridId) => {
    document.getElementById(gridId)!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button[data-id]") as HTMLButtonElement | null;
      if (!btn) return;

      const placeId = btn.dataset.id!;
      const card = btn.closest(".personal-card") as HTMLElement;
      const mode = card.dataset.mode as "likes" | "bookmarks";

      if (btn.classList.contains("like-action-btn")) {
        const { liked } = toggleLike(placeId);
        showToast(liked ? "Added to likes" : "Removed from likes");
        // Re-render the tab that owns this card so removed items disappear
        if (!liked && mode === "likes") {
          renderTab("likes");
        } else {
          renderTab("likes");
          renderTab("bookmarks");
        }
      }

      if (btn.classList.contains("bookmark-action-btn")) {
        const { bookmarked } = toggleBookmark(placeId);
        showToast(bookmarked ? "Saved to bookmarks" : "Removed from bookmarks");
        if (!bookmarked && mode === "bookmarks") {
          renderTab("bookmarks");
        } else {
          renderTab("likes");
          renderTab("bookmarks");
        }
      }
    });
  });
}

async function init(): Promise<void> {
  initSocialData();

  const data = await loadPlaces();
  allPlaces = data.places;

  renderTab("likes");
  renderTab("bookmarks");
  setupTabSwitching();
  setupCardActions();
}

init();
