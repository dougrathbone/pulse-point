import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config(); // Load environment variables from .env file

const githubToken = process.env.GITHUB_TOKEN;

if (!githubToken) {
  console.warn('GITHUB_TOKEN environment variable not set. GitHub API calls will be unauthenticated.');
}

const octokit = new Octokit({
  auth: githubToken,
  // Optional: Add user agent
  userAgent: 'PulsePointApp v1.0.0',
});

/**
 * Fetches basic repository information.
 * @param owner The repository owner.
 * @param repo The repository name.
 */
export const getRepoInfo = async (owner: string, repo: string) => {
  try {
    const response = await octokit.repos.get({
      owner,
      repo,
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching repo info for ${owner}/${repo}:`, error);
    throw error;
  }
};

/**
 * Fetches commits for a repository within a given date range.
 * @param owner The repository owner.
 * @param repo The repository name.
 * @param since ISO 8601 timestamp for the start of the date range.
 * @param until ISO 8601 timestamp for the end of the date range.
 * @param per_page Number of results per page (max 100).
 * @param page Page number.
 */
export const getCommits = async (owner: string, repo: string, since?: string, until?: string, per_page: number = 30, page: number = 1) => {
  try {
    // Use listForRepo for consistency, even though `list` is deprecated
    // The modern equivalent might require pagination handling
    const response = await octokit.repos.listCommits({
      owner,
      repo,
      since,
      until,
      per_page,
      page,
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching commits for ${owner}/${repo}:`, error);
    throw error;
  }
};

/**
 * Fetches pull requests for a repository.
 * @param owner The repository owner.
 * @param repo The repository name.
 * @param state Filter by state: open, closed, or all. Defaults to 'open'.
 * @param per_page Number of results per page (max 100).
 * @param page Page number.
 */
export const getPullRequests = async (owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open', per_page: number = 30, page: number = 1) => {
  try {
    const response = await octokit.pulls.list({
      owner,
      repo,
      state,
      per_page,
      page,
      sort: 'updated', // Sort by most recently updated
      direction: 'desc',
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching pull requests for ${owner}/${repo}:`, error);
    throw error;
  }
};

// Add more functions here for fetching issues, etc.

export default octokit; // Export the initialized client if needed elsewhere 