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
} from "./db";

declare const L: typeof import("leaflet");

let map: L.Map | null = null;

function initMap(place: Place): void {
  const mapContainer = document.getElementById("place-map");
  if (!mapContainer || !place.coordinates) return;

  map = L.map("place-map").setView(
    [place.coordinates.lat, place.coordinates.lng],
    15
  );
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  L.marker([place.coordinates.lat, place.coordinates.lng], {
    icon: L.divIcon({
      className: "place-marker",
      html: `<div style="background:#e65100;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
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

  (document.getElementById("place-name") as HTMLElement).textContent = place.name;
  (document.getElementById("place-city") as HTMLElement).textContent = place.city;
  (document.getElementById("place-price") as HTMLElement).textContent = place.priceRange;

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
    cuisineEl.innerHTML = place.cuisine.map((c) => `<span class="tag">${c}</span>`).join("");

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

  // Track current state for optimistic updates
  let liked = false;
  let likeCount = 0;
  let bookmarked = false;
  let bookmarkCount = 0;

  // Load real state from DB
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

  // Like toggle with optimistic UI
  likeBtn.addEventListener("click", async () => {
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
      // Revert
      liked = wasLiked;
      likeCount += liked ? 1 : -1;
      updateLikeUI(likeCount, liked);
      showToast("Failed to update — please try again");
    }
  });

  // Bookmark toggle with optimistic UI
  bookmarkBtn.addEventListener("click", async () => {
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

  // Share dropdown
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

  document.getElementById("share-instagram")!.addEventListener("click", async () => {
    await navigator.clipboard.writeText(url);
    dropdown.classList.add("hidden");
    showToast("Link copied — paste it on Instagram");
  });

  document.getElementById("share-copy")!.addEventListener("click", async () => {
    await navigator.clipboard.writeText(url);
    dropdown.classList.add("hidden");
    showToast("Link copied to clipboard");
  });
}

async function renderSimilarPlaces(place: Place): Promise<void> {
  const container = document.getElementById("similar-places");
  if (!container) return;
  const similar = await getSimilarPlaces(place, 5);
  if (similar.length === 0) { container.innerHTML = "<p>No similar places found.</p>"; return; }
  container.innerHTML = similar
    .map((p) => `
      <a href="/place.html?place=${p.slug}" class="similar-place">
        <div class="similar-place-info">
          <h4>${p.name}</h4>
          <div class="similar-place-meta">${p.city} · ${p.priceRange}</div>
        </div>
      </a>`)
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
  if (!placeSlug) { showNotFound(); return; }

  const place = await getPlaceBySlug(placeSlug);
  if (!place) { showNotFound(); return; }

  const city = await getCityBySlug(place.citySlug);
  updatePageContent(place, city?.name || place.city);

  if (place.coordinates) initMap(place);

  // Social and similar load in parallel; social is async
  await Promise.all([
    setupSocialActions(place),
    renderSimilarPlaces(place),
  ]);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
