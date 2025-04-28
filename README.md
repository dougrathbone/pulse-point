# PulsePoint - Team Performance Tracker

This application helps track and analyze team performance by integrating with services like GitHub and Slack.

## Prerequisites

*   Node.js (v18 or later recommended)
*   npm (usually comes with Node.js)

## Installation

1.  Clone the repository:
    ```bash
    git clone <your-repo-url>
    cd pulse-point
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```

## Configuration

Configuration is managed through two main places:

1.  **Environment Variables (`.env` file):** For secrets like API tokens.
2.  **Settings File (`src/config/settings.ts`):** For non-secret application settings like the target organization and repositories.

### 1. Environment Variables (`.env`)

Create a file named `.env` in the project root (`/Users/doug/Code/pulse-point`). Add the following lines, replacing the placeholder values with your actual API tokens:

```dotenv
# GitHub Personal Access Token (PAT)
# - Required scopes: read:org (to list members), repo (to access repo commits)
# - Ensure the token user is a member of the TARGET_ORG.
GITHUB_TOKEN=your_github_pat_here

# Slack Bot Token (add later)
# SLACK_BOT_TOKEN=your_slack_bot_token_here

# Claude API Key (for AI summaries - add later)
# CLAUDE_API_KEY=your_claude_api_key_here

# Other secrets...
```
**Important:** Never commit your `.env` file to version control.

### 2. Settings File (`src/config/settings.ts`)

Modify the `src/config/settings.ts` file to specify the target GitHub organization and optionally specific repositories:

```typescript
// Target GitHub Organization login name
export const TARGET_ORG: string = "YOUR_ORG_NAME"; // <<< REPLACE THIS

// Optional: List specific repositories within the org to analyze.
// If set to null or an empty array [], the application will attempt to 
// fetch and analyze all accessible repositories within the organization.
export const TARGET_REPOS: string[] | null = []; // Example: Use [] or null for all repos, or ["repo1", "repo2"] for specific ones.
```

## Running the Application

### Development

To run both the backend server and the frontend Vite development server concurrently with hot-reloading:

```bash
npm run dev
```

*   The backend API server will run on `http://localhost:3001`.
*   The frontend development server will run on `http://localhost:3000`.

Access the application in your browser at `http://localhost:3000`.

### Production

1.  **Build the application:**
    This compiles the TypeScript backend and bundles the frontend React app.
    ```bash
    npm run build
    ```
    The build output will be in the `dist/` directory (`dist/server` for backend, `dist/client` for frontend).

2.  **Start the server:**
    This runs the compiled Node.js server.
    ```bash
    npm run start
    ```
    The application will be served from `http://localhost:3001` (or the port specified by the `PORT` environment variable). 