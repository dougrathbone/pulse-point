import express, { Request, Response } from 'express';
import path from 'path'; // Import path module
import * as githubService from './services/githubService'; // Import GitHub service

const app = express();
const port = process.env.PORT || 3001; // Use environment variable or default

// Middleware to parse JSON request bodies (optional but good practice)
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '..', '..', 'public'))); // Adjust path relative to dist/server

app.get('/api/hello', (req: Request, res: Response) => {
  res.json({ message: 'Hello from the PulsePoint server!' });
});

// GitHub API Routes
app.get('/api/github/:owner/:repo/commits', async (req: Request, res: Response) => {
  const { owner, repo } = req.params;
  const { since, until, page, per_page } = req.query; // Extract query params

  try {
    const commits = await githubService.getCommits(
        owner,
        repo,
        since as string | undefined,
        until as string | undefined,
        per_page ? parseInt(per_page as string, 10) : undefined,
        page ? parseInt(page as string, 10) : undefined
    );
    res.json(commits);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching commits', error });
  }
});

app.get('/api/github/:owner/:repo/pulls', async (req: Request, res: Response) => {
  const { owner, repo } = req.params;
  const { state, page, per_page } = req.query;

  try {
    const pullRequests = await githubService.getPullRequests(
        owner,
        repo,
        state as 'open' | 'closed' | 'all' | undefined,
        per_page ? parseInt(per_page as string, 10) : undefined,
        page ? parseInt(page as string, 10) : undefined
    );
    res.json(pullRequests);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pull requests', error });
  }
});

// Serve index.html for the root route
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

// Basic error handling
app.use((err: Error, req: Request, res: Response, next: Function) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
}); 