/**
 * Homepage script - India map with city markers.
 */

import { loadCities, loadPlaces, type City } from "./data";

declare const L: typeof import("leaflet");

// India bounds for map view
const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [6.5, 68.0], // Southwest
  [35.5, 97.5], // Northeast
];

const INDIA_CENTER: [number, number] = [22.5, 82.0];
const DEFAULT_ZOOM = 5;

let map: L.Map;
let markers: L.Marker[] = [];

/**
 * Initialize the Leaflet map centered on India.
 */
function initMap(): void {
  const mapContainer = document.getElementById("india-map");
  if (!mapContainer) return;

  map = L.map("india-map", {
    center: INDIA_CENTER,
    zoom: DEFAULT_ZOOM,
    minZoom: 4,
    maxZoom: 12,
    maxBounds: INDIA_BOUNDS,
    maxBoundsViscosity: 0.8,
  });

  // Add OpenStreetMap tiles
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}

/**
 * Create a custom icon for city markers.
 */
function createCityIcon(placeCount: number): L.DivIcon {
  // Size based on place count
  const size = Math.max(24, Math.min(40, 16 + placeCount * 2));

  return L.divIcon({
    className: "city-marker",
    html: `<div style="
      background: #e65100;
      color: white;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: ${size > 30 ? "12px" : "10px"};
      font-weight: bold;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">${placeCount}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Add city markers to the map.
 */
function addCityMarkers(cities: City[]): void {
  // Clear existing markers
  markers.forEach((m) => m.remove());
  markers = [];

  cities.forEach((city) => {
    const marker = L.marker([city.coordinates.lat, city.coordinates.lng], {
      icon: createCityIcon(city.placeCount),
    });

    // Popup content
    const popupContent = `
      <div class="popup-content">
        <div class="popup-title">${city.name}</div>
        <div class="popup-subtitle">${city.state} · ${city.placeCount} places</div>
      </div>
    `;

    marker.bindPopup(popupContent);

    marker.on("click", () => {
      window.location.href = `/city.html?city=${city.slug}`;
    });

    // Tooltip on hover
    marker.bindTooltip(city.name, {
      permanent: false,
      direction: "top",
      offset: [0, -10],
    });

    marker.addTo(map);
    markers.push(marker);
  });
}

/**
 * Render city cards in the grid.
 */
function renderCityCards(cities: City[]): void {
  const grid = document.getElementById("cities-grid");
  if (!grid) return;

  grid.innerHTML = cities
    .map(
      (city) => `
      <article class="city-card" onclick="window.location.href='/city.html?city=${city.slug}'">
        <h3>${city.name}</h3>
        <p class="city-state">${city.state}</p>
        <p class="city-places">${city.placeCount} Street Food Spots</p>
      </article>
    `
    )
    .join("");
}

/**
 * Update statistics in the hero section.
 */
function updateStats(totalCities: number, totalPlaces: number): void {
  const citiesEl = document.getElementById("total-cities");
  const placesEl = document.getElementById("total-places");

  if (citiesEl) citiesEl.textContent = String(totalCities);
  if (placesEl) placesEl.textContent = String(totalPlaces);
}

/**
 * Initialize the homepage.
 */
async function init(): Promise<void> {
  // Initialize map
  initMap();

  // Load data
  const [citiesData, placesData] = await Promise.all([
    loadCities(),
    loadPlaces(),
  ]);

  // Update stats
  updateStats(citiesData.totalCities, placesData.totalPlaces);

  // Add markers to map
  addCityMarkers(citiesData.cities);

  // Render city cards
  renderCityCards(citiesData.cities);
}

// Run on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
