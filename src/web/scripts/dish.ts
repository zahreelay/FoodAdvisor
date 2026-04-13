/**
 * Dish results page — shows all places serving a specific dish.
 */

import {
  getPlacesByDish,
  getDishEmoji,
  getUrlParam,
  type Place,
} from './data';

import { fetchLikeCounts } from './db';

declare const L: typeof import('leaflet');

let map: L.Map | null = null;
let markers: L.Marker[] = [];
let allPlaces: Place[] = [];
let selectedCity = 'all';
let sortBy = 'rating';
let likeCounts: Record<string, number> = {};

async function init(): Promise<void> {
  const dishName = getUrlParam('dish');
  if (!dishName) {
    window.location.href = '/dishes.html';
    return;
  }

  document.title = `${dishName} – Street Food India`;
  (document.getElementById('dish-name') as HTMLElement).textContent = dishName;
  (document.getElementById('dish-breadcrumb') as HTMLElement).textContent = dishName;
  (document.getElementById('dish-emoji') as HTMLElement).textContent = getDishEmoji(dishName);

  allPlaces = await getPlacesByDish(dishName);

  const tagline = document.getElementById('dish-tagline') as HTMLElement;
  if (allPlaces.length === 0) {
    tagline.textContent = 'No places found for this dish yet.';
    return;
  }

  const citySet = new Set(allPlaces.map((p) => p.city));
  tagline.textContent = `${allPlaces.length} ${allPlaces.length === 1 ? 'place' : 'places'} across ${citySet.size} ${citySet.size === 1 ? 'city' : 'cities'}`;

  buildCityFilters(Array.from(citySet).sort());
  document.getElementById('sort-select')!.addEventListener('change', (e) => {
    sortBy = (e.target as HTMLSelectElement).value;
    render();
  });

  initMap();
  // Fetch like counts then re-render with real data
  fetchLikeCounts(allPlaces.map((p) => p.id)).then((counts) => {
    likeCounts = counts;
    render();
  });
  render();
}

function buildCityFilters(cities: string[]): void {
  const bar = document.getElementById('city-filters')!;
  const all = ['All', ...cities];
  bar.innerHTML = all
    .map(
      (city) =>
        `<button class="city-filter-btn ${city === 'All' ? 'active' : ''}" data-city="${city === 'All' ? 'all' : city}">${city}</button>`
    )
    .join('');

  bar.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.city-filter-btn') as HTMLButtonElement | null;
    if (!btn) return;
    bar.querySelectorAll('.city-filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedCity = btn.dataset.city!;
    render();
  });
}

function initMap(): void {
  const container = document.getElementById('dish-map');
  if (!container || map) return;

  map = L.map('dish-map').setView([20.5937, 78.9629], 5);
  L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }
  ).addTo(map);
}

function getFilteredSorted(): Place[] {
  let places =
    selectedCity === 'all'
      ? [...allPlaces]
      : allPlaces.filter((p) => p.city === selectedCity);

  switch (sortBy) {
    case 'rating':
      places.sort((a, b) => (likeCounts[b.id] ?? 0) - (likeCounts[a.id] ?? 0));
      break;
    case 'price-asc':
      places.sort((a, b) => a.priceRange.length - b.priceRange.length);
      break;
    case 'price-desc':
      places.sort((a, b) => b.priceRange.length - a.priceRange.length);
      break;
    case 'name':
      places.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return places;
}

function render(): void {
  const places = getFilteredSorted();
  updateMap(places);
  renderCards(places);

  const count = document.getElementById('results-count')!;
  count.textContent = `${places.length} ${places.length === 1 ? 'place' : 'places'} found`;

  const noPlaces = document.getElementById('no-places')!;
  const grid = document.getElementById('places-grid')!;
  noPlaces.classList.toggle('hidden', places.length > 0);
  grid.classList.toggle('hidden', places.length === 0);
}

function updateMap(places: Place[]): void {
  if (!map) return;
  markers.forEach((m) => m.remove());
  markers = [];

  const bounds: [number, number][] = [];

  places.forEach((place) => {
    if (!place.coordinates) return;

    const marker = L.marker([place.coordinates.lat, place.coordinates.lng], {
      icon: L.divIcon({
        className: 'place-marker',
        html: `<svg viewBox="0 0 24 32" width="20" height="27" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="dish-pin-shadow" x="-40%" y="-15%" width="180%" height="145%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.4)"/>
            </filter>
          </defs>
          <path d="M12 1C6.925 1 2.857 5.068 2.857 10.143c0 6.643 9.143 20.857 9.143 20.857s9.143-14.214 9.143-20.857C21.143 5.068 17.075 1 12 1z" fill="#e65100" filter="url(#dish-pin-shadow)"/>
          <circle cx="12" cy="10" r="4.5" fill="white"/>
        </svg>`,
        iconSize: [20, 27],
        iconAnchor: [10, 27],
        popupAnchor: [0, -27],
      }),
    });

    marker.bindTooltip(place.name, { direction: 'top', offset: [0, -8] });
    marker.on('click', () => {
      window.location.href = `/place.html?place=${place.slug}`;
    });
    marker.addTo(map!);
    markers.push(marker);
    bounds.push([place.coordinates.lat, place.coordinates.lng]);
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 12 });
  }
}

function renderCards(places: Place[]): void {
  const grid = document.getElementById('places-grid')!;
  grid.innerHTML = places
    .map(
      (place) => `
      <div class="place-card">
        <div class="place-card-image">
          ${place.imageUrl ? `<img src="${place.imageUrl}" alt="${place.name}">` : '🍽️'}
        </div>
        <div class="place-card-content">
          <h3><a href="/place.html?place=${place.slug}">${place.name}</a></h3>
          <div class="place-card-meta">
            <span>${place.city}</span>
            <span>${place.priceRange}</span>
            <span class="place-card-likes" data-likes="${place.id}"></span>
          </div>
          <div class="place-card-tags">
            ${place.cuisine.map((c) => `<span class="tag">${c}</span>`).join('')}
          </div>
        </div>
      </div>`
    )
    .join('');

  places.forEach((place) => {
    const count = likeCounts[place.id] ?? 0;
    const el = grid.querySelector<HTMLElement>(`[data-likes="${place.id}"]`);
    if (el) el.textContent = count > 0 ? `♥ ${count}` : '';
  });
}

init();
