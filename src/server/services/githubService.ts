import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import { RequestError } from "@octokit/request-error"; // Import Octokit error type
import { readCache, writeCache } from '../utils/cache'; // Import cache utils

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

// --- Custom Error for SAML SSO ---
export class SamlSsoError extends Error {
  ssoUrl: string;
  status: number;

  constructor(message: string, ssoUrl: string) {
    super(message);
    this.name = 'SamlSsoError';
    this.ssoUrl = ssoUrl;
    this.status = 403; // Or 401, depending on how frontend handles it
  }
}
// --- End Custom Error ---

/**
 * Checks an error from Octokit to see if it's a SAML SSO error.
 * If it is, throws a custom SamlSsoError.
 * Otherwise, re-throws the original error.
 */
const handleOctokitError = (error: unknown, context: string) => {
    console.error(`${context}:`, error);
    if (error instanceof RequestError && error.status === 403) {
        const ssoHeader = error.response?.headers?.['x-github-sso'];
        if (typeof ssoHeader === 'string' && ssoHeader.startsWith('required')) {
            // Extract the URL part
            const urlMatch = ssoHeader.match(/url=([^;]+)/);
            const ssoUrl = urlMatch?.[1];
            if (ssoUrl) {
                console.warn(`GitHub SAML SSO required. URL: ${ssoUrl}`);
                throw new SamlSsoError(
                    'Resource protected by organization SAML enforcement. Please authenticate via the provided URL.',
                    ssoUrl
                );
            }
        }
    }
    // Handle 404 specifically for clarity
    if (error instanceof RequestError && error.status === 404) {
        throw new Error(`GitHub resource not found (404). Check organization/repo names and token permissions.`);
    }
    // Rethrow original error if not handled
    throw error; 
};

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

// Define a type for the enriched member data
interface OrgMember {
    login: string;
    name?: string | null; // GitHub user name can be null
}

// --- Cache Settings ---
const MEMBERS_CACHE_TTL = 1 * 60 * 60 * 1000; // 1 hour
const REPOS_CACHE_TTL = 1 * 60 * 60 * 1000; // 1 hour
const COMMITS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const USER_DATA_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for user-specific data
// --- End Cache Settings ---

/**
 * Fetches members (login and name) of a GitHub organization.
 * Handles SAML SSO redirection errors.
 * Uses caching.
 */
export const getOrgMembers = async (org: string): Promise<OrgMember[]> => {
  const cacheKey = `org-${org}-members-with-names`; // Update cache key
  const cachedMembers = await readCache<OrgMember[]>(cacheKey, MEMBERS_CACHE_TTL);
  if (cachedMembers) {
    console.log(`Cache hit for members (with names) of org: ${org}`);
    return cachedMembers;
  }
  
  console.log(`Cache miss for members (with names) of org: ${org}. Fetching from API...`);
  try {
    console.log(`Fetching members for organization: ${org}...`);
    const membersList = await octokit.paginate(octokit.orgs.listMembers, { org, per_page: 100 });
    console.log(`Found ${membersList.length} members in ${org}. Fetching names...`);

    // Fetch full profile for each member to get the name
    // Warning: This can be slow and use many API calls for large orgs!
    // Consider fetching names only when needed or using alternative methods if performance is critical.
    const membersWithNames: OrgMember[] = await Promise.all(
        membersList.map(async (member) => {
            try {
                const userProfile = await octokit.users.getByUsername({ username: member.login });
                return { login: member.login, name: userProfile.data.name };
            } catch (userError) {
                console.error(`Failed to fetch profile for ${member.login}:`, userError);
                return { login: member.login, name: null }; // Default if profile fetch fails
            }
        })
    );
    
    await writeCache(cacheKey, membersWithNames); // Write to cache on success
    return membersWithNames;
  } catch (error) {
    handleOctokitError(error, `Error fetching members for org ${org}`);
    throw new Error('Unhandled error in getOrgMembers after error handler.');
  }
};

/**
 * Fetches repositories for a GitHub organization.
 * Handles SAML SSO redirection errors.
 * Uses caching.
 */
export const getOrgRepos = async (org: string): Promise<{ name: string }[]> => {
    const cacheKey = `org-${org}-repos`;
    const cachedRepos = await readCache<{ name: string }[]>(cacheKey, REPOS_CACHE_TTL);
    if (cachedRepos) {
        console.log(`Cache hit for repos of org: ${org}`);
        return cachedRepos;
    }
    
    console.log(`Cache miss for repos of org: ${org}. Fetching from API...`);
    try {
        console.log(`Fetching repositories for organization: ${org}...`);
        const repos = await octokit.paginate(octokit.repos.listForOrg, {
            org, type: 'all', per_page: 100,
        });
        console.log(`Found ${repos.length} repositories in ${org}.`);
        const repoNames = repos.map(repo => ({ name: repo.name }));
        
        await writeCache(cacheKey, repoNames); // Write to cache
        return repoNames;
    } catch (error) {
        handleOctokitError(error, `Error fetching repositories for org ${org}`);
        throw new Error('Unhandled error in getOrgRepos after error handler.');
    }
};

/**
 * Fetches commits for organization members across specified repositories within a date range.
 * Uses caching for the final aggregated commit list.
 */
export const getOrgMemberCommits = async (org: string, targetRepos: string[] | null, since?: string, until?: string): Promise<any[]> => {
  // Generate a cache key based on parameters
  // Sort targetRepos to ensure cache key consistency if order changes but content doesn't
  const repoKeyPart = targetRepos && targetRepos.length > 0 ? [...targetRepos].sort().join('_') : 'all';
  const sinceKeyPart = since ? new Date(since).toISOString().split('T')[0] : 'start'; // Use date part
  const untilKeyPart = until ? new Date(until).toISOString().split('T')[0] : 'now'; // Use date part
  const cacheKey = `org-${org}-commits-repos_${repoKeyPart}-since_${sinceKeyPart}-until_${untilKeyPart}`;

  const cachedCommits = await readCache<any[]>(cacheKey, COMMITS_CACHE_TTL);
  if (cachedCommits) {
    console.log(`Cache hit for aggregated org commits: ${cacheKey}`);
    return cachedCommits;
  }

  console.log(`Cache miss for aggregated org commits: ${cacheKey}. Fetching from API...`);

  let orgMembers: { login: string }[] = [];
  try {
    orgMembers = await getOrgMembers(org);
  } catch (error) {
    console.error(`Failed to get org members for ${org}, cannot fetch commits.`);
    throw error; 
  }
  const memberLogins = new Set(orgMembers.map(m => m.login.toLowerCase()));

  let reposToScan: string[];
  if (targetRepos && targetRepos.length > 0) {
    reposToScan = targetRepos;
    console.log(`Using specified target repositories: ${reposToScan.join(', ')}`);
  } else {
    try {
      const allOrgRepos = await getOrgRepos(org);
      reposToScan = allOrgRepos.map(r => r.name);
      console.log(`No target repos specified, scanning all ${reposToScan.length} fetched organization repositories.`);
    } catch (error) {
      console.error(`Failed to get organization repositories for ${org}. Cannot fetch commits.`);
      throw error;
    }
  }

  let allMatchingCommits: any[] = []; 

  console.log(`Fetching commits for ${memberLogins.size} members across ${reposToScan.length} repos...`);

  // Limit concurrent requests to avoid hitting secondary rate limits or using too many resources
  const MAX_CONCURRENT_REPO_FETCHES = 5; 
  const repoQueue = [...reposToScan]; // Clone array to use as a queue
  let activeFetches = 0;

  const processQueue = async (): Promise<void> => {
    while (repoQueue.length > 0 && activeFetches < MAX_CONCURRENT_REPO_FETCHES) {
        activeFetches++;
        const repo = repoQueue.shift();
        if (!repo) continue;

        // Use the updated helper which includes SAML check per repo fetch
        fetchCommitsForRepo(org, repo, memberLogins, since, until)
            .then(commits => {
                allMatchingCommits.push(...commits);
            })
            .catch(error => {
                // If fetchCommitsForRepo throws (e.g., SAML error), it should be caught here
                // But the primary SAML check happens earlier. Log other potential errors.
                console.error(`Error processing repo ${org}/${repo} in queue:`, error)
            })
            .finally(() => {
                activeFetches--;
                processQueue(); 
            });
    }
  };
  
  // Helper function to fetch commits for a single repo, WITH SAML check
  const fetchCommitsForRepo = async (org: string, repo: string, memberLogins: Set<string>, since?: string, until?: string): Promise<any[]> => {
      console.log(`Processing repo: ${org}/${repo}`);
      let page = 1;
      const per_page = 100;
      const repoCommits = [];
      try {
          while (true) {
              // console.log(`Fetching page ${page} of commits for ${org}/${repo}...`);
              const response = await octokit.repos.listCommits({
                  owner: org, repo, since, until, per_page, page,
              });
              if (response.data.length === 0) break;
              const pageMemberCommits = response.data.filter(commit =>
                  commit.author && memberLogins.has(commit.author.login.toLowerCase())
              );
              repoCommits.push(...pageMemberCommits);
              if (response.data.length < per_page) break;
              page++;
          }
      } catch (error) {
          // Check if this specific repo fetch failed due to SAML/permissions
          handleOctokitError(error, `Error fetching commits for repo ${org}/${repo}`);
          // If handleOctokitError didn't throw (i.e., not SAML), log and return empty for this repo
          console.error(`Non-SAML error fetching commits for repo ${org}/${repo}, skipping repo:`, (error as Error).message);
      }
      return repoCommits;
  }

  // Start processing the queue concurrently
  const initialProcesses = Array(MAX_CONCURRENT_REPO_FETCHES).fill(null).map(() => processQueue());
  await Promise.all(initialProcesses); // Wait for initial wave

  // Wait for any remaining fetches to complete (activeFetches should drop to 0)
  while(activeFetches > 0) { 
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to prevent busy-waiting
  }

  console.log(`Finished fetching for cache key ${cacheKey}. Found ${allMatchingCommits.length} total commits.`);
  await writeCache(cacheKey, allMatchingCommits); // Cache the final result

  return allMatchingCommits;
};

/**
 * Searches for commits by a specific author within an org and optional repos.
 */
export const searchUserCommits = async (org: string, username: string, targetRepos: string[] | null, since?: string, until?: string): Promise<any[]> => {
    const repoQualifier = targetRepos && targetRepos.length > 0 
        ? targetRepos.map(repo => `repo:${org}/${repo}`).join(' ') 
        : `org:${org}`;
    const dateQualifier = since ? `committer-date:>${since}` : ''; // Adjust if using `author-date`
    // Note: GitHub search API date range format differs slightly from commits endpoint.
    // It might be simpler to filter by date after fetching if precise range is needed.
    
    const query = `author:${username} ${repoQualifier} ${dateQualifier}`;
    const cacheKey = `user-${username}-commits-query_${Buffer.from(query).toString('base64')}`; // Basic cache key from query

    const cachedCommits = await readCache<any[]>(cacheKey, USER_DATA_CACHE_TTL);
    if (cachedCommits) {
        console.log(`Cache hit for user commits: ${username}`);
        return cachedCommits;
    }

    console.log(`Cache miss for user commits: ${username}. Query: ${query}`);
    try {
        const results = await octokit.paginate(octokit.search.commits, {
            q: query,
            sort: 'committer-date', // or author-date
            order: 'desc',
            per_page: 100,
        });
        await writeCache(cacheKey, results);
        return results;
    } catch (error) {
        handleOctokitError(error, `Error searching commits for user ${username}`);
        throw new Error('Unhandled error in searchUserCommits after error handler.');
    }
};

/**
 * Searches for issues and PRs created by a specific author within an org and optional repos.
 */
export const searchUserIssuesAndPRs = async (org: string, username: string, targetRepos: string[] | null, since?: string, until?: string): Promise<any[]> => {
    const repoQualifier = targetRepos && targetRepos.length > 0 
        ? targetRepos.map(repo => `repo:${org}/${repo}`).join(' ') 
        : `org:${org}`;
    const dateQualifier = since ? `created:>${since}` : '';
    // Combine issue and PR search
    const query = `author:${username} ${repoQualifier} ${dateQualifier}`;
    const cacheKey = `user-${username}-issuesprs-query_${Buffer.from(query).toString('base64')}`;

    const cachedIssues = await readCache<any[]>(cacheKey, USER_DATA_CACHE_TTL);
    if (cachedIssues) {
        console.log(`Cache hit for user issues/PRs: ${username}`);
        return cachedIssues;
    }

    console.log(`Cache miss for user issues/PRs: ${username}. Query: ${query}`);
    try {
        const results = await octokit.paginate(octokit.search.issuesAndPullRequests, {
            q: query,
            sort: 'created',
            order: 'desc',
            per_page: 100,
        });
        await writeCache(cacheKey, results);
        return results;
    } catch (error) {
        handleOctokitError(error, `Error searching issues/PRs for user ${username}`);
        throw new Error('Unhandled error in searchUserIssuesAndPRs after error handler.');
    }
};

// Add more functions here for fetching issues, etc.

export default octokit; // Export the initialized client if needed elsewhere 