# Street Food India

A TripAdvisor-style static website for Indian street food reviews, featuring an interactive India map with city markers, city-wise food place listings, user ratings/reviews, and individual place maps.

## Features

### Website
- **Interactive India Map**: Leaflet.js powered map with city markers
- **City Pages**: Browse street food spots by city with filtering and sorting
- **Place Pages**: Detailed place info with maps, reviews, and ratings
- **User Reviews**: Star ratings and text reviews (stored in localStorage)
- **Responsive Design**: Works on desktop and mobile

### Data Pipeline
- **YouTube Scraper**: Extract video metadata and transcripts from food vlog channels
- **Data Processor**: Transform raw YouTube data into structured place/city data
- **Image Fetcher**: Download images via Google Custom Search API
- **Geocoding**: Convert addresses to coordinates via Google Maps API

## Quick Start

```bash
# Install dependencies
npm install

# Generate sample data
npm run process

# Start development server
npm run web:dev
```

The website will open at http://localhost:3000

## Full Pipeline

### 1. Scrape YouTube Data

```bash
# Full pipeline from a YouTube channel
npm run dev -- --channel @delhifoodwalks

# Individual steps
npm run dev -- --channel @delhifoodwalks --step playlists
npm run dev -- --channel @delhifoodwalks --step videos
npm run dev -- --channel @delhifoodwalks --step transcripts

# Resume interrupted run
npm run dev -- --channel @delhifoodwalks --resume
```

### 2. Process Data

```bash
# Process scraped data into places and cities
npm run process

# With geocoding (requires GOOGLE_MAPS_API_KEY)
npm run process:geocode
```

### 3. Fetch Images (Optional)

```bash
# Fetch images for all places (requires Google Search API)
npm run fetch-images

# Force refresh all images
npm run fetch-images:force
```

### 4. Build Website

```bash
# Development server with hot reload
npm run web:dev

# Production build
npm run web:build

# Preview production build
npm run web:preview
```

## Project Structure

```
street-food-map/
├── src/
│   ├── scraper/              # YouTube scraper (existing)
│   │   ├── config.ts
│   │   ├── types.ts
│   │   ├── youtubeClient.ts
│   │   ├── transcriptFetcher.ts
│   │   ├── scraper.ts
│   │   └── main.ts
│   ├── processor/            # Data processor
│   │   ├── types.ts          # Place/City interfaces
│   │   ├── extractor.ts      # Extract places from videos
│   │   ├── geocoder.ts       # Address to coordinates
│   │   └── processor.ts      # Main orchestration
│   ├── imageFetcher.ts       # Google image search
│   └── web/                  # Website source
│       ├── index.html        # Homepage
│       ├── city.html         # City page
│       ├── place.html        # Place page
│       ├── styles/
│       │   └── main.css
│       ├── scripts/
│       │   ├── data.ts       # Data loading & reviews
│       │   ├── home.ts       # Homepage logic
│       │   ├── city.ts       # City page logic
│       │   └── place.ts      # Place page logic
│       └── public/
│           └── data/         # JSON data for website
├── data/
│   ├── raw/                  # Scraped YouTube data
│   ├── processed/            # Structured place/city data
│   └── images/               # Cached images
├── dist/
│   └── web/                  # Built website
├── scripts/
│   └── copy-data.js          # Copy data to web public
└── package.json
```

## Configuration

Create a `.env` file from the template:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `YOUTUBE_API_KEY` | For scraping | YouTube Data API v3 key |
| `GOOGLE_SEARCH_API_KEY` | For images | Google Custom Search API key |
| `GOOGLE_SEARCH_CX` | For images | Custom Search Engine ID |
| `GOOGLE_MAPS_API_KEY` | For geocoding | Google Maps Geocoding API key |

### Getting API Keys

1. **YouTube API Key**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Enable YouTube Data API v3
2. **Google Search API**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Enable Custom Search API
3. **Google Search CX**: [Programmable Search Engine](https://programmablesearchengine.google.com/) → Create new engine
4. **Google Maps API**: [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → Enable Geocoding API

## Data Schema

### places.json
```json
{
  "generatedAt": "2024-01-15T10:00:00.000Z",
  "totalPlaces": 15,
  "places": [
    {
      "id": "sita-ram-diwan-chand-delhi-abc123",
      "name": "Sita Ram Diwan Chand",
      "slug": "sita-ram-diwan-chand-delhi",
      "city": "Delhi",
      "citySlug": "delhi",
      "address": "2243, Rajguru Marg, Chuna Mandi, Paharganj",
      "cuisine": ["North Indian", "Street Food"],
      "coordinates": { "lat": 28.6447, "lng": 77.2107 },
      "dishes": ["Chole Bhature"],
      "priceRange": "₹",
      "sourceVideoId": "abc123",
      "sourceVideoTitle": "Best Chole Bhature in Delhi"
    }
  ]
}
```

### cities.json
```json
{
  "generatedAt": "2024-01-15T10:00:00.000Z",
  "totalCities": 7,
  "cities": [
    {
      "id": "delhi",
      "name": "Delhi",
      "slug": "delhi",
      "state": "Delhi",
      "coordinates": { "lat": 28.6139, "lng": 77.209 },
      "placeCount": 3
    }
  ]
}
```

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run YouTube scraper |
| `npm run process` | Process raw data into places/cities |
| `npm run process:geocode` | Process with address geocoding |
| `npm run fetch-images` | Fetch images via Google Search |
| `npm run web:dev` | Start website dev server |
| `npm run web:build` | Build website for production |
| `npm run web:preview` | Preview production build |
| `npm run copy-data` | Copy data to web public dir |
| `npm run build` | Compile TypeScript |
| `npm run typecheck` | Type check without emitting |

## Tech Stack

- **Backend**: TypeScript, Node.js
- **Frontend**: Vanilla TypeScript, Vite
- **Maps**: Leaflet.js (free, no API key needed)
- **Styling**: CSS Grid/Flexbox, CSS Variables
- **Storage**: localStorage for user reviews

## Notes

- No YouTube channel/YouTuber references on the website
- All content presented as independent food reviews
- Images sourced via Google Search (not YouTube thumbnails)
- User reviews are device-specific (localStorage)

## License

MIT
