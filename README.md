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

Configuration is managed through environment variables loaded from a `.env` file in the project root (`/Users/doug/Code/pulse-point`).

1.  **Create the `.env` file:**
    Create a file named `.env` in the root directory of the project.

2.  **Add Required Tokens:**
    Add the following lines to your `.env` file, replacing the placeholder values with your actual API tokens:

    ```dotenv
    # GitHub Personal Access Token (PAT) with appropriate permissions (e.g., repo scope)
    GITHUB_TOKEN=your_github_pat_here

    # Slack Bot Token (required for Slack integration)
    # SLACK_BOT_TOKEN=your_slack_bot_token_here

    # Add other tokens/secrets as needed for Linear, Notion, etc.
    ```

3.  **Important Security Note:**
    The `.gitignore` file is already configured to ignore `.env` files. **Never commit your `.env` file** containing secrets to version control.

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