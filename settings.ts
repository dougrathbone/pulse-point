// Application Settings

// Target GitHub Organization login name
export const TARGET_ORG: string = "orgname"; // Replace with your actual GitHub organization name


// Optional: List specific repositories within the org to analyze
// If null or empty array, the application will attempt to analyze all accessible repositories in the organization.
export const TARGET_REPOS: string[] | null = []; // Example: Defaults to all repos. Add specific repo names if needed: ["repo1", "repo2"]

// TEAM_MEMBERS is no longer configured here. Members are fetched dynamically from the TARGET_ORG.
