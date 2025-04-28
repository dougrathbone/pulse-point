import express, { Request, Response, NextFunction } from 'express';
import path from 'path'; // Import path module
import * as githubService from './services/githubService'; // Import GitHub service
import { SamlSsoError, RateLimitError } from './services/githubService'; // Import both custom errors
import { TARGET_ORG, TARGET_REPOS } from '../../settings'; // Update path

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

  try {
    const repoList = (TARGET_REPOS && TARGET_REPOS.length > 0) ? TARGET_REPOS.join(', ') : '(all org repos)';
    console.log(`Fetching dashboard data for org: ${TARGET_ORG}, Repos: ${repoList}`);
    
    // Call the service function which handles caching and stale data internally
    const orgActivityResult = await githubService.getOrgActivityData(
        TARGET_ORG, TARGET_REPOS, sinceISO, untilISO
    );
    
    // Pass the entire result (which includes isStale and error flags if stale) 
    res.json(orgActivityResult);

  } catch (error) {
    // Handle errors NOT caught by the service layer's stale cache logic
    // (e.g., initial member fetch fails AND no stale cache exists)
    if (error instanceof SamlSsoError) {
        res.status(error.status).json({ ssoRequired: true, ssoUrl: error.ssoUrl, message: error.message });
    } else if (error instanceof RateLimitError) {
         res.status(error.status).json({ rateLimitExceeded: true, resetTimestamp: error.resetTimestamp, message: error.message });
    } else {
        console.error("API Error fetching org dashboard data:", error);
        next(error); 
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

        // Assemble final payload - assume data is fresh if we get here
        res.json({ 
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
            isStale: false // Mark as fresh data
        });

    } catch (error) {
         // Handle errors from the Promise.all or calculations
         if (error instanceof SamlSsoError) {
            res.status(error.status).json({ ssoRequired: true, ssoUrl: error.ssoUrl, message: error.message });
        } else if (error instanceof RateLimitError) {
             res.status(error.status).json({ rateLimitExceeded: true, resetTimestamp: error.resetTimestamp, message: error.message });
        } else {
            console.error(`API Error fetching details for user ${username}:`, error);
            next(error); 
        }
        // NOTE: We are currently NOT attempting to serve stale data for the *entire* user detail page 
        // if *any* of the concurrent fetches fail after a cache miss.
        // Implementing that would require more complex logic to combine potentially stale partial results.
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