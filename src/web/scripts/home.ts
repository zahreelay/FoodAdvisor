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
let userMarker: L.Marker | null = null;

/**
 * Add CartoDB Voyager tile layer (English labels, beautiful).
 */
function addTileLayer(mapInstance: L.Map): void {
  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 19,
    }
  ).addTo(mapInstance);
}

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
    maxZoom: 14,
    maxBounds: INDIA_BOUNDS,
    maxBoundsViscosity: 0.8,
    zoomControl: false,
  });

  addTileLayer(map);

  // Zoom control to bottom right
  L.control.zoom({ position: "bottomright" }).addTo(map);

  // Locate me button
  addLocateButton();
}

/**
 * Add a "locate me" control button to the map.
 */
function addLocateButton(): void {
  const LocateControl = L.Control.extend({
    options: { position: "bottomright" },
    onAdd() {
      const btn = L.DomUtil.create("button", "locate-btn leaflet-bar");
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
      btn.title = "Find my location";
      btn.setAttribute("aria-label", "Find my location");
      L.DomEvent.disableClickPropagation(btn);
      btn.addEventListener("click", () => requestGeolocation(true));
      return btn;
    },
  });
  new LocateControl().addTo(map);
}

/**
 * Create a custom SVG pin icon for city markers.
 */
function createCityIcon(placeCount: number): L.DivIcon {
  const size = Math.max(36, Math.min(54, 28 + placeCount * 2));
  const height = Math.round(size * 1.38);
  const fontSize = placeCount > 99 ? 9 : placeCount > 9 ? 10 : 12;

  return L.divIcon({
    className: "city-marker",
    html: `<svg viewBox="0 0 40 55" width="${size}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="city-shadow-${placeCount}" x="-30%" y="-10%" width="160%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.35)"/>
        </filter>
      </defs>
      <path d="M20 2C11.716 2 5 8.716 5 17c0 11.5 15 36 15 36S35 28.5 35 17C35 8.716 28.284 2 20 2z" fill="#e65100" filter="url(#city-shadow-${placeCount})"/>
      <circle cx="20" cy="16" r="11" fill="white"/>
      <text x="20" y="${16 + fontSize * 0.42 + 1}" text-anchor="middle" font-size="${fontSize}" font-weight="700" fill="#e65100" font-family="system-ui,sans-serif">${placeCount}</text>
    </svg>`,
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
    popupAnchor: [0, -height + 8],
  });
}

/**
 * Create a user location marker (blue pulsing dot).
 */
function createUserIcon(): L.DivIcon {
  return L.divIcon({
    className: "user-location-marker",
    html: `<div class="user-dot"><div class="user-dot-inner"></div><div class="user-dot-pulse"></div></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/**
 * Request browser geolocation and zoom to user's area.
 */
function requestGeolocation(showFeedback = false): void {
  if (!navigator.geolocation) return;

  const locateBtn = document.querySelector<HTMLButtonElement>(".locate-btn");
  if (locateBtn) {
    locateBtn.classList.add("locating");
    locateBtn.title = "Finding your location…";
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;

      if (userMarker) {
        userMarker.remove();
        userMarker = null;
      }

      userMarker = L.marker([latitude, longitude], {
        icon: createUserIcon(),
        zIndexOffset: 1000,
      })
        .bindTooltip("You are here", { permanent: false, direction: "top" })
        .addTo(map);

      // Zoom to user's region while keeping India context
      map.flyTo([latitude, longitude], 7, { duration: 1.2 });

      if (locateBtn) {
        locateBtn.classList.remove("locating");
        locateBtn.classList.add("located");
        locateBtn.title = "Your location";
        setTimeout(() => locateBtn.classList.remove("located"), 3000);
      }
    },
    (_error) => {
      if (locateBtn) {
        locateBtn.classList.remove("locating");
        locateBtn.title = showFeedback
          ? "Location unavailable — check browser permissions"
          : "Find my location";
      }
    },
    { timeout: 8000, maximumAge: 60000 }
  );
}

/**
 * Add city markers to the map.
 */
function addCityMarkers(cities: City[]): void {
  markers.forEach((m) => m.remove());
  markers = [];

  cities.forEach((city) => {
    const marker = L.marker([city.coordinates.lat, city.coordinates.lng], {
      icon: createCityIcon(city.placeCount),
    });

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
  initMap();

  const [citiesData, placesData] = await Promise.all([
    loadCities(),
    loadPlaces(),
  ]);

  updateStats(citiesData.totalCities, placesData.totalPlaces);
  addCityMarkers(citiesData.cities);
  renderCityCards(citiesData.cities);

  // Silently request geolocation after data loads
  requestGeolocation(false);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
