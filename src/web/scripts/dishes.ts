/**
 * Dishes gallery page — browse all dishes and search for your favourite.
 */

import { getAllDishes, initSocialData, type DishInfo } from './data';

let allDishes: DishInfo[] = [];

async function init(): Promise<void> {
  initSocialData();
  allDishes = await getAllDishes();
  renderDishes(allDishes);

  const searchInput = document.getElementById('dish-search') as HTMLInputElement;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    const filtered = q
      ? allDishes.filter((d) => d.name.toLowerCase().includes(q))
      : allDishes;
    renderDishes(filtered);
    const noResults = document.getElementById('no-dishes')!;
    noResults.classList.toggle('hidden', filtered.length > 0);
  });
}

function renderDishes(dishes: DishInfo[]): void {
  const grid = document.getElementById('dishes-grid')!;
  grid.innerHTML = dishes
    .map(
      (dish) => `
    <a href="/dish.html?dish=${encodeURIComponent(dish.name)}" class="dish-card">
      <div class="dish-card-emoji">${dish.emoji}</div>
      <h3 class="dish-card-name">${dish.name}</h3>
      <p class="dish-card-count">${dish.placeCount} ${dish.placeCount === 1 ? 'place' : 'places'}</p>
      <div class="dish-card-cities">
        ${dish.cities
          .slice(0, 3)
          .map((c) => `<span class="dish-city-chip">${c}</span>`)
          .join('')}
        ${dish.cities.length > 3 ? `<span class="dish-city-chip dish-city-more">+${dish.cities.length - 3} more</span>` : ''}
      </div>
    </a>
  `
    )
    .join('');
}

init();
