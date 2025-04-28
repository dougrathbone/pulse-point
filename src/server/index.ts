import express, { Request, Response, NextFunction } from 'express';
import path from 'path'; // Import path module
import * as githubService from './services/githubService'; // Import GitHub service
import { SamlSsoError } from './services/githubService'; // Import the custom error
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

// Define the async handler function for organization commits
const handleGetOrgCommits = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { since, until } = req.query;

  if (!TARGET_ORG) {
    const err = new Error('TARGET_ORG not configured in settings.ts');
    (err as any).status = 400;
    return next(err);
  }

  // Remove the incorrect check for TARGET_REPOS length
  // The service layer (getOrgMemberCommits) will handle fetching all repos if TARGET_REPOS is empty/null.
  // if (!TARGET_REPOS || TARGET_REPOS.length === 0) {
  //     const err = new Error('TARGET_REPOS must be configured in settings.ts with at least one repository.');
  //     (err as any).status = 400;
  //     return next(err);
  // }

  try {
    // Determine repo list to log correctly
    const repoList = (TARGET_REPOS && TARGET_REPOS.length > 0) ? TARGET_REPOS.join(', ') : '(all org repos)';
    console.log(`Fetching commits for org: ${TARGET_ORG}, Repos: ${repoList}`);
    
    // Fetch commits for the org members across the specified repos (or all if TARGET_REPOS is empty/null)
    const orgCommits = await githubService.getOrgMemberCommits(
        TARGET_ORG,
        TARGET_REPOS, // Pass the configured list (can be null or empty)
        since as string | undefined,
        until as string | undefined
    );
    
    // Group commits by author
    const commitsByAuthor = orgCommits.reduce((acc: { [key: string]: any[] }, commit) => {
      const authorLogin = commit.author?.login.toLowerCase();
      if (authorLogin) {
        if (!acc[authorLogin]) {
          acc[authorLogin] = [];
        }
        acc[authorLogin].push(commit);
      }
      return acc;
    }, {});
    
    // Also return the list of members found, useful for the frontend
    // getOrgMembers is now cached, so calling it again here is usually fast
    const members = await githubService.getOrgMembers(TARGET_ORG);
    // No need to map here, pass the full member objects
    // const memberLogins = members.map(m => m.login);

    res.json({ commitsByAuthor, members: members }); // Pass full member objects

  } catch (error) {
    // Check if it's our specific SAML SSO error
    if (error instanceof SamlSsoError) {
        // Send a specific response format for the frontend to handle
        res.status(error.status).json({
            ssoRequired: true,
            ssoUrl: error.ssoUrl,
            message: error.message,
        });
    } else {
        // Pass other errors to the default error handler
        console.error("API Error fetching org commits:", error);
        next(error); 
    }
  }
};

// Define the async handler function for user details
const handleGetUserDetails = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { username } = req.params;
    const { since, until } = req.query;

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
        
        // Fetch data concurrently
        const [commits, issuesAndPRs] = await Promise.all([
            githubService.searchUserCommits(TARGET_ORG, username, TARGET_REPOS, since as string | undefined, until as string | undefined),
            githubService.searchUserIssuesAndPRs(TARGET_ORG, username, TARGET_REPOS, since as string | undefined, until as string | undefined)
        ]);

        // TODO: Add call to Claude API summarization service here
        const aiSummary = `AI summary for ${username} is pending implementation.`;

        res.json({ 
            username,
            commits, 
            issuesAndPRs, 
            aiSummary 
        });

    } catch (error) {
        // Handle SAML error specifically if needed (might occur on search too)
        if (error instanceof SamlSsoError) {
            res.status(error.status).json({
                ssoRequired: true,
                ssoUrl: error.ssoUrl,
                message: error.message,
            });
        } else {
            console.error(`API Error fetching details for user ${username}:`, error);
            next(error); 
        }
    }
};

// Update API route to use the new handler
app.get('/api/org/commits', handleGetOrgCommits);
app.get('/api/user/:username/details', handleGetUserDetails); // Add new route

// Remove old team commit handler/route
// app.get('/api/team/commits', handleGetTeamCommits);

// Remove old generic GitHub endpoints
// app.get('/api/github/:owner/:repo/commits', ...);
// app.get('/api/github/:owner/:repo/pulls', ...);

// Remove root index.html serving - Vite handles this
// app.get('/', ...);

// General error handler - this remains mostly the same
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // Avoid sending SAML error details through the generic handler if already handled
  if (err instanceof SamlSsoError) {
      // Already handled, but log just in case it somehow reaches here
      console.error("SAML SSO Error passed to generic handler:", err.message);
      // Ensure response isn't sent twice
      if (!res.headersSent) {
          res.status(err.status).json({ message: err.message, ssoRequired: true, ssoUrl: err.ssoUrl });
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