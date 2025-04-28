import express, { Request, Response, NextFunction } from 'express';
import path from 'path'; // Import path module
import * as githubService from './services/githubService'; // Import GitHub service
import { SamlSsoError, RateLimitError } from './services/githubService'; // Import both custom errors
import { TARGET_ORG, TARGET_REPOS, CACHE_MAX_AGE_HOURS } from '../../settings'; // Update path
import { readCache, writeCache } from './utils/cache';

const app = express();
const port = process.env.PORT || 3001; // Use environment variable or default

// Middleware to parse JSON request bodies (optional but good practice)
app.use(express.json());

// Remove static file serving - Vite handles this in dev
// app.use(express.static(path.join(__dirname, '..', '..', 'public')));

app.get('/api/hello', (req: Request, res: Response) => {
  res.json({ message: 'Hello from the PulsePoint server!' });
});

// Define the async handler function for organization dashboard data
const handleGetOrgDashboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 30);
  const sinceISO = (req.query.since as string) || sinceDate.toISOString();
  const untilISO = req.query.until as string | undefined;

  if (!TARGET_ORG) {
    const err = new Error('TARGET_ORG not configured in settings.ts');
    (err as any).status = 400;
    return next(err);
  }

  // Define cache key
  const repoKeyPart = TARGET_REPOS ? TARGET_REPOS.join(',') : '(all org repos)';
  const sinceKeyPart = sinceISO.replace(/[-:]/g, '');
  const untilKeyPart = untilISO ? untilISO.replace(/[-:]/g, '') : '';
  const cacheKey = `org-${TARGET_ORG}-activity-repos_${repoKeyPart}-since_${sinceKeyPart}-until_${untilKeyPart}`;
  const dailyCacheMaxAgeMs = CACHE_MAX_AGE_HOURS * 60 * 60 * 1000;

  // --- Initial Daily Cache Check --- 
  try {
    const { data: dailyCachedData, timestamp: dailyTimestamp } = await readCache<githubService.OrgActivityData>(cacheKey, dailyCacheMaxAgeMs);
    if (dailyCachedData) {
        console.log(`Cache hit (within ${CACHE_MAX_AGE_HOURS} hours) for org dashboard.`);
        // Structure the response as if it were fresh
         const dashboardData = {
            members: dailyCachedData.members,
            activityByUser: dailyCachedData.activityByUser
         };
        res.json({ ...dashboardData, isStale: false, timestamp: dailyTimestamp }); // Send response without return
        return; // Exit the handler after sending response
    }
  } catch (cacheReadError) {
      console.error("Initial cache read failed:", cacheReadError);
      // Proceed to fetch fresh data if initial read fails
  }
  // --- End Initial Check --- 

  console.log(`No suitable daily cache found, fetching fresh data for org dashboard...`);
  try {
    const repoList = TARGET_REPOS ? TARGET_REPOS.join(', ') : '(all org repos)';
    console.log(`Fetching dashboard data for org: ${TARGET_ORG}, Repos: ${repoList}`);
    
    // Call the service function (throws error on fail, only returns fresh data)
    const orgActivityData = await githubService.getOrgActivityData(
        TARGET_ORG, TARGET_REPOS, sinceISO, untilISO
    );
    
    // Send fresh data
    res.json({ ...orgActivityData, isStale: false });

  } catch (error) {
    console.warn("API Error encountered, attempting to serve stale cache:", error instanceof Error ? error.message : error);
    // Attempt stale read on error
    try {
        const { data: staleData, timestamp } = await readCache<githubService.OrgActivityData>(cacheKey, Infinity);
        if (staleData) {
             // Structure response with stale data and error context
             const errorPayload = {
                 message: error instanceof Error ? error.message : error,
                 isStale: true,
                 timestamp: timestamp
             };
             res.status(200).json({ ...staleData, isStale: true, error: errorPayload, timestamp });
        } else {
             // No stale data available, handle original error
             if (error instanceof SamlSsoError) {
                 res.status(error.status).json({ ssoRequired: true, ssoUrl: error.ssoUrl, message: error.message });
             } else if (error instanceof RateLimitError) {
                  res.status(error.status).json({ rateLimitExceeded: true, resetTimestamp: error.resetTimestamp, message: error.message });
             } else {
                 next(error); // Pass original API error
             }
        }
    } catch (cacheReadError) {
        next(error); // Error reading cache, pass original API error
    }
  }
};

// Define the async handler function for user details
const handleGetUserDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { username } = req.params;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 30); 
    const sinceISO = (req.query.since as string) || sinceDate.toISOString();
    const untilISO = req.query.until as string | undefined;

    if (!TARGET_ORG) {
        const err = new Error('TARGET_ORG not configured in settings.ts');
        (err as any).status = 400;
        return next(err);
    }
    if (!username) {
        const err = new Error('Username parameter is missing.');
        (err as any).status = 400;
        return next(err);
    }

    // Define cache key
    const cacheKey = `user-${username}-details-since_${sinceISO.replace(/[-:]/g, '')}-until_${untilISO ? untilISO.replace(/[-:]/g, '') : ''}`;
    const dailyCacheMaxAgeMs = CACHE_MAX_AGE_HOURS * 60 * 60 * 1000;

    // --- Initial Daily Cache Check --- 
    try {
        const { data: dailyCachedDetails, timestamp } = await readCache<any>(cacheKey, dailyCacheMaxAgeMs);
        if (dailyCachedDetails) {
            console.log(`Cache hit (within ${CACHE_MAX_AGE_HOURS} hours) for user details: ${username}`);
            res.json({ ...dailyCachedDetails, isStale: false, timestamp }); // Send response without return
            return; // Exit the handler
        }
    } catch (cacheReadError) {
        console.error("Initial user detail cache read failed:", cacheReadError);
    }
    // --- End Initial Check --- 

    console.log(`No suitable daily cache found, fetching fresh details for user: ${username}...`);
    try {
        console.log(`Fetching details for user: ${username}, Org: ${TARGET_ORG}`);
        
        // Fetch all required data concurrently using service functions
        // These functions handle their own caching and stale-on-error logic
        const [userCommits, userPRsAuthored, userIssuesAuthored, userPRComments, allOrgCommitsData] = await Promise.all([
            githubService.searchUserCommits(TARGET_ORG, username, TARGET_REPOS, sinceISO),
            githubService.searchUserPRsAuthored(TARGET_ORG, username, TARGET_REPOS, sinceISO),
            githubService.searchUserIssuesAuthored(TARGET_ORG, username, TARGET_REPOS, sinceISO),
            githubService.searchUserPRComments(TARGET_ORG, username, TARGET_REPOS, sinceISO),
            githubService.getOrgMemberCommits(TARGET_ORG, TARGET_REPOS, sinceISO, untilISO)
        ]);
        
        // Calculate totals
        const totalOrgCommits = allOrgCommitsData.length;
        // TODO: Add fetching/calculation for total Org PRs/Issues/Comments for comparison
        const totalOrgPRs = 0; // Placeholder
        const totalOrgIssues = 0; // Placeholder
        const totalOrgPRComments = 0; // Placeholder

        // Calculate PR Turnaround Time (in hours)
        let totalTurnaroundMs = 0;
        let closedPrCount = 0;
        userPRsAuthored.forEach((pr: any) => { // Use specific type later
            if (pr.closed_at && pr.created_at) {
                totalTurnaroundMs += new Date(pr.closed_at).getTime() - new Date(pr.created_at).getTime();
                closedPrCount++;
            }
        });
        const avgTurnaroundHours = closedPrCount > 0 ? (totalTurnaroundMs / closedPrCount / (1000 * 60 * 60)) : null;

        // Placeholder for avg comments before shipping
        const avgCommentsBeforeShipping = 0; 

        // Placeholder for AI summary
        const aiSummary = `AI summary for ${username} is pending implementation.`;

        // Assemble payload - mark as fresh
        const responsePayload = { 
            username,
            summary: {
                commitCount: userCommits.length,
                prAuthoredCount: userPRsAuthored.length,
                issueAuthoredCount: userIssuesAuthored.length,
                prCommentCount: userPRComments.length,
                avgTurnaroundHours: avgTurnaroundHours, // Add turnaround time
                avgCommentsBeforeShipping: avgCommentsBeforeShipping,
                // Comparative data placeholders
                totalOrgCommitCount: totalOrgCommits, 
                totalOrgPRCount: totalOrgPRs, // Placeholder
                totalOrgIssueCount: totalOrgIssues, // Placeholder
            },
            commits: userCommits, 
            pullRequestsAuthored: userPRsAuthored,
            issuesAuthored: userIssuesAuthored,
            pullRequestCommentsMade: userPRComments,
            aiSummary,
            isStale: false // Mark as fresh
        };
        await writeCache(cacheKey, responsePayload);
        res.json({ ...responsePayload, isStale: false });

    } catch (error) {
        console.warn(`API Error fetching details for ${username}, attempting stale cache...`);
        // Attempt stale read on error
        try {
            const { data: staleDetails, timestamp } = await readCache<any>(cacheKey, Infinity);
            if (staleDetails) {
                 const errorPayload = {
                     message: error instanceof Error ? error.message : error,
                     isStale: true,
                     timestamp: timestamp
                 };
                 res.status(200).json({ ...staleDetails, isStale: true, error: errorPayload, timestamp });
            } else {
                 // No stale data, handle original error
                 if (error instanceof SamlSsoError) {
                    res.status(error.status).json({ ssoRequired: true, ssoUrl: error.ssoUrl, message: error.message });
                } else if (error instanceof RateLimitError) {
                     res.status(error.status).json({ rateLimitExceeded: true, resetTimestamp: error.resetTimestamp, message: error.message });
                } else {
                    next(error); // Pass original API error
                }
            }
        } catch(cacheReadError) {
             next(error); // Pass original API error
        }
    }
};

// Update API route to use the new handler for the dashboard
app.get('/api/org/dashboard', handleGetOrgDashboard);
// Remove old /api/org/commits route
// app.get('/api/org/commits', handleGetOrgCommits); 
app.get('/api/user/:username/details', handleGetUserDetails); 

// Remove old team commit handler/route
// app.get('/api/team/commits', handleGetTeamCommits);

// Remove old generic GitHub endpoints
// app.get('/api/github/:owner/:repo/commits', ...);
// app.get('/api/github/:owner/:repo/pulls', ...);

// Remove root index.html serving - Vite handles this
// app.get('/', ...);

// General error handler - this remains mostly the same
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // Check for handled errors first
  if (err instanceof SamlSsoError) {
      // Already handled, but log just in case it somehow reaches here
      console.error("SAML SSO Error passed to generic handler:", err.message);
      // Ensure response isn't sent twice
      if (!res.headersSent) {
          res.status(err.status).json({ message: err.message, ssoRequired: true, ssoUrl: err.ssoUrl });
      }
      return;
  }
  if (err instanceof RateLimitError) {
      // Log rate limit error if it reaches here (should be handled by route handlers)
      console.error("Rate Limit Error passed to generic handler:", err.message);
      if (!res.headersSent) {
          res.status(err.status).json({ message: err.message, rateLimitExceeded: true, resetTimestamp: err.resetTimestamp });
      }
      return;
  }
  
  console.error("Unhandled error:", err?.message || err);
  // Ensure response isn't sent twice
  if (!res.headersSent) {
      res.status(err?.status || 500).json({ 
          message: err?.message || 'Internal Server Error' 
      });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
}); 