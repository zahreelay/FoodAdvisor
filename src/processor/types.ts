/**
 * Type definitions for processed street food data.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  name: string;
  slug: string;
  city: string;
  citySlug: string;
  address: string;
  cuisine: string[];
  coordinates: Coordinates | null;
  dishes: string[];
  priceRange: string;
  sourceVideoId: string;
  sourceVideoTitle: string;
  description?: string;
  imageUrl?: string;
}

export interface PlacesData {
  generatedAt: string;
  totalPlaces: number;
  places: Place[];
}

export interface City {
  id: string;
  name: string;
  slug: string;
  state: string;
  coordinates: Coordinates;
  placeCount: number;
}

export interface CitiesData {
  generatedAt: string;
  totalCities: number;
  cities: City[];
}

// City coordinates for major Indian cities
export const CITY_COORDINATES: Record<string, { coordinates: Coordinates; state: string }> = {
  delhi: { coordinates: { lat: 28.6139, lng: 77.209 }, state: "Delhi" },
  mumbai: { coordinates: { lat: 19.076, lng: 72.8777 }, state: "Maharashtra" },
  kolkata: { coordinates: { lat: 22.5726, lng: 88.3639 }, state: "West Bengal" },
  chennai: { coordinates: { lat: 13.0827, lng: 80.2707 }, state: "Tamil Nadu" },
  bangalore: { coordinates: { lat: 12.9716, lng: 77.5946 }, state: "Karnataka" },
  bengaluru: { coordinates: { lat: 12.9716, lng: 77.5946 }, state: "Karnataka" },
  hyderabad: { coordinates: { lat: 17.385, lng: 78.4867 }, state: "Telangana" },
  ahmedabad: { coordinates: { lat: 23.0225, lng: 72.5714 }, state: "Gujarat" },
  pune: { coordinates: { lat: 18.5204, lng: 73.8567 }, state: "Maharashtra" },
  jaipur: { coordinates: { lat: 26.9124, lng: 75.7873 }, state: "Rajasthan" },
  lucknow: { coordinates: { lat: 26.8467, lng: 80.9462 }, state: "Uttar Pradesh" },
  kanpur: { coordinates: { lat: 26.4499, lng: 80.3319 }, state: "Uttar Pradesh" },
  nagpur: { coordinates: { lat: 21.1458, lng: 79.0882 }, state: "Maharashtra" },
  indore: { coordinates: { lat: 22.7196, lng: 75.8577 }, state: "Madhya Pradesh" },
  bhopal: { coordinates: { lat: 23.2599, lng: 77.4126 }, state: "Madhya Pradesh" },
  patna: { coordinates: { lat: 25.5941, lng: 85.1376 }, state: "Bihar" },
  vadodara: { coordinates: { lat: 22.3072, lng: 73.1812 }, state: "Gujarat" },
  surat: { coordinates: { lat: 21.1702, lng: 72.8311 }, state: "Gujarat" },
  agra: { coordinates: { lat: 27.1767, lng: 78.0081 }, state: "Uttar Pradesh" },
  varanasi: { coordinates: { lat: 25.3176, lng: 82.9739 }, state: "Uttar Pradesh" },
  banaras: { coordinates: { lat: 25.3176, lng: 82.9739 }, state: "Uttar Pradesh" },
  amritsar: { coordinates: { lat: 31.634, lng: 74.8723 }, state: "Punjab" },
  ludhiana: { coordinates: { lat: 30.901, lng: 75.8573 }, state: "Punjab" },
  chandigarh: { coordinates: { lat: 30.7333, lng: 76.7794 }, state: "Chandigarh" },
  coimbatore: { coordinates: { lat: 11.0168, lng: 76.9558 }, state: "Tamil Nadu" },
  madurai: { coordinates: { lat: 9.9252, lng: 78.1198 }, state: "Tamil Nadu" },
  kochi: { coordinates: { lat: 9.9312, lng: 76.2673 }, state: "Kerala" },
  cochin: { coordinates: { lat: 9.9312, lng: 76.2673 }, state: "Kerala" },
  thiruvananthapuram: { coordinates: { lat: 8.5241, lng: 76.9366 }, state: "Kerala" },
  trivandrum: { coordinates: { lat: 8.5241, lng: 76.9366 }, state: "Kerala" },
  visakhapatnam: { coordinates: { lat: 17.6868, lng: 83.2185 }, state: "Andhra Pradesh" },
  vizag: { coordinates: { lat: 17.6868, lng: 83.2185 }, state: "Andhra Pradesh" },
  guwahati: { coordinates: { lat: 26.1445, lng: 91.7362 }, state: "Assam" },
  bhubaneswar: { coordinates: { lat: 20.2961, lng: 85.8245 }, state: "Odisha" },
  ranchi: { coordinates: { lat: 23.3441, lng: 85.3096 }, state: "Jharkhand" },
  goa: { coordinates: { lat: 15.2993, lng: 74.124 }, state: "Goa" },
  panaji: { coordinates: { lat: 15.4909, lng: 73.8278 }, state: "Goa" },
  shimla: { coordinates: { lat: 31.1048, lng: 77.1734 }, state: "Himachal Pradesh" },
  manali: { coordinates: { lat: 32.2396, lng: 77.1887 }, state: "Himachal Pradesh" },
  dehradun: { coordinates: { lat: 30.3165, lng: 78.0322 }, state: "Uttarakhand" },
  rishikesh: { coordinates: { lat: 30.0869, lng: 78.2676 }, state: "Uttarakhand" },
  jodhpur: { coordinates: { lat: 26.2389, lng: 73.0243 }, state: "Rajasthan" },
  udaipur: { coordinates: { lat: 24.5854, lng: 73.7125 }, state: "Rajasthan" },
  jaisalmer: { coordinates: { lat: 26.9157, lng: 70.9083 }, state: "Rajasthan" },
  ajmer: { coordinates: { lat: 26.4499, lng: 74.6399 }, state: "Rajasthan" },
  pushkar: { coordinates: { lat: 26.4897, lng: 74.5511 }, state: "Rajasthan" },
  mysore: { coordinates: { lat: 12.2958, lng: 76.6394 }, state: "Karnataka" },
  mysuru: { coordinates: { lat: 12.2958, lng: 76.6394 }, state: "Karnataka" },
  mangalore: { coordinates: { lat: 12.9141, lng: 74.856 }, state: "Karnataka" },
  udupi: { coordinates: { lat: 13.3409, lng: 74.7421 }, state: "Karnataka" },
  gwalior: { coordinates: { lat: 26.2183, lng: 78.1828 }, state: "Madhya Pradesh" },
  ujjain: { coordinates: { lat: 23.1765, lng: 75.7885 }, state: "Madhya Pradesh" },
  allahabad: { coordinates: { lat: 25.4358, lng: 81.8463 }, state: "Uttar Pradesh" },
  prayagraj: { coordinates: { lat: 25.4358, lng: 81.8463 }, state: "Uttar Pradesh" },
  mathura: { coordinates: { lat: 27.4924, lng: 77.6737 }, state: "Uttar Pradesh" },
  vrindavan: { coordinates: { lat: 27.5803, lng: 77.6959 }, state: "Uttar Pradesh" },
  noida: { coordinates: { lat: 28.5355, lng: 77.391 }, state: "Uttar Pradesh" },
  gurgaon: { coordinates: { lat: 28.4595, lng: 77.0266 }, state: "Haryana" },
  gurugram: { coordinates: { lat: 28.4595, lng: 77.0266 }, state: "Haryana" },
  faridabad: { coordinates: { lat: 28.4089, lng: 77.3178 }, state: "Haryana" },
  meerut: { coordinates: { lat: 28.9845, lng: 77.7064 }, state: "Uttar Pradesh" },
  aligarh: { coordinates: { lat: 27.8974, lng: 78.088 }, state: "Uttar Pradesh" },
  bareilly: { coordinates: { lat: 28.367, lng: 79.4304 }, state: "Uttar Pradesh" },
  moradabad: { coordinates: { lat: 28.8386, lng: 78.7733 }, state: "Uttar Pradesh" },
  jalandhar: { coordinates: { lat: 31.326, lng: 75.5762 }, state: "Punjab" },
  patiala: { coordinates: { lat: 30.34, lng: 76.3869 }, state: "Punjab" },
  bathinda: { coordinates: { lat: 30.211, lng: 74.9455 }, state: "Punjab" },
  jammu: { coordinates: { lat: 32.7266, lng: 74.857 }, state: "Jammu and Kashmir" },
  srinagar: { coordinates: { lat: 34.0837, lng: 74.7973 }, state: "Jammu and Kashmir" },
  leh: { coordinates: { lat: 34.1526, lng: 77.5771 }, state: "Ladakh" },
  darjeeling: { coordinates: { lat: 27.0361, lng: 88.2627 }, state: "West Bengal" },
  siliguri: { coordinates: { lat: 26.7271, lng: 88.6393 }, state: "West Bengal" },
  howrah: { coordinates: { lat: 22.5958, lng: 88.2636 }, state: "West Bengal" },
  cuttack: { coordinates: { lat: 20.4625, lng: 85.883 }, state: "Odisha" },
  rourkela: { coordinates: { lat: 22.2604, lng: 84.8536 }, state: "Odisha" },
  raipur: { coordinates: { lat: 21.2514, lng: 81.6296 }, state: "Chhattisgarh" },
  bilaspur: { coordinates: { lat: 22.0797, lng: 82.1391 }, state: "Chhattisgarh" },
  nashik: { coordinates: { lat: 20.0063, lng: 73.7899 }, state: "Maharashtra" },
  aurangabad: { coordinates: { lat: 19.8762, lng: 75.3433 }, state: "Maharashtra" },
  kolhapur: { coordinates: { lat: 16.705, lng: 74.2433 }, state: "Maharashtra" },
  solapur: { coordinates: { lat: 17.6599, lng: 75.9064 }, state: "Maharashtra" },
  rajkot: { coordinates: { lat: 22.3039, lng: 70.8022 }, state: "Gujarat" },
  bhavnagar: { coordinates: { lat: 21.7645, lng: 72.1519 }, state: "Gujarat" },
  jamnagar: { coordinates: { lat: 22.4707, lng: 70.0577 }, state: "Gujarat" },
  gandhinagar: { coordinates: { lat: 23.2156, lng: 72.6369 }, state: "Gujarat" },
  tirupati: { coordinates: { lat: 13.6288, lng: 79.4192 }, state: "Andhra Pradesh" },
  vijayawada: { coordinates: { lat: 16.5062, lng: 80.648 }, state: "Andhra Pradesh" },
  warangal: { coordinates: { lat: 17.9689, lng: 79.5941 }, state: "Telangana" },
  secunderabad: { coordinates: { lat: 17.4399, lng: 78.4983 }, state: "Telangana" },
  pondicherry: { coordinates: { lat: 11.9416, lng: 79.8083 }, state: "Puducherry" },
  puducherry: { coordinates: { lat: 11.9416, lng: 79.8083 }, state: "Puducherry" },
  ooty: { coordinates: { lat: 11.4102, lng: 76.695 }, state: "Tamil Nadu" },
  kodaikanal: { coordinates: { lat: 10.2381, lng: 77.4892 }, state: "Tamil Nadu" },
  thanjavur: { coordinates: { lat: 10.787, lng: 79.1378 }, state: "Tamil Nadu" },
  trichy: { coordinates: { lat: 10.7905, lng: 78.7047 }, state: "Tamil Nadu" },
  tiruchirappalli: { coordinates: { lat: 10.7905, lng: 78.7047 }, state: "Tamil Nadu" },
  salem: { coordinates: { lat: 11.6643, lng: 78.146 }, state: "Tamil Nadu" },
  vellore: { coordinates: { lat: 12.9165, lng: 79.1325 }, state: "Tamil Nadu" },
  munnar: { coordinates: { lat: 10.0889, lng: 77.0595 }, state: "Kerala" },
  alleppey: { coordinates: { lat: 9.4981, lng: 76.3388 }, state: "Kerala" },
  alappuzha: { coordinates: { lat: 9.4981, lng: 76.3388 }, state: "Kerala" },
  kozhikode: { coordinates: { lat: 11.2588, lng: 75.7804 }, state: "Kerala" },
  calicut: { coordinates: { lat: 11.2588, lng: 75.7804 }, state: "Kerala" },
  thrissur: { coordinates: { lat: 10.5276, lng: 76.2144 }, state: "Kerala" },
  kannur: { coordinates: { lat: 11.8745, lng: 75.3704 }, state: "Kerala" },
};

// Common cuisine types in Indian street food
export const CUISINE_KEYWORDS: Record<string, string[]> = {
  "North Indian": ["paratha", "chole", "bhature", "kulcha", "naan", "dal", "paneer", "lassi", "rajma", "butter chicken"],
  "South Indian": ["dosa", "idli", "vada", "sambar", "uttapam", "appam", "puttu", "upma", "pongal", "rasam"],
  "Chaat": ["chaat", "pani puri", "golgappa", "bhel", "sev puri", "dahi puri", "papdi", "aloo tikki", "samosa"],
  "Biryani": ["biryani", "pulao", "tehri"],
  "Mughlai": ["kebab", "seekh", "tikka", "korma", "nihari", "haleem"],
  "Bengali": ["fish", "mishti doi", "rasgulla", "sandesh", "kathi roll", "jhalmuri"],
  "Gujarati": ["dhokla", "fafda", "jalebi", "thepla", "khandvi", "khakhra", "undhiyu"],
  "Rajasthani": ["dal baati", "churma", "ker sangri", "gatte", "pyaaz kachori"],
  "Maharashtrian": ["vada pav", "misal", "poha", "sabudana", "puran poli", "pav bhaji"],
  "Punjabi": ["makki", "sarson", "lassi", "kulfi", "paratha", "amritsari"],
  "Street Food": ["momos", "rolls", "frankie", "sandwich", "pav", "bhaji", "pakora", "bhajiya"],
  "Sweets": ["jalebi", "gulab jamun", "ladoo", "barfi", "halwa", "kheer", "rabri", "kulfi", "falooda"],
  "Beverages": ["chai", "tea", "lassi", "sharbat", "nimbu pani", "sugarcane", "juice", "milk"],
};
