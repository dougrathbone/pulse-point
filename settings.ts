// Application Settings

// Target GitHub Organization login name
export const TARGET_ORG: string = "orgname"; // Replace with your actual GitHub organization name

// List specific repositories within the org to analyze.
// MUST contain at least one valid repository name for the search API to work reliably.
export const TARGET_REPOS: string[] = []; // <<< REPLACE THESE with actual repo names

// --- Caching --- 
// Max age in hours for considering cached data "fresh enough" for initial load
export const CACHE_MAX_AGE_HOURS: number = 24; // Default: 1 day