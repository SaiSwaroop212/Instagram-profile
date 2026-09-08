const API_URL = "https://jsonplaceholder.typicode.com/photos";

const USERNAMES = [
  "aesthetic_visuals",
  "wanderlust_nomad",
  "urban_frames",
  "minimal_tones",
  "goldenhour_moments",
  "lens_and_light",
  "daily_captures",
  "streetlife_collective",
  "chromatic_studio",
  "serene_horizon",
  "monochrome_diary",
  "velvet_vibe",
  "nordic_tales",
  "solitary_traveler",
  "prism_perspectives",
  "neon_whispers",
  "analog_nostalgia",
  "wildflower_soul"
];

const CATEGORIES = [
  "Photography",
  "Visual Arts",
  "Travel & Adventure",
  "Street Life",
  "Architecture",
  "Minimalism",
  "Portraits",
  "Nature & Wild",
  "Editorial",
  "Lifestyle & Design"
];

const HASHTAG_SETS = [
  ["#photography", "#visualsoflife", "#artofvisuals", "#lightandshadow"],
  ["#travelphotography", "#wanderlust", "#exploretheworld", "#roamtheplanet"],
  ["#streetphotography", "#citygrammers", "#urbanandstreet", "#streetclassics"],
  ["#minimalism", "#minimalzine", "#cleanandpure", "#simplicity"],
  ["#goldenhour", "#sunsetlovers", "#warmtones", "#magichour"],
  ["#lensculture", "#cinematic", "#moodygrams", "#thevisualcollective"],
  ["#architecturelovers", "#linesandforms", "#geometric", "#archdaily"],
  ["#naturevisuals", "#earthoutdoors", "#wildlifephotography", "#peacefulvibes"]
];

const TIMESTAMPS = [
  "15 MINUTES AGO",
  "45 MINUTES AGO",
  "2 HOURS AGO",
  "4 HOURS AGO",
  "7 HOURS AGO",
  "11 HOURS AGO",
  "1 DAY AGO",
  "2 DAYS AGO",
  "3 DAYS AGO",
  "5 DAYS AGO",
  "1 WEEK AGO"
];

/**
 * Format raw JSONPlaceholder photo into an Instagram post with dynamic data
 */
export function formatPost(item) {
  const userIdx = (item.id - 1) % USERNAMES.length;
  const catIdx = (item.id - 1) % CATEGORIES.length;
  const tagIdx = (item.id - 1) % HASHTAG_SETS.length;
  const timeIdx = (item.id - 1) % TIMESTAMPS.length;

  const formattedCaption =
    item.title.charAt(0).toUpperCase() + item.title.slice(1) + ".";

  return {
    id: item.id,
    albumId: item.albumId,
    title: item.title,
    caption: formattedCaption,
    username: `${USERNAMES[userIdx]}_${(item.id % 99) + 1}`,
    profileImage: `https://picsum.photos/100/100?random=${item.id + 500}`,
    category: CATEGORIES[catIdx],
    hashtags: HASHTAG_SETS[tagIdx].join(" "),
    timestamp: TIMESTAMPS[timeIdx],
    imageUrl: `https://picsum.photos/600/600?random=${item.id}`
  };
}

/**
 * Fetch paginated posts from JSONPlaceholder photos API
 * @param {number} page Page number (1-based)
 * @param {number} limit Number of posts per request (default: 9)
 */
export async function fetchPosts(page = 1, limit = 9) {
  const response = await fetch(`${API_URL}?_page=${page}&_limit=${limit}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch posts: ${response.statusText}`);
  }

  const data = await response.json();
  return data.map(formatPost);
}
