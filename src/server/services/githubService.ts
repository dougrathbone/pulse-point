import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import { RequestError } from "@octokit/request-error"; // Import Octokit error type
import { readCache, writeCache } from '../utils/cache'; // Correct path

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

// --- Custom Error for Rate Limit ---
export class RateLimitError extends Error {
    resetTimestamp: number | null;
    status: number;

    constructor(message: string, resetTimestamp: number | null) {
        super(message);
        this.name = 'RateLimitError';
        this.resetTimestamp = resetTimestamp; 
        this.status = 429; // Use 429 status code
    }
}
// --- End Custom Error ---

/**
 * Checks an error from Octokit for SAML SSO or Rate Limit errors.
 */
const handleOctokitError = (error: unknown, context: string) => {
    console.error(`${context}:`, error);
    if (error instanceof RequestError && error.status === 403) {
        // Check for SAML SSO
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
        
        // Check for Rate Limit (Primary or Secondary)
        const rateLimitRemaining = error.response?.headers?.['x-ratelimit-remaining'];
        if (rateLimitRemaining === '0') { // Check if remaining is 0
            const resetTimestampHeader = error.response?.headers?.['x-ratelimit-reset'];
            const resetTimestamp = resetTimestampHeader ? parseInt(resetTimestampHeader, 10) * 1000 : null; // Convert epoch seconds to ms
            const message = (error.response?.data as any)?.message || 'GitHub API rate limit exceeded.';
            console.warn(`GitHub Rate Limit Hit. Resets at: ${resetTimestamp ? new Date(resetTimestamp).toISOString() : 'Unknown'}`);
            throw new RateLimitError(message, resetTimestamp);
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
export interface OrgMember {
    login: string;
    name?: string | null; // GitHub user name can be null
}

// --- Cache Settings ---
const MEMBERS_CACHE_TTL = 1 * 60 * 60 * 1000; // 1 hour
const REPOS_CACHE_TTL = 1 * 60 * 60 * 1000; // 1 hour
const COMMITS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
const USER_DATA_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for user-specific data
// Define TTLs for aggregated activity data
export const ORG_ACTIVITY_CACHE_TTL = 15 * 60 * 1000; // 15 minutes
export const USER_ACTIVITY_CACHE_TTL = 15 * 60 * 1000; // 15 minutes for individual user detail fetches
// --- End Cache Settings ---

/**
 * Fetches members (login and name) of a GitHub organization.
 * Handles SAML SSO redirection errors.
 * Uses caching.
 */
export const getOrgMembers = async (org: string): Promise<OrgMember[]> => {
  const cacheKey = `org-${org}-members-with-names`;
  const { data: cachedMembers, stale } = await readCache<OrgMember[]>(cacheKey, MEMBERS_CACHE_TTL);
  if (cachedMembers && !stale) {
    console.log(`Cache hit (fresh) for members of org: ${org}`);
    return cachedMembers;
  }
  console.log(`Fetching fresh members for org: ${org} (Cache was ${cachedMembers ? 'stale' : 'missing'})`);
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
    return membersWithNames; // Return fresh data
  } catch (error) {
    handleOctokitError(error, `Error fetching members for org ${org}`);
    throw new Error('Failed to fetch org members after handling potential specific errors.'); 
  }
};

/**
 * Fetches repositories for a GitHub organization.
 * Handles SAML SSO redirection errors.
 * Uses caching.
 */
export const getOrgRepos = async (org: string): Promise<{ name: string }[]> => {
    const cacheKey = `org-${org}-repos`;
    const { data: cachedRepos, stale } = await readCache<{ name: string }[]>(cacheKey, REPOS_CACHE_TTL);
    if (cachedRepos && !stale) {
       console.log(`Cache hit for repos of org: ${org} ${stale ? '(stale)' : ''}`);
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
export const getOrgMemberCommits = async (org: string, targetRepos: string[], since?: string, until?: string): Promise<any[]> => {
  // Generate a cache key based on parameters
  // Sort targetRepos to ensure cache key consistency if order changes but content doesn't
  const repoKeyPart = [...targetRepos].sort().join('_');
  const sinceKeyPart = since ? new Date(since).toISOString().split('T')[0] : 'start'; // Use date part
  const untilKeyPart = until ? new Date(until).toISOString().split('T')[0] : 'now'; // Use date part
  const cacheKey = `org-${org}-commits-repos_${repoKeyPart}-since_${sinceKeyPart}-until_${untilKeyPart}`;

  // Correctly destructure readCache result
  const { data: cachedCommits, stale, timestamp } = await readCache<any[]>(cacheKey, COMMITS_CACHE_TTL);
  if (cachedCommits && !stale) {
    console.log(`Cache hit for aggregated org commits: ${cacheKey}`);
    return cachedCommits;
  }

  console.log(`Cache miss for aggregated org commits: ${cacheKey}. Fetching from API...`);

  let orgMembers: OrgMember[] = [];
  try {
    orgMembers = await getOrgMembers(org);
  } catch (error) {
    console.error(`Failed to get org members for ${org}, cannot fetch commits.`);
    throw error; 
  }
  const memberLogins = new Set(orgMembers.map(m => m.login.toLowerCase()));

  // Directly use targetRepos, remove the 'fetch all' logic
  const reposToScan = targetRepos;
  console.log(`Using specified target repositories: ${reposToScan.join(', ')}`);
  
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
export const searchUserCommits = async (org: string, username: string, targetRepos: string[], since?: string): Promise<any[]> => {
    const repoQualifier = targetRepos.map(repo => `repo:${org}/${repo}`).join(' ');
    const dateQualifier = since ? `committer-date:>${since}` : '';
    const query = `author:${username} ${repoQualifier} ${dateQualifier}`;
    const cacheKey = `user-${username}-commits-query_${Buffer.from(query).toString('base64')}`;
    
    const { data: cachedData, stale } = await readCache<any[]>(cacheKey, USER_ACTIVITY_CACHE_TTL);
    if (cachedData && !stale) {
        console.log(`Cache hit for user commits: ${username} ${stale ? '(stale)' : ''}`);
        return cachedData;
    }
    console.log(`Cache miss for user commits: ${username}. Query: ${query}`);
    try {
        const results = await octokit.paginate(octokit.search.commits, { q: query, sort: 'committer-date', order: 'desc', per_page: 100 });
        await writeCache(cacheKey, results);
        return results;
    } catch (error) {
        handleOctokitError(error, `Error searching commits for user ${username}`);
        throw new Error('Unhandled error in searchUserCommits after error handler.');
    }
};

/**
 * Searches for PRs created by a specific author within an org and optional repos.
 */
export const searchUserPRsAuthored = async (org: string, username: string, targetRepos: string[], since?: string): Promise<any[]> => {
    const repoQualifier = targetRepos.map(repo => `repo:${org}/${repo}`).join(' ');
    const dateQualifier = since ? `created:>${since}` : '';
    const query = `is:pr author:${username} ${repoQualifier} ${dateQualifier}`;
    const cacheKey = `user-${username}-prs_authored-query_${Buffer.from(query).toString('base64')}`;

    const { data: cachedData, stale } = await readCache<any[]>(cacheKey, USER_ACTIVITY_CACHE_TTL);
    if (cachedData && !stale) {
        console.log(`Cache hit for user PRs authored: ${username} ${stale ? '(stale)' : ''}`);
        return cachedData;
    }
    console.log(`Cache miss for user PRs authored: ${username}. Query: ${query}`);
    try {
        const results = await octokit.paginate(octokit.search.issuesAndPullRequests, {
             q: query, sort: 'created', order: 'desc', per_page: 100,
        });
        await writeCache(cacheKey, results);
        return results;
    } catch (error) {
        handleOctokitError(error, `Error searching PRs authored by ${username}`);
        throw new Error('Unhandled error in searchUserPRsAuthored after error handler.');
    }
};

/**
 * Searches for issues created by a specific author within an org and optional repos.
 */
export const searchUserIssuesAuthored = async (org: string, username: string, targetRepos: string[], since?: string): Promise<any[]> => {
    const repoQualifier = targetRepos.map(repo => `repo:${org}/${repo}`).join(' ');
    const dateQualifier = since ? `created:>${since}` : '';
    const query = `is:issue author:${username} ${repoQualifier} ${dateQualifier}`;
    const cacheKey = `user-${username}-issues_authored-query_${Buffer.from(query).toString('base64')}`;

    const { data: cachedData, stale } = await readCache<any[]>(cacheKey, USER_ACTIVITY_CACHE_TTL);
    if (cachedData && !stale) {
        console.log(`Cache hit for user issues authored: ${username} ${stale ? '(stale)' : ''}`);
        return cachedData;
    }
    console.log(`Cache miss for user issues authored: ${username}. Query: ${query}`);
    try {
        const results = await octokit.paginate(octokit.search.issuesAndPullRequests, {
            q: query, sort: 'created', order: 'desc', per_page: 100,
        });
        await writeCache(cacheKey, results);
        return results;
    } catch (error) {
        handleOctokitError(error, `Error searching issues authored by ${username}`);
        throw new Error('Unhandled error in searchUserIssuesAuthored after error handler.');
    }
};

/**
 * Searches for PR comments made by a specific user within an org and optional repos.
 */
export const searchUserPRComments = async (org: string, username: string, targetRepos: string[], since?: string): Promise<any[]> => {
    const repoQualifier = targetRepos.map(repo => `repo:${org}/${repo}`).join(' ');
    const dateQualifier = since ? `created:>${since}` : '';
    const query = `is:pr commenter:${username} ${repoQualifier} ${dateQualifier}`;
    const cacheKey = `user-${username}-pr_comments-query_${Buffer.from(query).toString('base64')}`;

    const { data: cachedData, stale } = await readCache<any[]>(cacheKey, USER_ACTIVITY_CACHE_TTL);
    if (cachedData && !stale) {
        console.log(`Cache hit for user PR comments: ${username} ${stale ? '(stale)' : ''}`);
        return cachedData;
    }
    console.log(`Cache miss for user PR comments: ${username}. Query: ${query}`);
    try {
        const results = await octokit.paginate(octokit.search.issuesAndPullRequests, { 
            q: query, sort: 'created', order: 'desc', per_page: 100,
        });
        await writeCache(cacheKey, results);
        return results;
    } catch (error) {
        handleOctokitError(error, `Error searching PR comments by ${username}`);
        throw new Error('Unhandled error in searchUserPRComments after error handler.');
    }
};

// Define type for aggregated org activity data
export interface OrgActivityData {
    activityByUser: { 
        [login: string]: UserActivitySummary; 
    };
    members: OrgMember[];
}

// Define UserActivitySummary for export
export interface UserActivitySummary {
    commitCount: number; 
    prAuthoredCount: number; 
    issueAuthoredCount: number; 
    prCommentCount: number; 
}

/**
 * Fetches comprehensive activity data for all org members.
 */
export const getOrgActivityData = async (org: string, targetRepos: string[], since?: string, until?: string): Promise<OrgActivityData> => {
    const cacheKey = `org-${org}-activity-repos_${[...targetRepos].sort().join('_')}-since_${since ? new Date(since).toISOString().split('T')[0] : 'start'}-until_${until ? new Date(until).toISOString().split('T')[0] : 'now'}`;
    const { data: cachedData, stale } = await readCache<OrgActivityData>(cacheKey, ORG_ACTIVITY_CACHE_TTL);
    if (cachedData && !stale) {
        console.log(`Cache hit for org activity: ${cacheKey}`);
        return cachedData;
    }
    console.log(`Cache miss for org activity: ${cacheKey}. Fetching from API...`);
    
    // Fetch all parts. Errors will propagate and be caught by the API handler.
    const members = await getOrgMembers(org);
    const memberLogins = members.map(m => m.login);

    const activityPromises = memberLogins.map(login => 
        Promise.all([
            searchUserCommits(org, login, targetRepos, since), 
            searchUserPRsAuthored(org, login, targetRepos, since),
            searchUserIssuesAuthored(org, login, targetRepos, since),
            searchUserPRComments(org, login, targetRepos, since),
        ])
    );
    const memberActivities = await Promise.all(activityPromises);

    const activityByUser = memberActivities.reduce((acc, activityResult, index) => {
        // Get the corresponding member login for this set of results
        const loginLower = members[index].login.toLowerCase(); 
        acc[loginLower] = {
            commitCount: activityResult[0].length, // Commits
            prAuthoredCount: activityResult[1].length, // PRs Authored
            issueAuthoredCount: activityResult[2].length, // Issues Authored
            prCommentCount: activityResult[3].length, // PR Comments
        };
        return acc;
    }, {} as { [key: string]: UserActivitySummary });

    const result: OrgActivityData = { activityByUser, members };
    await writeCache(cacheKey, result);
    console.log(`Finished fetching and caching org activity data for ${org}.`);
    return result;
};

export default octokit; // Export the initialized client if needed elsewhere 