/**
 * Personal page — liked and bookmarked places, backed by Supabase.
 * Shows synced data when signed in, device-local data for guests.
 */

import { loadPlaces, type Place } from "./data";
import {
  getMyLikedIds,
  getMyBookmarkedIds,
  fetchLikeCounts,
  toggleLike,
  toggleBookmark,
  syncGuestToUser,
  getDeviceId,
} from "./db";
import {
  getUser,
  signOut,
  signInWithGoogle,
  showSignInModal,
  renderNavUser,
  isGuestSynced,
  markGuestSynced,
  type AuthUser,
} from "./auth";

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
  document
    .querySelectorAll<HTMLButtonElement>(".personal-tab")
    .forEach((tab) => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".personal-tab")
          .forEach((t) => t.classList.remove("active"));
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
  const handleGrid = (gridId: string) => {
    document.getElementById(gridId)!.addEventListener("click", async (e) => {
      const btn = (e.target as HTMLElement).closest(
        "button[data-id]"
      ) as HTMLButtonElement | null;
      if (!btn) return;

      const placeId = btn.dataset.id!;
      const card = btn.closest(".personal-card") as HTMLElement;
      const mode = card.dataset.mode as "likes" | "bookmarks";

      if (btn.classList.contains("like-action-btn")) {
        const wasLiked = myLikedIds.has(placeId);
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
        showToast(
          wasBookmarked ? "Removed from bookmarks" : "Saved to bookmarks"
        );

        try {
          const { bookmarked } = await toggleBookmark(placeId, wasBookmarked);
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

      void mode;
    });
  };

  handleGrid("likes-grid");
  handleGrid("bookmarks-grid");
}

// ── User profile bar ──────────────────────────────────────────────────────────

function renderUserProfile(user: AuthUser | null): void {
  const bar = document.getElementById("user-profile-bar");
  if (!bar) return;

  if (user) {
    const initial = (user.name ?? user.email ?? "?")[0].toUpperCase();
    bar.innerHTML = `
      <div class="container">
        <div class="user-profile">
          ${
            user.avatarUrl
              ? `<img src="${user.avatarUrl}" class="user-profile-avatar" alt="${user.name ?? "Profile"}" referrerpolicy="no-referrer">`
              : `<div class="user-profile-avatar user-profile-avatar--initials">${initial}</div>`
          }
          <div class="user-profile-info">
            ${user.name ? `<div class="user-profile-name">${user.name}</div>` : ""}
            ${user.email ? `<div class="user-profile-email">${user.email}</div>` : ""}
          </div>
          <button class="user-signout-btn" id="signout-btn">Sign out</button>
        </div>
      </div>`;
    bar.classList.remove("hidden");

    document.getElementById("signout-btn")!.addEventListener("click", async () => {
      if (confirm("Sign out of Street Food India?")) {
        await signOut();
        location.reload();
      }
    });
  } else {
    // Guest: show sign-in prompt
    bar.innerHTML = `
      <div class="container">
        <div class="personal-signin-prompt">
          <div class="personal-signin-prompt-text">
            <strong>Save your picks across devices</strong>
            <span>Sign in to sync your likes and bookmarks everywhere.</span>
          </div>
          <div class="personal-signin-actions">
            <button class="auth-btn auth-btn-google personal-signin-google" id="prompt-google-btn">
              <svg viewBox="0 0 24 24" width="16" height="16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            <button class="auth-btn auth-btn-primary personal-signin-magic" id="prompt-signin-btn">
              Magic link
            </button>
          </div>
        </div>
      </div>`;
    bar.classList.remove("hidden");

    document
      .getElementById("prompt-google-btn")!
      .addEventListener("click", () => void signInWithGoogle());
    document
      .getElementById("prompt-signin-btn")!
      .addEventListener("click", () => showSignInModal());
  }
}

function showLoading(): void {
  ["likes-grid", "bookmarks-grid"].forEach((id) => {
    document.getElementById(id)!.innerHTML =
      '<p class="loading-text">Loading...</p>';
  });
}

async function init(): Promise<void> {
  showLoading();

  const user = await getUser();

  // Sync guest → user once per device/account pair
  if (user && !isGuestSynced(user.id)) {
    await syncGuestToUser(getDeviceId(), user.id);
    markGuestSynced(user.id);
  }

  renderNavUser(user);
  renderUserProfile(user);

  const [placesData, likedIds, bookmarkedIds] = await Promise.all([
    loadPlaces(),
    getMyLikedIds(),
    getMyBookmarkedIds(),
  ]);

  allPlaces = placesData.places;
  myLikedIds = new Set(likedIds);
  myBookmarkedIds = new Set(bookmarkedIds);

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
