/**
 * Dishes gallery page — browse all dishes, split by user's city when available.
 */

import { getAllDishes, loadCities, type DishInfo } from './data';

let allDishes: DishInfo[] = [];
let userCityName: string | null = null;
let currentQuery = '';

async function init(): Promise<void> {
  allDishes = await getAllDishes();
  renderDishes(allDishes, null);

  // Detect city from geolocation (silent, no UI prompt)
  detectUserCity();

  const searchInput = document.getElementById('dish-search') as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    currentQuery = searchInput.value.toLowerCase().trim();
    const filtered = currentQuery
      ? allDishes.filter((d) => d.name.toLowerCase().includes(currentQuery))
      : allDishes;
    renderDishes(filtered, userCityName);
    const noResults = document.getElementById('no-dishes')!;
    noResults.classList.toggle('hidden', filtered.length > 0);
  });
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function detectUserCity(): Promise<void> {
  if (!navigator.geolocation) return;

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      const citiesData = await loadCities();
      if (!citiesData.cities.length) return;

      let nearest = citiesData.cities[0];
      let minDist = Infinity;

      for (const city of citiesData.cities) {
        const dist = haversineKm(latitude, longitude, city.coordinates.lat, city.coordinates.lng);
        if (dist < minDist) {
          minDist = dist;
          nearest = city;
        }
      }

      // Only apply city filter if a known city is within 250 km
      if (minDist < 250) {
        userCityName = nearest.name;
        const filtered = currentQuery
          ? allDishes.filter((d) => d.name.toLowerCase().includes(currentQuery))
          : allDishes;
        renderDishes(filtered, userCityName);
      }
    },
    () => { /* silent — no location access */ },
    { timeout: 8000, maximumAge: 60000 }
  );
}

function dishCardHTML(dish: DishInfo): string {
  return `
    <a href="/dish.html?dish=${encodeURIComponent(dish.name)}" class="dish-card">
      <div class="dish-card-emoji">${dish.emoji}</div>
      <h3 class="dish-card-name">${dish.name}</h3>
      <p class="dish-card-count">${dish.placeCount} ${dish.placeCount === 1 ? 'place' : 'places'}</p>
      <div class="dish-card-cities">
        ${dish.cities.slice(0, 3).map((c) => `<span class="dish-city-chip">${c}</span>`).join('')}
        ${dish.cities.length > 3 ? `<span class="dish-city-chip dish-city-more">+${dish.cities.length - 3} more</span>` : ''}
      </div>
    </a>`;
}

function renderDishes(dishes: DishInfo[], cityName: string | null): void {
  const citySection = document.getElementById('city-dishes-section')!;
  const cityTitle = document.getElementById('city-dishes-title')!;
  const cityGrid = document.getElementById('city-dishes-grid')!;
  const otherHeader = document.getElementById('other-dishes-header')!;
  const mainGrid = document.getElementById('dishes-grid')!;

  if (cityName) {
    const cityDishes = dishes.filter((d) => d.cities.includes(cityName));
    const otherDishes = dishes.filter((d) => !d.cities.includes(cityName));

    if (cityDishes.length > 0) {
      cityTitle.textContent = `Popular in ${cityName}`;
      cityGrid.innerHTML = cityDishes.map(dishCardHTML).join('');
      citySection.classList.remove('hidden');

      if (otherDishes.length > 0) {
        otherHeader.classList.remove('hidden');
        mainGrid.innerHTML = otherDishes.map(dishCardHTML).join('');
      } else {
        otherHeader.classList.add('hidden');
        mainGrid.innerHTML = '';
      }
      return;
    }
  }

  // No city or no dishes in that city — show all flat
  citySection.classList.add('hidden');
  otherHeader.classList.add('hidden');
  mainGrid.innerHTML = dishes.map(dishCardHTML).join('');
}

init();
