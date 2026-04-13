/**
 * Place page script.
 */

import {
  getPlaceBySlug,
  getCityBySlug,
  getSimilarPlaces,
  getUrlParam,
  type Place,
} from "./data";

import {
  fetchPlaceSocial,
  toggleLike,
  toggleBookmark,
  syncGuestToUser,
  getDeviceId,
} from "./db";

import {
  getUser,
  showLoginModal,
  consumePendingAction,
  renderNavUser,
  isGuestSynced,
  markGuestSynced,
} from "./auth";

declare const L: typeof import("leaflet");

let map: L.Map | null = null;

function initMap(place: Place): void {
  const mapContainer = document.getElementById("place-map");
  if (!mapContainer || !place.coordinates) return;

  map = L.map("place-map").setView(
    [place.coordinates.lat, place.coordinates.lng],
    15
  );
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }
  ).addTo(map);

  L.marker([place.coordinates.lat, place.coordinates.lng], {
    icon: L.divIcon({
      className: "place-marker",
      html: `<svg viewBox="0 0 24 32" width="28" height="38" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="place-pin-shadow" x="-40%" y="-15%" width="180%" height="145%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.4)"/>
          </filter>
        </defs>
        <path d="M12 1C6.925 1 2.857 5.068 2.857 10.143c0 6.643 9.143 20.857 9.143 20.857s9.143-14.214 9.143-20.857C21.143 5.068 17.075 1 12 1z" fill="#e65100" filter="url(#place-pin-shadow)"/>
        <circle cx="12" cy="10" r="5" fill="white"/>
      </svg>`,
      iconSize: [28, 38],
      iconAnchor: [14, 38],
      popupAnchor: [0, -38],
    }),
  })
    .bindPopup(`<strong>${place.name}</strong>`)
    .addTo(map);
}

function updatePageContent(place: Place, cityName: string): void {
  document.title = `${place.name} - ${place.city} | Street Food India`;

  const breadcrumbCityLink = document.getElementById(
    "breadcrumb-city-link"
  ) as HTMLAnchorElement;
  if (breadcrumbCityLink) {
    breadcrumbCityLink.href = `/city.html?city=${place.citySlug}`;
    breadcrumbCityLink.textContent = cityName;
  }
  const breadcrumbPlace = document.getElementById("breadcrumb-place");
  if (breadcrumbPlace) breadcrumbPlace.textContent = place.name;

  (document.getElementById("place-name") as HTMLElement).textContent =
    place.name;
  (document.getElementById("place-city") as HTMLElement).textContent =
    place.city;
  (document.getElementById("place-price") as HTMLElement).textContent =
    place.priceRange;

  const descSection = document.getElementById("place-description-section");
  const descEl = document.getElementById("place-description");
  if (descSection && descEl) {
    if (place.description) {
      descEl.textContent = place.description;
    } else {
      descSection.style.display = "none";
    }
  }

  const addr = document.getElementById("place-address");
  if (addr) addr.textContent = place.address || "Address not available";

  const cuisineEl = document.getElementById("place-cuisine");
  if (cuisineEl)
    cuisineEl.innerHTML = place.cuisine
      .map((c) => `<span class="tag">${c}</span>`)
      .join("");

  const dishesEl = document.getElementById("place-dishes");
  if (dishesEl)
    dishesEl.innerHTML =
      place.dishes.length > 0
        ? place.dishes.map((d) => `<span class="tag">${d}</span>`).join("")
        : "<span>No dishes listed</span>";
}

function showToast(message: string): void {
  const toast = document.getElementById("toast")!;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

async function setupSocialActions(place: Place): Promise<void> {
  const likeBtn = document.getElementById("like-btn")!;
  const likeIcon = document.getElementById("like-icon")!;
  const likeCountEl = document.getElementById("like-count")!;
  const bookmarkBtn = document.getElementById("bookmark-btn")!;
  const bookmarkIcon = document.getElementById("bookmark-icon")!;
  const bookmarkLabel = document.getElementById("bookmark-label")!;
  const bookmarkCountEl = document.getElementById("bookmark-count")!;
  const shareBtn = document.getElementById("share-btn") as HTMLButtonElement;

  function updateLikeUI(count: number, liked: boolean): void {
    likeIcon.textContent = liked ? "♥" : "♡";
    likeCountEl.textContent = String(count);
    likeBtn.classList.toggle("active", liked);
    likeBtn.title = liked ? "Unlike" : "Like this place";
  }

  function updateBookmarkUI(count: number, bookmarked: boolean): void {
    bookmarkIcon.textContent = bookmarked ? "★" : "🔖";
    bookmarkLabel.textContent = bookmarked ? "Saved" : "Save";
    bookmarkCountEl.textContent = count > 0 ? ` · ${count}` : "";
    bookmarkBtn.classList.toggle("active", bookmarked);
  }

  let liked = false;
  let likeCount = 0;
  let bookmarked = false;
  let bookmarkCount = 0;

  try {
    const social = await fetchPlaceSocial(place.id);
    liked = social.liked;
    likeCount = social.likeCount;
    bookmarked = social.bookmarked;
    bookmarkCount = social.bookmarkCount;
    updateLikeUI(likeCount, liked);
    updateBookmarkUI(bookmarkCount, bookmarked);
  } catch (err) {
    console.error("Failed to load social data:", err);
  }

  // ── Like ──────────────────────────────────────────────────────────────────
  likeBtn.addEventListener("click", async () => {
    // If not liked yet, maybe prompt for login first
    if (!liked) {
      const user = await getUser();
      if (!user) {
        await showLoginModal("like", { type: "like", placeId: place.id });
        // User chose "guest" — fall through and toggle locally
      }
    }

    const wasLiked = liked;
    liked = !wasLiked;
    likeCount += liked ? 1 : -1;
    updateLikeUI(likeCount, liked);
    showToast(liked ? "Added to likes" : "Removed from likes");

    try {
      const result = await toggleLike(place.id, wasLiked);
      liked = result.liked;
      likeCount = result.count;
      updateLikeUI(likeCount, liked);
    } catch {
      liked = wasLiked;
      likeCount += liked ? 1 : -1;
      updateLikeUI(likeCount, liked);
      showToast("Failed to update — please try again");
    }
  });

  // ── Bookmark ──────────────────────────────────────────────────────────────
  bookmarkBtn.addEventListener("click", async () => {
    if (!bookmarked) {
      const user = await getUser();
      if (!user) {
        await showLoginModal("bookmark", {
          type: "bookmark",
          placeId: place.id,
        });
      }
    }

    const wasBookmarked = bookmarked;
    bookmarked = !wasBookmarked;
    bookmarkCount += bookmarked ? 1 : -1;
    updateBookmarkUI(bookmarkCount, bookmarked);
    showToast(bookmarked ? "Saved to bookmarks" : "Removed from bookmarks");

    try {
      const result = await toggleBookmark(place.id, wasBookmarked);
      bookmarked = result.bookmarked;
      bookmarkCount = result.count;
      updateBookmarkUI(bookmarkCount, bookmarked);
    } catch {
      bookmarked = wasBookmarked;
      bookmarkCount += bookmarked ? 1 : -1;
      updateBookmarkUI(bookmarkCount, bookmarked);
      showToast("Failed to update — please try again");
    }
  });

  // ── Share ─────────────────────────────────────────────────────────────────
  const url = `${window.location.origin}/place.html?place=${place.slug}`;
  const shareText = `Check out ${place.name} in ${place.city}!`;
  const dropdown = document.getElementById("share-dropdown")!;

  shareBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dropdown.classList.toggle("hidden");
  });
  document.addEventListener("click", () => dropdown.classList.add("hidden"));
  dropdown.addEventListener("click", (e) => e.stopPropagation());

  (document.getElementById("share-twitter") as HTMLAnchorElement).href =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;

  (document.getElementById("share-whatsapp") as HTMLAnchorElement).href =
    `https://wa.me/?text=${encodeURIComponent(shareText + " " + url)}`;

  document
    .getElementById("share-instagram")!
    .addEventListener("click", async () => {
      await navigator.clipboard.writeText(url);
      dropdown.classList.add("hidden");
      showToast("Link copied — paste it on Instagram");
    });

  document
    .getElementById("share-copy")!
    .addEventListener("click", async () => {
      await navigator.clipboard.writeText(url);
      dropdown.classList.add("hidden");
      showToast("Link copied to clipboard");
    });
}

async function renderSimilarPlaces(place: Place): Promise<void> {
  const container = document.getElementById("similar-places");
  if (!container) return;
  const similar = await getSimilarPlaces(place, 5);
  if (similar.length === 0) {
    container.innerHTML = "<p>No similar places found.</p>";
    return;
  }
  container.innerHTML = similar
    .map(
      (p) => `
      <a href="/place.html?place=${p.slug}" class="similar-place">
        <div class="similar-place-info">
          <h4>${p.name}</h4>
          <div class="similar-place-meta">${p.city} · ${p.priceRange}</div>
        </div>
      </a>`
    )
    .join("");
}

function showNotFound(): void {
  const el = document.getElementById("place-name");
  if (el) el.textContent = "Place Not Found";
  const content = document.querySelector(".place-content");
  if (content)
    content.innerHTML = `<div class="container"><div class="no-results"><p>The place you're looking for doesn't exist.</p><p><a href="/">Go back to homepage</a></p></div></div>`;
}

async function init(): Promise<void> {
  const placeSlug = getUrlParam("place");
  if (!placeSlug) {
    showNotFound();
    return;
  }

  const place = await getPlaceBySlug(placeSlug);
  if (!place) {
    showNotFound();
    return;
  }

  const city = await getCityBySlug(place.citySlug);
  updatePageContent(place, city?.name || place.city);

  if (place.coordinates) initMap(place);

  // ── Auth: sync guest → user (once per device/user pair) ──────────────────
  const user = await getUser();
  if (user && !isGuestSynced(user.id)) {
    void syncGuestToUser(getDeviceId(), user.id).then(() =>
      markGuestSynced(user.id)
    );
  }

  // ── Auth: replay any pending action from before OAuth redirect ─────────────
  const pending = consumePendingAction();

  // ── Render nav avatar ─────────────────────────────────────────────────────
  renderNavUser(user);

  // ── Social actions + similar ──────────────────────────────────────────────
  await Promise.all([setupSocialActions(place), renderSimilarPlaces(place)]);

  // Execute the deferred like/bookmark after social state is set up
  if (pending && pending.placeId === place.id) {
    const btn = document.getElementById(
      pending.type === "like" ? "like-btn" : "bookmark-btn"
    ) as HTMLButtonElement | null;
    btn?.click();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
