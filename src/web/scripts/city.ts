/**
 * City page script - displays food places for a specific city.
 */

import {
  getCityBySlug,
  getPlacesByCity,
  getLikeCount,
  initSocialData,
  getUrlParam,
  type Place,
  type City,
} from "./data";

declare const L: typeof import("leaflet");

let map: L.Map | null = null;
let markers: L.Marker[] = [];
let allPlaces: Place[] = [];
let currentCity: City | null = null;

/**
 * Initialize the city map.
 */
function initMap(city: City, places: Place[]): void {
  const mapContainer = document.getElementById("city-map");
  if (!mapContainer || map) return;

  map = L.map("city-map").setView(
    [city.coordinates.lat, city.coordinates.lng],
    12
  );

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  addPlaceMarkers(places);
}

/**
 * Add place markers to the map.
 */
function addPlaceMarkers(places: Place[]): void {
  if (!map) return;

  // Clear existing markers
  markers.forEach((m) => m.remove());
  markers = [];

  places.forEach((place) => {
    if (!place.coordinates) return;

    const marker = L.marker([place.coordinates.lat, place.coordinates.lng], {
      icon: L.divIcon({
        className: "place-marker",
        html: `<div style="
          background: #e65100;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
    });

    marker.bindPopup(`
      <div class="popup-content">
        <div class="popup-title">${place.name}</div>
        <div class="popup-subtitle">${place.cuisine.slice(0, 2).join(", ")}</div>
      </div>
    `);

    marker.bindTooltip(place.name, {
      permanent: false,
      direction: "top",
    });

    marker.on("click", () => {
      window.location.href = `/place.html?place=${place.slug}`;
    });

    marker.addTo(map!);
    markers.push(marker);
  });

  // Fit bounds if we have markers
  if (markers.length > 0) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.1));
  }
}

/**
 * Render place cards.
 */
function renderPlaceCards(places: Place[]): void {
  const grid = document.getElementById("places-grid");
  const noResults = document.getElementById("no-results");

  if (!grid || !noResults) return;

  if (places.length === 0) {
    grid.style.display = "none";
    noResults.style.display = "block";
    return;
  }

  grid.style.display = "grid";
  noResults.style.display = "none";

  grid.innerHTML = places
    .map((place) => {
      const likes = getLikeCount(place.id);
      return `
        <article class="place-card">
          <div class="place-card-image">
            ${place.imageUrl ? `<img src="${place.imageUrl}" alt="${place.name}">` : "🍽️"}
          </div>
          <div class="place-card-content">
            <h3><a href="/place.html?place=${place.slug}">${place.name}</a></h3>
            <div class="place-card-meta">
              <span class="place-card-price">${place.priceRange}</span>
              ${likes > 0 ? `<span class="place-card-likes">♥ ${likes}</span>` : ""}
            </div>
            <div class="place-card-tags">
              ${place.cuisine
                .slice(0, 2)
                .map((c) => `<span class="tag">${c}</span>`)
                .join("")}
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

/**
 * Get unique cuisines from places.
 */
function getUniqueCuisines(places: Place[]): string[] {
  const cuisines = new Set<string>();
  places.forEach((p) => p.cuisine.forEach((c) => cuisines.add(c)));
  return Array.from(cuisines).sort();
}

/**
 * Populate cuisine filter dropdown.
 */
function populateCuisineFilter(places: Place[]): void {
  const select = document.getElementById("cuisine-filter") as HTMLSelectElement;
  if (!select) return;

  const cuisines = getUniqueCuisines(places);
  const options = cuisines.map((c) => `<option value="${c}">${c}</option>`);

  select.innerHTML = `<option value="">All Cuisines</option>` + options.join("");
}

/**
 * Filter and sort places based on current selections.
 */
function filterAndSortPlaces(): Place[] {
  const cuisineFilter = (
    document.getElementById("cuisine-filter") as HTMLSelectElement
  )?.value;
  const sortBy = (document.getElementById("sort-by") as HTMLSelectElement)
    ?.value;

  let filtered = [...allPlaces];

  // Filter by cuisine
  if (cuisineFilter) {
    filtered = filtered.filter((p) => p.cuisine.includes(cuisineFilter));
  }

  // Sort
  switch (sortBy) {
    case "name":
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "rating":
      filtered.sort((a, b) => getLikeCount(b.id) - getLikeCount(a.id));
      break;
    case "price-low":
      filtered.sort((a, b) => a.priceRange.length - b.priceRange.length);
      break;
    case "price-high":
      filtered.sort((a, b) => b.priceRange.length - a.priceRange.length);
      break;
  }

  return filtered;
}

/**
 * Handle filter/sort changes.
 */
function handleFilterChange(): void {
  const filtered = filterAndSortPlaces();
  renderPlaceCards(filtered);
  addPlaceMarkers(filtered);
}

/**
 * Update page with city data.
 */
function updatePageContent(city: City, places: Place[]): void {
  // Update title
  document.title = `${city.name} Street Food - Street Food India`;

  // Update page elements
  const breadcrumbCity = document.getElementById("breadcrumb-city");
  const cityName = document.getElementById("city-name");
  const cityState = document.getElementById("city-state");
  const cityPlaceCount = document.getElementById("city-place-count");
  const cityCuisineCount = document.getElementById("city-cuisine-count");

  if (breadcrumbCity) breadcrumbCity.textContent = city.name;
  if (cityName) cityName.textContent = `${city.name} Street Food`;
  if (cityState) cityState.textContent = city.state;
  if (cityPlaceCount) cityPlaceCount.textContent = String(places.length);
  if (cityCuisineCount) {
    cityCuisineCount.textContent = String(getUniqueCuisines(places).length);
  }
}

/**
 * Show 404 state.
 */
function showNotFound(): void {
  const cityName = document.getElementById("city-name");
  if (cityName) {
    cityName.textContent = "City Not Found";
  }

  const grid = document.getElementById("places-grid");
  if (grid) {
    grid.innerHTML = `
      <div class="no-results">
        <p>The city you're looking for doesn't exist.</p>
        <p><a href="/">Go back to homepage</a></p>
      </div>
    `;
  }
}

/**
 * Initialize the city page.
 */
async function init(): Promise<void> {
  initSocialData();
  const citySlug = getUrlParam("city");

  if (!citySlug) {
    showNotFound();
    return;
  }

  const city = await getCityBySlug(citySlug);

  if (!city) {
    showNotFound();
    return;
  }

  currentCity = city;
  allPlaces = await getPlacesByCity(citySlug);

  // Update page content
  updatePageContent(city, allPlaces);

  // Initialize map
  initMap(city, allPlaces);

  // Populate filters
  populateCuisineFilter(allPlaces);

  // Render places
  renderPlaceCards(allPlaces);

  // Add filter event listeners
  document
    .getElementById("cuisine-filter")
    ?.addEventListener("change", handleFilterChange);
  document
    .getElementById("sort-by")
    ?.addEventListener("change", handleFilterChange);
}

// Run on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
